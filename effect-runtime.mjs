// Applies supported Riftbound card-text instructions to the shared board.
// Unknown abilities are queued for explicit resolution, never discarded.
// This is not the complete Riot chain/priority/continuous-effect rules engine.
import {compileCardAbilities} from "./effect-engine.mjs";
import {chooseRequiredDiscards} from "./play-effects.mjs";
import {drawMainCards} from "./draw-rules.mjs";
import {effectiveMight} from "./combat-engine.mjs";

const activeZone=zone=>["legend","base","battlefield"].includes(zone);
const unit=c=>String(c.type||"").toLowerCase()==="unit";
const ownerName=p=>p==="ai"?"IA":"Joueur";
// Most triggered abilities happen every time their condition occurs. Only
// text explicitly saying once (or N times) per turn is limited.
const isTracked=ability=>Number.isInteger(ability.perTurnLimit)&&ability.perTurnLimit>0;
function eligibleSources(state,event){
 const {trigger,actor,source,field}=event;
 if(["play","move","die","attack","defend","discard"].includes(trigger))return source?[source]:[];
 let cards=state.cards.filter(c=>c.owner===actor&&activeZone(c.zone));
 if(["hold","conquer"].includes(trigger))
  cards=cards.filter(c=>c.zone==="battlefield"&&c.battlefield===field);
 if(["ally-play","draw"].includes(trigger)&&source)
  cards=cards.filter(c=>c.uid!==source.uid);
 if(["hold","conquer"].includes(trigger)&&Number.isInteger(field)){
  const battlefield=state.battlefields[field]?.card;
  if(battlefield)cards.push({...battlefield,uid:"field-"+field,owner:actor,
   zone:"battlefield",battlefield:field});
 }
 return cards;
}
function makePending(state,source,ability,actor,reason){
 state.pendingEffects??=[];
 if(state.pendingEffects.length>=24)throw Error("Trop d'effets en attente : résolution manuelle requise.");
 // Two matching events can each create a pending ability on the same turn.
 // Never silently coalesce them by source/text alone.
 state.pendingEffects.push({
  id:"eff_"+(state.revision+1)+"_"+(state.effectSerial||0)+"_"+state.pendingEffects.length,
  sourceUid:source.uid||"",cardName:String(source.name||"Carte"),
  player:actor,trigger:ability.trigger,turn:state.turn,optional:Boolean(ability.optional),
  text:String(ability.text||"").slice(0,500),
  reason:String(reason||"Choix ou capacité non automatisée").slice(0,250)
 });
}
function selectTarget(state,kind,source,actor){
 const pool=state.cards.filter(c=>unit(c)&&["base","battlefield"].includes(c.zone));
 const enemy=["damage-enemy","stun-enemy","kill-enemy"].includes(kind);
 const friendly=kind==="buff-friendly";
 let eligible=pool.filter(c=>enemy?c.owner!==actor:friendly?c.owner===actor:true);
 // For flexible choices prefer helpful actions over harming our own units.
 if(["damage-enemy","stun-unit","kill-unit"].includes(kind)){
  const hostile=eligible.filter(c=>c.owner!==actor);
  if(hostile.length)eligible=hostile;
 }
 if(["buff-unit","buff-friendly"].includes(kind)){
  const allies=eligible.filter(c=>c.owner===actor);
  if(allies.length)eligible=allies;
 }
 const value=c=>Number(c.might||0)+Number(c.counters?.tempMight||0)-
  Number(c.damage||0);
 return eligible.sort((a,b)=>{
  if(["buff-unit","buff-friendly"].includes(kind))
   return Number(b.zone==="battlefield")-Number(a.zone==="battlefield")||
    value(b)-value(a)||String(a.uid).localeCompare(String(b.uid));
  if(["stun-unit","stun-enemy","kill-unit","kill-enemy"].includes(kind))
   return value(b)-value(a)||String(a.uid).localeCompare(String(b.uid));
  return value(a)-value(b)||String(a.uid).localeCompare(String(b.uid));
 })[0]||null;
}
function buildSteps(state,source,ability,actor,choices){
 const instructions=[],previous=choices?.discardUids||[];
 if(ability.optional&&actor==="human")
  return {reason:"Effet facultatif : choisis de le résoudre ou de le décliner."};
 if(ability.optional&&actor==="ai"&&ability.steps.some(x=>
    ["discard","exhaust-runes","exhaust-self"].includes(x.kind)))
  return {instructions:[],declined:true};
 const required=ability.steps.filter(x=>x.kind==="discard").reduce((n,x)=>n+x.count,0);
 const selected=previous.length?previous:
  required?chooseRequiredDiscards(state,source.uid,required):[];
 if(selected===null||selected.length!==required||new Set(selected).size!==selected.length)
  return {reason:"Choisis le nombre exact de cartes distinctes à défausser."};
 let discarded=0;
 const reservedDeflect=new Set();
 for(const step of ability.steps){
  let detail={...step};
  if(step.kind==="discard"){
   if(actor!=="ai")return {reason:"Le joueur physique doit choisir et défausser ses cartes cachées."};
   const uids=selected.slice(discarded,discarded+step.count);
   if(!uids||uids.length!==step.count||new Set(uids).size!==uids.length)
    return {reason:"Cartes à défausser insuffisantes ou choix de main incomplet."};
   if(!uids.every(uid=>state.cards.some(c=>c.uid===uid&&c.owner===actor&&
    c.zone==="hand"&&c.uid!==source.uid)))
    return {reason:"Défausse invalide : carte absente de la main de l'IA."};
   detail.uids=uids;discarded+=step.count;
  }
  if(["damage-enemy","buff-unit","buff-friendly","stun-unit",
       "stun-enemy","kill-unit","kill-enemy"].includes(step.kind)){
   const chosen=choices?.targetUid?state.cards.find(c=>c.uid===choices.targetUid):null;
   const target=chosen||(actor==="ai"?selectTarget(state,step.kind,source,actor):null);
   const enemy=["damage-enemy","stun-enemy","kill-enemy"].includes(step.kind);
   const friendly=step.kind==="buff-friendly";
   if(!target||!unit(target)||!["base","battlefield"].includes(target.zone)||
      (enemy&&target.owner===actor)||(friendly&&target.owner!==actor))
    return {reason:"Choisis une unité valide pour cet effet."};
   if(target.owner!==actor&&/\bdeflect\b/i.test(target.text||"")){
    if(actor!=="ai")
     return {reason:"Deflect : le joueur doit payer et confirmer 1 Power pour choisir cette cible."};
    const rune=state.cards.find(r=>r.owner===actor&&r.zone==="runes"&&
     !reservedDeflect.has(r.uid));
    if(!rune)return {reason:"Deflect : aucune rune à recycler pour payer 1 Power."};
    reservedDeflect.add(rune.uid);
    detail.deflectRuneUid=rune.uid;
   }
   detail.targetUid=target.uid;
  }
  if(step.kind==="predict"&&actor==="human")
   return {reason:"Vision/Predict : regarde la prochaine carte physique et choisis si tu la recycles."};
  if(["ready-self","exhaust-self","self-buff","heal-self"].includes(step.kind)&&
   !state.cards.some(c=>c.uid===source.uid))
   return {reason:"Source de l'effet absente du plateau."};
  instructions.push(detail);
 }
 if(discarded!==selected.length)
  return {reason:"Le nombre de cartes défaussées ne correspond pas au texte."};
 return {instructions};
}
function applySteps(state,source,steps,actor,place,deckCard){
 const logs=[];
 for(const step of steps){
  const n=step.count;
  if(step.deflectRuneUid){
   const rune=state.cards.find(c=>c.uid===step.deflectRuneUid);
   if(!rune||rune.zone!=="runes"||rune.owner!==actor)
    throw Error("Rune Deflect invalide après finalisation.");
   state.decks.ai.runes.push(deckCard(rune));
   state.cards=state.cards.filter(c=>c.uid!==rune.uid);
   state.players.ai.runeCount=state.decks.ai.runes.length;
   logs.push("Deflect : 1 Power payé par recyclage de "+rune.name);
  }
  if(step.kind==="discard"){
   const names=[];
   for(const uid of step.uids){
    const card=state.cards.find(c=>c.uid===uid);
    card.zone="trash";card.battlefield=null;card.exhausted=false;
    state.players[actor].handCount--;
    names.push(card.name);
   }
   logs.push("défausse "+names.join(", "));
  }else if(step.kind==="predict"){
   const top=state.decks?.ai?.main?.[0];
   if(actor==="ai"&&top){
    const ready=state.cards.filter(c=>c.owner==="ai"&&c.zone==="runes").length;
    const recycle=Number(top.energy??99)>ready+3;
    if(recycle)state.decks.ai.main.push(state.decks.ai.main.shift());
    logs.push("Vision : regarde la carte du dessus et "+
     (recycle?"la recycle":"la conserve"));
   }
  }else if(step.kind==="channel"||step.kind==="channel-exhausted"){
   let actual=0;
   for(let i=0;i<n;i++){
    if(actor==="ai"){
     const rune=state.decks.ai.runes.shift();if(!rune)break;
     const instance=place(state,actor,rune,"runes",undefined,false,
      "c_effect_rune_"+state.revision+"_"+state.cards.length+"_"+i);
     instance.exhausted=step.kind==="channel-exhausted";
     state.players.ai.runeCount=state.decks.ai.runes.length;
    }else{
     if(state.players.human.runeCount<=0)break;
     const rune=place(state,"human",{code:"PHYSICAL-RUNE",name:"Rune physique",
      type:"Rune"},"runes",undefined,false);
     rune.exhausted=step.kind==="channel-exhausted";
     state.players.human.runeCount--;
    }
    actual++;
   }
   logs.push("canalise "+actual+" rune(s)"+
    (step.kind==="channel-exhausted"?" épuisées":""));
  }else if(step.kind==="draw"){
   const result=drawMainCards(state,actor,n,{place,deckCard});
   logs.push("pioche "+result.actual+" carte(s)"+
    (result.burnOuts?" (Burn Out ×"+result.burnOuts+")":""));
  }else if(step.kind==="ready-runes"||step.kind==="exhaust-runes"){
   const exhaust=step.kind==="exhaust-runes";
   const cards=state.cards.filter(c=>c.owner===actor&&c.zone==="runes"&&
     c.exhausted!==exhaust).slice(0,n);
   cards.forEach(c=>{c.exhausted=exhaust});
   logs.push((exhaust?"épuise ":"redresse ")+cards.length+" rune(s)");
  }else if(step.kind==="heal-self"){
   const c=state.cards.find(c=>c.uid===source.uid);
   c.damage=Math.max(0,(c.damage||0)-n);
   logs.push("soigne "+source.name+" de "+n);
  }else if(step.kind==="self-buff"){
   const c=state.cards.find(c=>c.uid===source.uid);
   c.counters??={};
   c.counters.tempMight=Number(c.counters.tempMight||0)+n;
   logs.push(source.name+" gagne +"+n+" Might ce tour");
  }else if(step.kind==="ready-self"||step.kind==="exhaust-self"){
   const c=state.cards.find(c=>c.uid===source.uid);
   c.exhausted=step.kind==="exhaust-self";
   logs.push(source.name+(c.exhausted?" s'épuise":" se redresse"));
  }else if(step.kind==="buff-unit"||step.kind==="buff-friendly"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   c.counters??={};c.counters.tempMight=Number(c.counters.tempMight||0)+n;
   logs.push(c.name+" gagne +"+n+" Might jusqu'à la fin du tour");
  }else if(step.kind==="stun-unit"||step.kind==="stun-enemy"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   c.stunned=true;c.counters??={};c.counters.stunned=1;
   logs.push(c.name+" est étourdie");
  }else if(step.kind==="kill-unit"||step.kind==="kill-enemy"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   const lastKnown={...c};
   c.zone="trash";c.battlefield=null;c.exhausted=false;c.damage=0;
   logs.push(c.name+" est détruite");
   const triggered=processCardEvent(state,{trigger:"die",actor:c.owner,source:lastKnown},
    {place,deckCard});
   if(triggered.length)logs.push(...triggered);
  }else if(step.kind==="create-units"){
   const destination=step.destination==="here"&&
    source.zone==="battlefield"?"battlefield":"base";
   for(let i=0;i<n;i++){
    const card=place(state,actor,{
     code:"TOKEN-"+step.tokenName.toUpperCase().replace(/[^A-Z0-9]+/g,"-"),
     name:step.tokenName,type:"Unit",energy:0,power:0,might:step.tokenMight,
     tags:["Token"]
    },destination,destination==="battlefield"?source.battlefield:null,false,
     "c_token_"+state.revision+"_"+state.cards.length+"_"+i);
    card.exhausted=true;
   }
   logs.push("crée "+n+" jeton(s) "+step.tokenName+" ("+step.tokenMight+" Might)");
  }else if(step.kind==="damage-enemy"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   if(!c||!unit(c)||!["base","battlefield"].includes(c.zone))
    throw Error("La cible des dégâts a quitté le plateau.");
   // An effect must not silently bypass Shield, printed stat modifiers, or
   // death triggers. Defer to the shared combat stat computation.
   c.damage=(c.damage||0)+n;
   const might=effectiveMight(c,"none",state);
   if(might===null)throw Error("Might inconnue : dégâts non résolus.");
   if(c.damage>=might){
    const lastKnown={...c};
    c.zone="trash";c.battlefield=null;c.exhausted=false;c.damage=0;
    const triggered=processCardEvent(state,{
     trigger:"die",actor:lastKnown.owner,source:lastKnown
    },{place,deckCard});
    logs.push(n+" dégâts à "+c.name+" (unité vaincue)");
    if(triggered.length)logs.push(...triggered);
   }else logs.push(n+" dégâts à "+c.name);
  }
 }
 return logs;
}
export function processCardEvent(state,event,{place,deckCard=card=>card}={}){
 const {trigger,actor}=event;
 if(!["human","ai"].includes(actor)||!trigger)throw Error("Événement de capacité invalide.");
 state.effectWork=(Number(state.effectWork)||0)+1;
 if(state.effectWork>80)throw Error("Chaîne d’effets trop longue (80) : résolution manuelle nécessaire.");
 state.pendingEffects??=[];state.effectMarks??=[];
 state.effectSerial=(Number(state.effectSerial)||0)+1;
 const summaries=[];
 for(const source of eligibleSources(state,event)){
  const compiled=compileCardAbilities(source);
  // Passive, activated and keyword-dependent text needs arbitration whenever
  // the source first enters play. It must never disappear simply because the
  // current interpreter cannot attach it to a specific event yet.
  if(trigger==="play"){
   for(const issue of compiled.unsupported.filter(x=>x.trigger==="other")){
    makePending(state,source,{trigger:"other",text:issue.text,optional:false},
     actor,issue.reason);
   }
  }
  for(const ability of compiled.abilities.filter(a=>a.trigger===trigger)){
   if(ability.condition==="legion"&&
      !(Number(state.turnActions?.played?.[actor])>0))continue;
   if(trigger==="ally-play"&&ability.playedType&&
      ability.playedType!=="card"&&ability.playedType!==
        String(event.source?.type||"").toLowerCase())continue;
   if(isTracked(ability)){
    const key=state.turn+":"+state.active+":"+actor+":"+
      trigger+":"+source.uid+":"+(event.field??"")+":"+ability.text;
    const number=state.effectMarks.filter(x=>x===key).length;
    if(number>=ability.perTurnLimit)continue;
    state.effectMarks.push(key);
    if(state.effectMarks.length>600)state.effectMarks=state.effectMarks.slice(-350);
   }
   if(!ability.supported){
    makePending(state,source,ability,actor,
     compiled.unsupported.find(x=>x.text===ability.text)?.reason);
    continue;
   }
   const plan=buildSteps(state,source,ability,actor,event.choices||{});
   if(plan.reason){makePending(state,source,ability,actor,plan.reason);continue;}
   const logs=applySteps(state,source,plan.instructions,actor,place,deckCard);
   if(logs.length)summaries.push(ownerName(actor)+" · "+source.name+" : "+logs.join(", "));
  }
 }
 return summaries;
}
