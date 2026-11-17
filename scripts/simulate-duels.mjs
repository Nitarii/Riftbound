// Match simulation through the same reducer and AI strategy as the live app.
// The simulated physical player's private state is deliberately kept outside it.
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
import {planAutonomousAITurn,planAIChainAction} from "../ai-turn.mjs";
import {previewCombat} from "../combat-engine.mjs";
import {battlefieldController} from "../battlefield-rules.mjs";
import {decodeCards} from "../catalog.mjs";
import {resolvePrecon} from "../precons.mjs";

const count=Math.max(1,Math.min(2000,Number(process.argv[2])||100));
const source=process.argv[3]?decodeCards(JSON.parse(fs.readFileSync(process.argv[3],"utf8"))):null;
const opponent=process.argv[4]||"zed";
const modes=["passif","occupation","pression"];
const results=Object.fromEntries(modes.map(mode=>[mode,{total:0,finished:0,ai:0,human:0,
 stalls:0,invalid:0,decisions:0,decisionMs:0,spellResolutions:0,blockedBy:{},examples:[]}]));
const card=(name,type="Unit",energy=0,might=2,extra={})=>({code:name,name,type,energy,might,...extra});
const unit=c=>/^unit$/i.test(c.type||"");
const synthetic=(name,seed,domain)=>({
 legend:card(name,"Legend"),champion:card(name+" Champion","Unit",5,6),
 battlefield:card(name+" Battlefield","Battlefield"),
 main:Array.from({length:39},(_,i)=>card(name+" "+i,"Unit",1+(i+seed)%5,1+(i*3+seed)%7)),
 runes:Array.from({length:12},()=>card(domain+" Rune","Rune",0,null,{domains:[domain]})),
 mainIncludesChampion:false
});
function check(state){
 if(state.players.ai.deckCount!==state.decks.ai.main.length||
    state.players.ai.runeCount!==state.decks.ai.runes.length||
    state.players.ai.handCount!==state.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").length)
  throw Error("Comptes IA désynchronisés");
 if(new Set(state.cards.map(c=>c.uid)).size!==state.cards.length)throw Error("Identités dupliquées");
 if(state.finished&&(!state.winner||state.players[state.winner].score<8))throw Error("Victoire incohérente");
}
function game(seed,mode,metrics){
 const random=()=>((seed*2654435761>>>0)%829)/829;
 const human=source?resolvePrecon(source,"shen",random):synthetic("Shen",seed,"Order");
 const ai=source?resolvePrecon(source,opponent,random):synthetic("Zed",seed+1,"Fury");
 const follow=human.main.filter((c,i)=>!source||i!==human.main.findIndex(a=>a.code===human.champion.code));
 const hand=follow.slice(0,4);
 let cursor=hand.length,runeCursor=0;
 let s=createState({seed});
 s=applyCommand(s,{type:"setup-human",legend:human.legend,champion:human.champion,battlefield:human.battlefield});
 s=applyCommand(s,{type:"setup-ai",...ai,mainIncludesChampion:!!source});
 const apply=cmd=>{
  const before=s.players.human.deckCount;
  const active=s.active;
  const reveal=s.pendingEffects[0]?.trigger==="pakaa-reveal"&&cmd.type==="effect-confirm";
  const chainBefore=s.spellChain?.items.filter(item=>!item.ability).map(item=>item.uid)||[];
  s=applyCommand(s,cmd);
  metrics.spellResolutions+=chainBefore.filter(uid=>!s.spellChain?.items.some(item=>item.uid===uid)).length;
  if(s.active!==active||["start","next-turn","effect-confirm"].includes(cmd.type))s=advanceMandatoryTurn(s);
  if(reveal&&!unit(cmd.card))cursor++;
  else if(!cmd.cards)for(let i=0;i<before-s.players.human.deckCount&&cursor<follow.length;i++)hand.push(follow[cursor++]);
  check(s);
 };
 const can=cmd=>{try{return applyCommand(s,cmd);}catch{return null;}};
 function physicalTurn(){
  const unknown=s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.code==="PHYSICAL-RUNE");
  for(const run of unknown)apply({type:"rune-identify",uid:run.uid,domain:human.runes[runeCursor++%human.runes.length].domains[0]});
  if(mode!=="passif"){
   const troops=s.cards.filter(c=>c.owner==="human"&&c.zone==="base"&&unit(c)&&!c.exhausted);
   for(const [index] of s.battlefields.entries()){
    const controller=battlefieldController(s,index);
    if(controller==="human"||!troops.length)continue;
    if(controller===null){
     const cmd={type:"move",uid:troops[0].uid,zone:"battlefield",battlefield:index};
     if(can(cmd)){apply(cmd);return;}
    }else if(mode==="pression"){
     const cmd={type:"combat-attack",player:"human",uids:troops.map(c=>c.uid),battlefield:index};
     const look=can(cmd);
     if(look&&previewCombat(look,index,"human").winner==="human"){apply(cmd);return;}
    }
   }
   const candidates=[...hand].filter(unit).sort((a,b)=>(b.might??0)-(a.might??0));
   for(const card of candidates){
    const cmd={type:"play-physical",card};
    const look=can(cmd);
    if(!look||look.pendingEffects.length)continue;
    const index=hand.indexOf(card);if(index>=0)hand.splice(index,1);
    apply(cmd);return;
   }
  }
  apply({type:"phase",phase:"Ending"});
  if(!s.pendingEffects.length)apply({type:"next-turn"});
 }
 apply({type:"start",player:seed%2?"human":"ai"});
 for(let step=0;step<220;step++){
  if(s.finished){metrics.finished++;metrics[s.winner]++;return;}
  const effect=s.pendingEffects[0];
  if(effect?.trigger==="pakaa-reveal"&&cursor<follow.length){
   apply({type:"effect-confirm",confirm:true,id:effect.id,card:follow[cursor]});continue;
  }
  if(effect?.trigger==="ending-ready-runes"){
   const uids=s.cards.filter(c=>c.owner===effect.player&&c.zone==="runes"&&c.exhausted)
    .slice(0,effect.count).map(c=>c.uid);
   apply({type:"effect-confirm",confirm:true,id:effect.id,uids});continue;
  }
  if(effect?.choice?.kind==="discard-draw"&&hand.length){
   apply({type:"effect-confirm",confirm:true,id:effect.id,card:hand.shift()});continue;
  }
  if(effect?.trigger==="burn"&&effect.player==="human"&&cursor+effect.burnCount<=follow.length){
   apply({type:"effect-confirm",confirm:true,id:effect.id,cards:follow.slice(cursor,cursor+effect.burnCount)});
   cursor+=effect.burnCount;continue;
  }
  if(effect||s.pendingCombat?.warnings?.length){
   const name=effect?.cardName||s.pendingCombat.warnings[0];
   metrics.blockedBy[name]=(metrics.blockedBy[name]||0)+1;break;
  }
  if(s.spellChain){
   apply(s.spellChain.priority==="ai"?planAIChainAction(s):{type:"chain-pass",player:"human"});
  }else if(s.pendingCombat){
   apply(s.pendingCombat.focus==="ai"?planAIChainAction(s):{type:"combat-pass",player:"human"});
  }else if(s.active==="human")physicalTurn();
  else{
   const start=performance.now(),plan=planAutonomousAITurn(s);
   metrics.decisions++;metrics.decisionMs+=performance.now()-start;
   if(plan.error)throw Error(plan.error);
   if(!plan.commands.length)break;
   for(const command of plan.commands)apply(command);
  }
 }
 metrics.stalls++;
 if(metrics.examples.length<3)metrics.examples.push({seed,turn:s.turn,phase:s.phase,message:s.message});
}
for(const mode of modes){
 const metrics=results[mode];
 for(let seed=1;seed<=count;seed++){
  metrics.total++;
  try{game(seed,mode,metrics);}catch(error){
   metrics.invalid++;
   if(metrics.examples.length<3)metrics.examples.push({seed,error:error.message});
  }
 }
 metrics.avgDecisionMs=Number((metrics.decisionMs/Math.max(1,metrics.decisions)).toFixed(2));
 delete metrics.decisionMs;
}
console.log(JSON.stringify({decks:source?"Shen / "+opponent:"fixtures synthétiques",results},null,2));
if(Object.values(results).some(r=>r.invalid||!source&&r.stalls))process.exitCode=1;
