// Applies supported Riftbound card-text instructions to the shared board.
// Unknown abilities are queued for explicit resolution, never discarded.
// This is not the complete Riot chain/priority/continuous-effect rules engine.
import {compileCardAbilities} from "./effect-engine.mjs";
import {chooseRequiredDiscards} from "./play-effects.mjs";

const activeZone=zone=>["legend","base","battlefield"].includes(zone);
const unit=c=>String(c.type||"").toLowerCase()==="unit";
const ownerName=p=>p==="ai"?"IA":"Joueur";
const isTracked=t=>["beginning","ending","hold","conquer","play","die"].includes(t);
function eligibleSources(state,event){
 const {trigger,actor,source,field}=event;
 if(["play","move","die"].includes(trigger))return source?[source]:[];
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
 const existing=state.pendingEffects.find(x=>x.sourceUid===source.uid&&
  x.trigger===ability.trigger&&x.text===ability.text&&x.turn===state.turn);
 if(existing)return;
 state.pendingEffects.push({
  id:"eff_"+(state.revision+1)+"_"+state.pendingEffects.length,
  sourceUid:source.uid||"",cardName:String(source.name||"Carte"),
  player:actor,trigger:ability.trigger,turn:state.turn,optional:Boolean(ability.optional),
  text:String(ability.text||"").slice(0,500),
  reason:String(reason||"Choix ou capacité non automatisée").slice(0,250)
 });
}
function selectTarget(state,kind,source,actor){
 const pool=state.cards.filter(c=>unit(c)&&["base","battlefield"].includes(c.zone));
 if(kind==="damage-enemy"){
  return pool.filter(c=>c.owner!==actor)
   .sort((a,b)=>((Number(a.might)||0)-(Number(a.damage)||0))-
     ((Number(b.might)||0)-(Number(b.damage)||0))||
     String(a.uid).localeCompare(String(b.uid)))[0]||null;
 }
 return null;
}
function buildSteps(state,source,ability,actor,choices){
 const instructions=[],previous=choices?.discardUids||[];
 let discarded=0;
 for(const step of ability.steps){
  let detail={...step};
  if(step.kind==="discard"){
   if(actor!=="ai")return {reason:"Le joueur physique doit choisir et défausser ses cartes cachées."};
   const uids=previous.length?previous.slice(discarded,discarded+step.count):
    chooseRequiredDiscards(state,source.uid,step.count);
   if(!uids||uids.length!==step.count||new Set(uids).size!==uids.length)
    return {reason:"Cartes à défausser insuffisantes ou choix de main incomplet."};
   if(!uids.every(uid=>state.cards.some(c=>c.uid===uid&&c.owner===actor&&
    c.zone==="hand"&&c.uid!==source.uid)))
    return {reason:"Défausse invalide : carte absente de la main de l'IA."};
   detail.uids=uids;discarded+=step.count;
  }
  if(step.kind==="damage-enemy"){
   const target=selectTarget(state,step.kind,source,actor);
   if(!target)return {reason:"Cible ennemie absente ; effet à arbitrer."};
   detail.targetUid=target.uid;
  }
  if(["ready-self","exhaust-self","self-buff","heal-self"].includes(step.kind)&&
   !state.cards.some(c=>c.uid===source.uid))
   return {reason:"Source de l'effet absente du plateau."};
  instructions.push(detail);
 }
 if(previous.length&&discarded!==previous.length)
  return {reason:"Le nombre de cartes défaussées ne correspond pas au texte."};
 return {instructions};
}
function applySteps(state,source,steps,actor,place,deckCard){
 const logs=[];
 for(const step of steps){
  const n=step.count;
  if(step.kind==="discard"){
   const names=[];
   for(const uid of step.uids){
    const card=state.cards.find(c=>c.uid===uid);
    card.zone="trash";card.battlefield=null;card.exhausted=false;
    state.players[actor].handCount--;
    names.push(card.name);
   }
   logs.push("défausse "+names.join(", "));
  }else if(step.kind==="draw"){
   let actual=0;
   for(let i=0;i<n;i++){
    if(actor==="ai"){
     const card=state.decks.ai.main.shift();
     if(!card)break;
     place(state,"ai",card,"hand",undefined,false,
      "c_effect_draw_"+state.revision+"_"+source.uid+"_"+i);
     state.players.ai.handCount++;
     state.players.ai.deckCount=state.decks.ai.main.length;
    }else{
     if(state.players.human.deckCount<=0)break;
     state.players.human.handCount++;
     state.players.human.deckCount--;
    }
    actual++;
   }
   logs.push("pioche "+actual+" carte(s)");
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
  }else if(step.kind==="damage-enemy"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   c.damage=(c.damage||0)+n;
   const might=Number(c.might)||0;
   if(might>0&&c.damage>=might){
    c.zone="trash";c.battlefield=null;c.exhausted=false;c.damage=0;
   }
   logs.push(n+" dégâts à "+c.name);
  }
 }
 return logs;
}
export function processCardEvent(state,event,{place,deckCard=card=>card}={}){
 const {trigger,actor}=event;
 if(!["human","ai"].includes(actor)||!trigger)throw Error("Événement de capacité invalide.");
 state.pendingEffects??=[];state.effectMarks??=[];
 const summaries=[];
 for(const source of eligibleSources(state,event)){
  const compiled=compileCardAbilities(source);
  for(const ability of compiled.abilities.filter(a=>a.trigger===trigger)){
   const mark=state.turn+":"+actor+":"+trigger+":"+source.uid+":"+(event.field??"");
   if(isTracked(trigger)&&state.effectMarks.includes(mark))continue;
   if(isTracked(trigger))state.effectMarks.push(mark);
   if(state.effectMarks.length>500)state.effectMarks=state.effectMarks.slice(-250);
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
