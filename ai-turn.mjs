// Deterministic, cost-checked basic Duel turn for the local AI.
// The local language model handles conversation, NOT unchecked game mutations.
import {applyCommand} from "./core.mjs";
import {planRunePayment} from "./rune-payment.mjs";
import {mandatoryPlayEffects,chooseRequiredDiscards} from "./play-effects.mjs";
import {battlefieldController} from "./battlefield-rules.mjs";
import {previewCombat} from "./combat-engine.mjs";
const isUnit=c=>/^unit$/i.test(c?.type||"");
const extraRestrictions=c=>!mandatoryPlayEffects(c).supported;
const own=(view,zone)=>view.cards.filter(c=>c.owner==="ai"&&c.zone===zone);
function emptyBattlefieldTargets(view){
 return (view.battlefields||[]).map((b,i)=>({
  i,enemy:view.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===i&&
   c.owner==="human"&&isUnit(c)).length,
  friendly:view.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===i&&
   c.owner==="ai"&&isUnit(c)).length,
  scored:!!view.scoredFields?.ai?.includes(i)
 })).filter(x=>view.battlefields[x.i].card);
}
function targetForConquest(view){
 return emptyBattlefieldTargets(view)
  .filter(x=>x.enemy===0&&!x.friendly&&!x.scored)
  .sort((a,b)=>a.i-b.i)[0]?.i??null;
}
function targetForReinforcement(view){
 return emptyBattlefieldTargets(view)
  .filter(x=>x.enemy===0&&x.friendly>0)
  .sort((a,b)=>a.friendly-b.friendly||a.i-b.i)[0]?.i??null;
}
export function planAutonomousAITurn(state,{maxUnits=3,maxMoves=5}={}){
 if(!state?.started||state.active!=="ai")return {commands:[],state,summary:""};
 if(state.pendingCombat)return {commands:[],state,summary:"Combat : réactions en attente.",waitingForCombat:true};
 const commands=[];let view=state;
 const enacted=[],refused=[];
 const apply=command=>{view=applyCommand(view,command);commands.push(command);};
 try{
  const first=view.firstPlayer||"human";
  const count=view.turn===1&&first!=="ai"?3:2;
  if(!view.turnActions?.channeled){
   const left=view.decks?.ai?.runes?.length||0;
   if(left>0){
    apply({type:"phase",phase:"Channel"});
    const n=Math.min(count,left);
    apply({type:"channel",player:"ai",count:n});
    enacted.push("canalisé "+n+" runes");
   }
  }
  if(!view.turnActions?.drawn&&view.decks?.ai?.main?.length){
   apply({type:"phase",phase:"Draw"});
   apply({type:"draw",player:"ai",count:1});
   enacted.push("pioché 1 carte");
  }
  if(view.phase!=="Main")apply({type:"phase",phase:"Main"});
  // Ready units already in base are useful now. They should not wait forever
  // while the AI continues playing new units into base.
  let moved=0;
  function moveUncontested(){
   for(const unit of own(view,"base").filter(c=>isUnit(c)&&!c.exhausted)){
    if(moved>=maxMoves)break;
    const field=targetForConquest(view)??targetForReinforcement(view);
    if(field===null)break; // Opponent controls/contests all fields: combat needs arbitration.
    apply({type:"move",uid:unit.uid,zone:"battlefield",battlefield:field});
    enacted.push(unit.name+" → "+view.battlefields[field].card.name);
    moved++;
   }
  }
  moveUncontested();
  // If both fields are occupied, evaluate an actual multi-unit assault. It
  // creates a showdown and pauses the AI turn for the human's reactions.
  function attackDefended(){
   const ready=own(view,"base").filter(c=>isUnit(c)&&!c.exhausted&&
    Number.isFinite(Number(c.might))&&c.might!==null).slice(0,8);
   if(!ready.length)return false;
   const fields=emptyBattlefieldTargets(view).filter(x=>x.enemy>0);
   const options=[];
   for(const field of fields){
    // Start with one unit and expand up to all available attackers. Compare
    // simulated simultaneous combat damage (no reactions assumed).
    const ranked=[...ready].sort((a,b)=>(Number(b.might)||0)-(Number(a.might)||0));
    for(let size=1;size<=ranked.length;size++){
     const units=ranked.slice(0,size);
     try{
      const hypothetical=applyCommand(view,{type:"combat-attack",player:"ai",
       battlefield:field.i,uids:units.map(u=>u.uid)});
      const preview=previewCombat(hypothetical,field.i,"ai");
      if(!preview.ready)continue;
      const enemyDead=preview.damage.filter(c=>c.owner==="human"&&c.dead).length;
      const ownDead=preview.damage.filter(c=>c.owner==="ai"&&c.dead).length;
      const worth=(preview.winner==="ai"?100:0)+enemyDead*9-ownDead*6-units.length;
      if(enemyDead||preview.winner==="ai")options.push({field:field.i,units,worth,preview});
     }catch{}
    }
   }
   options.sort((a,b)=>b.worth-a.worth||a.units.length-b.units.length);
   const best=options[0];
   if(!best)return false;
   apply({type:"combat-attack",player:"ai",battlefield:best.field,
    uids:best.units.map(x=>x.uid)});
   enacted.push("attaqué "+view.battlefields[best.field].card.name+" avec "+
    best.units.map(x=>x.name).join(", ")+" ("+
    best.preview.attackingMight+" Might contre "+best.preview.defendingMight+" avant réactions)");
   return true;
  }
  // Only units with fully known printed costs, including domain-coloured Power,
  // are eligible. Do not guess spells/gear/effects requiring custom timing.
  for(let played=0;played<maxUnits;played++){
   const candidates=[...own(view,"hand"),...own(view,"champion")]
    .filter(c=>isUnit(c)&&!extraRestrictions(c))
    .map(c=>({card:c,payment:planRunePayment(view,"ai",c),
     effect:mandatoryPlayEffects(c)}))
    .map(x=>({...x,discardUids:chooseRequiredDiscards(view,x.card.uid,x.effect.discard)}))
    .filter(x=>!x.payment.error&&x.discardUids!==null);
   if(!candidates.length)break;
   // Prefer useful units with affordable Power cost, so the AI develops a
   // board while preserving the rune economy when two choices are comparable.
   candidates.sort((a,b)=>
    ((b.card.might??0)*2+(b.card.energy??0)-b.payment.power*2)-
    ((a.card.might??0)*2+(a.card.energy??0)-a.payment.power*2)||
    a.payment.power-b.payment.power||
    String(a.card.code).localeCompare(String(b.card.code)));
   const {card,payment,discardUids}=candidates[0];
   const discarded=discardUids.map(uid=>view.cards.find(c=>c.uid===uid)?.name||"carte");
   apply({type:"play-paid",uid:card.uid,zone:"base",discardUids});
   enacted.push("joué "+card.name+" ("+payment.energy+" énergie, "+
    payment.power+" Power / "+payment.recycleUids.length+" rune(s) recyclée(s))"+
    (discarded.length?", puis défaussé "+discarded.join(", ")+" pour son effet":""));
   // Accelerate / an explicit enters-ready instruction allows an immediate move.
   moveUncontested();
  }
  if(!view.pendingCombat)attackDefended();
  const before=state.players.ai.score,after=view.players.ai.score;
  if(after>before)enacted.push("marqué "+(after-before)+" PV par conquête");
  const contested=emptyBattlefieldTargets(view).every(f=>f.enemy>0);
  if(contested&&own(view,"base").some(c=>isUnit(c)&&!c.exhausted)){
   refused.push("Les champs sont défendus : un combat avec réactions doit être résolu avant de compter une conquête.");
  }
  if(!view.pendingCombat){
   apply({type:"phase",phase:"Ending"});
   apply({type:"next-turn"});
  }
  return {commands,state:view,enacted,refused,summary:enacted.join(", ")};
 }catch(error){
  // Do not return a partial turn: the caller commits the entire batch or none.
  return {commands:[],state,error:String(error.message||error),enacted:[],refused:[]};
 }
}
export function planSafeAITurn(state){return planAutonomousAITurn(state).commands;}
export function describeAITurn(result,{english=false}={}){
 if(!result?.commands?.length)return english?
  "I couldn't complete a safe turn; please check the battlefield and card rules.":
  "Je ne peux pas terminer mon tour de manière sûre : vérifie les cartes et les règles.";
 const actions=result.enacted||[];
 const notes=result.refused||[];
 if(result.state?.pendingCombat)return english?
  "I "+(actions.length?actions.join(", "):"declared an attack")+
   ". Combat showdown is open. You may play a reaction or pass; no damage has been dealt yet.":
  "J'ai "+(actions.length?actions.join(", "):"déclaré un assaut")+
   ". Confrontation ouverte : tu peux jouer une réaction ou passer. Les dégâts ne sont pas encore infligés.";
 if(english)return "I "+(actions.length?actions.join(", "):"completed my turn")+
  ". "+(notes.length?"Combat requires your confirmation. ":"")+"Your turn.";
 return "J'ai "+(actions.length?actions.join(", "):"terminé mon tour")+
  ". "+(notes.length?notes.join(" ")+" ":"")+"À toi de jouer.";
}
