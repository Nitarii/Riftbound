// Applies supported Riftbound card-text instructions to the shared board.
// Unknown abilities are queued for explicit resolution, never discarded.
// This is not the complete Riot chain/priority/continuous-effect rules engine.
import {compileCardAbilities} from "./effect-engine.mjs";
import {chooseRequiredDiscards} from "./play-effects.mjs";
import {drawMainCards,burnMainCards} from "./draw-rules.mjs";
import {effectiveMight,deflectValue,OPPOSITE} from "./combat-engine.mjs";
import {planRunePayment} from "./rune-payment.mjs";

const activeZone=zone=>["legend","base","battlefield"].includes(zone);
const unit=c=>String(c.type||"").toLowerCase()==="unit";
export function unitBeforeDeath(state,card){
 const combat=state.pendingCombat;
 const role=combat?.kind==="combat"&&card.zone==="battlefield"&&combat.battlefield===card.battlefield?
  (combat.attacker===card.owner?"attack":"defend"):"none";
 return {...card,wasMighty:effectiveMight(card,role,state)>=5,
  withAlly:state.cards.some(other=>other.uid!==card.uid&&unit(other)&&!other.faceDown&&
  other.owner===card.owner&&activeZone(card.zone)&&other.zone===card.zone&&other.battlefield===card.battlefield)};
}
// Most triggered abilities happen every time their condition occurs. Only
// text explicitly saying once (or N times) per turn is limited.
const isTracked=ability=>Number.isInteger(ability.perTurnLimit)&&ability.perTurnLimit>0;
function eligibleSources(state,event){
 const {trigger,actor,source,field}=event;
 if(["play","move","die","attack","defend","discard"].includes(trigger))return source?[source]:[];
 let cards=state.cards.filter(c=>c.owner===actor&&activeZone(c.zone));
 if(trigger==="opponent-play")cards=cards.filter(c=>c.zone==="battlefield"&&!c.faceDown);
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
function canChooseUnit(card,step,actor,source){
 if(!card||!unit(card)||!["base","battlefield"].includes(card.zone)||card.faceDown||
    step.atBattlefield&&card.zone!=="battlefield"||step.another&&card.uid===source.uid||
    step.here&&(source?.zone!=="battlefield"||card.zone!=="battlefield"||source.battlefield!==card.battlefield)||
    card.owner!==actor&&card.counters?.tempShroud)return false;
 const {kind}=step;
 const enemy=["damage-enemy","stun-enemy","kill-enemy"].includes(kind);
 const friendly=kind==="buff-friendly";
 return enemy?card.owner!==actor:friendly?card.owner===actor:true;
}
function selectTarget(pool,kind,actor,state){
 let eligible=pool;
 // For flexible choices prefer helpful actions over harming our own units.
 if(["damage-enemy","stun-unit","kill-unit"].includes(kind)){
  const hostile=eligible.filter(c=>c.owner!==actor);
  if(hostile.length)eligible=hostile;
 }
 if(["buff-unit","buff-friendly"].includes(kind)){
  const allies=eligible.filter(c=>c.owner===actor);
  if(allies.length)eligible=allies;
 }
 const value=c=>(effectiveMight(c,"none",state)??0)-Number(c.damage||0);
 return eligible.sort((a,b)=>{
  if(["buff-unit","buff-friendly"].includes(kind))
   return Number(b.zone==="battlefield")-Number(a.zone==="battlefield")||
    value(b)-value(a)||String(a.uid).localeCompare(String(b.uid));
  if(["stun-unit","stun-enemy","kill-unit","kill-enemy"].includes(kind))
   return value(b)-value(a)||String(a.uid).localeCompare(String(b.uid));
  return value(a)-value(b)||String(a.uid).localeCompare(String(b.uid));
 })[0]||null;
}
export function prepareCardText(state,source,ability,actor,choices={}){
 const instructions=[];
 if(ability.optional&&actor==="human"&&!choices.accepted)
  return {reason:"Veux-tu mettre cette capacité facultative sur la chaîne ?",choice:{kind:"optional"}};
 if(ability.optional&&actor==="ai"&&ability.steps.some(x=>
    ["discard","exhaust-runes","exhaust-self"].includes(x.kind)))
  return {instructions:[],declined:true};
 const reservedDeflect=new Set();
 let reservedPower=0;
 for(const [index,step] of ability.steps.entries()){
  let detail={...step};
  const chosenUid=choices.targets?.[index]??choices.targetUid;
  if(step.kind==="ready-friendly"){
   const pool=state.cards.filter(c=>unit(c)&&c.owner===actor&&c.uid!==source.uid&&
     c.exhausted&&["base","battlefield"].includes(c.zone));
   if(!pool.length)continue;
   if(actor==="human"&&pool.length!==1&&!chosenUid)return {
    reason:"Choisis quelle autre unité redresser.",choice:{kind:"target",step:index,targetUids:pool.map(c=>c.uid)}};
   const target=chosenUid?pool.find(c=>c.uid===chosenUid):pool.sort((a,b)=>(effectiveMight(b,"none",state)??0)-
    (effectiveMight(a,"none",state)??0))[0];
   if(!target)return {reason:"Choisis une autre unité alliée épuisée."};
   detail.targetUid=target.uid;
  }
  if(["damage-enemy","buff-unit","buff-friendly","stun-unit",
       "stun-enemy","kill-unit","kill-enemy"].includes(step.kind)){
   const pool=state.cards.filter(card=>canChooseUnit(card,step,actor,source));
   if(!pool.length&&!chosenUid)continue;
   const available={...state,cards:state.cards.filter(card=>!reservedDeflect.has(card.uid)),
    powerPool:{...state.powerPool,[actor]:(state.powerPool?.[actor]??0)-reservedPower}};
   const payable=pool.filter(card=>{
    try{return card.owner===actor||!planRunePayment(available,actor,
     {name:source.name,energy:0,extraPower:deflectValue(card,state)}).error;}
    catch{return false;}
   });
   if(!payable.length&&!chosenUid)return {cancelled:true,reason:"aucune cible dont le coût peut être payé"};
   const target=chosenUid?pool.find(c=>c.uid===chosenUid):
    actor==="ai"?selectTarget(payable.length?payable:pool,step.kind,actor,state):null;
   if(!target)
    return {reason:"Choisis une unité valide pour cet effet.",choice:{kind:"target",step:index,
     targetUids:payable.map(c=>c.uid)}};
   let deflect=0;
   try{if(target.owner!==actor)deflect=deflectValue(target,state);}
   catch(error){return {reason:error.message};}
   if(deflect){
    const payment=planRunePayment(available,actor,{name:source.name,energy:0,extraPower:deflect});
    if(payment.error)return {reason:"Deflect : "+payment.error};
    for(const uid of [...payment.recycleUids,...payment.goldUids])reservedDeflect.add(uid);
    reservedPower+=payment.poolPower;
    detail.deflectPower=deflect;
   }
   detail.targetUid=target.uid;
  }
  instructions.push(detail);
 }
 return {instructions};
}
export function payCardText(instructions,actor,source,runtime){
 const logs=[];
 for(const step of instructions)if(step.deflectPower){
  const paid=runtime.pay(actor,{name:source.name,energy:0,extraPower:step.deflectPower});
  logs.push("Deflect : "+paid.power+" Power payé"+
   (paid.recycleUids.length?" · "+paid.recycleUids.length+" rune(s) recyclée(s)":"")+
   (paid.goldUids.length?" · "+paid.goldUids.length+" Gold dépensé(s)":"")+
   (paid.poolPower?" · "+paid.poolPower+" Power de la réserve":""));
  delete step.deflectPower;
 }
 return logs;
}
function applySteps(state,source,steps,actor,runtime,trigger){
 const {place,deckCard}=runtime;
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
   if(names.length)logs.push("défausse "+names.join(", "));
  }else if(step.kind==="burn"){
   logs.push(burnMainCards(state,actor,n,source,{place}));
  }else if(step.kind==="score"){
   state.players[actor].score+=n;
   logs.push("+"+n+" PV");
  }else if(step.kind==="ready-friendly"){
   const target=state.cards.find(c=>c.uid===step.targetUid);
   target.exhausted=false;
   logs.push("redresse "+target.name);
  }else if(step.kind==="shadow-clone"){
   const token=place(state,actor,{code:"TOKEN-SHADOW-CLONE",name:"Shadow Clone",type:"Unit",
    might:0,energy:0,power:0,tags:["Token"]},"base");
   token.exhausted=true;
   logs.push("crée Shadow Clone en base");
   logs.push(...processCardEvent(state,{trigger:"play",actor,source:token},runtime));
   state.turnActions.played[actor]++;
   logs.push(...processCardEvent(state,{trigger:"ally-play",actor,source:token},runtime));
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
   if(trigger==="hold"&&actor===state.active&&result.actual)
    (state.turnActions.holdDraws??=[]).push({name:source.name,count:result.actual});
   logs.push("pioche "+result.actual+" carte(s)"+
    (result.burnOuts?" (Burn Out ×"+result.burnOuts+")":""));
  }else if(step.kind==="ready-runes-ending"){
   if(state.phase==="Ending"&&trigger!=="ending")continue;
   state.delayedEnding??=[];
   const id="ending-"+(state.effectSerial||0)+"-"+state.delayedEnding.length;
   state.delayedEnding.push({id,player:actor,cardName:source.name,count:n});
   logs.push("jusqu’à "+n+" rune(s) à redresser à la fin de ce tour");
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
   const lastKnown=unitBeforeDeath(state,c);
   c.zone="trash";c.battlefield=null;c.exhausted=false;c.damage=0;
   logs.push(c.name+" est détruite");
   const triggered=processCardEvent(state,{trigger:"die",actor:c.owner,source:lastKnown},
    runtime);
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
    logs.push(...processCardEvent(state,{trigger:"play",actor,source:card},runtime));
    state.turnActions.played[actor]++;
    logs.push(...processCardEvent(state,{trigger:"ally-play",actor,source:card},runtime));
   }
   logs.push("crée "+n+" jeton(s) "+step.tokenName+" ("+step.tokenMight+" Might)");
  }else if(step.kind==="damage-enemy"){
   const c=state.cards.find(c=>c.uid===step.targetUid);
   if(!c||!unit(c)||!["base","battlefield"].includes(c.zone))
    throw Error("La cible des dégâts a quitté le plateau.");
   // An effect must not silently bypass Shield, printed stat modifiers, or
   // death triggers. Defer to the shared combat stat computation.
   const prevented=Math.min(n,c.counters?.preventDamage||0);
   c.counters??={};c.counters.preventDamage=(c.counters.preventDamage||0)-prevented;
   c.damage=(c.damage||0)+n-prevented;
   const combat=state.pendingCombat;
   const role=combat?.kind==="combat"&&c.zone==="battlefield"&&c.battlefield===combat.battlefield?
    (combat.attacker===c.owner?"attack":"defend"):"none";
   const might=effectiveMight(c,role,state);
   if(might===null)throw Error("Might inconnue : dégâts non résolus.");
   // Lethal marked damage is handled by the reducer's cleanup, after the
   // whole ability. A later draw must not recycle this unit prematurely.
   logs.push((n-prevented)+" dégâts à "+c.name+(prevented?" · "+prevented+" prévenu(s)":""));
  }
 }
 return logs;
}
// The instruction cursor is persisted with the chain item. A physical choice
// resumes this exact resolution, without reopening priority or replaying the
// preceding instructions. Only publicly discarded cards enter shared state.
export function resolveCardText(state,item,runtime,choice={}){
 const logs=[],actor=item.owner;
 item.cursor??=0;
 const pending=(trigger,text,options={})=>{
  state.pendingEffects.push({id:item.uid+"-"+item.cursor+"-"+(item.discarded||0),
   trigger,player:actor,sourceUid:item.sourceUid,chainUid:item.uid,
   cardName:item.cardName,text,reason:"La résolution reprend après ton choix.",optional:false,...options});
 };
 for(;item.cursor<item.instructions.length;item.cursor++){
  let step={...item.instructions[item.cursor]};
  const source=state.cards.find(c=>c.uid===item.sourceUid&&activeZone(c.zone))??item.source;
  if(step.targetUid){
   const target=state.cards.find(c=>c.uid===step.targetUid);
   const reference=step.here?state.cards.find(c=>c.uid===item.sourceUid):source;
   const valid=step.kind==="ready-friendly"?target&&unit(target)&&activeZone(target.zone)&&
    target.owner===actor&&target.uid!==source.uid:canChooseUnit(target,step,actor,reference);
   if(!valid){logs.push("cible devenue invalide");continue;}
  }
  if(["ready-self","exhaust-self","self-buff","heal-self"].includes(step.kind)&&
     !state.cards.some(c=>c.uid===source.uid&&["base","battlefield"].includes(c.zone))){
   logs.push("la source a quitté le plateau");continue;
  }
  if(step.requiresReadyEnemyHere){
   const current=state.cards.find(card=>card.uid===source.uid&&card.zone==="battlefield");
   if(!current||!state.cards.some(card=>card.owner===OPPOSITE[actor]&&unit(card)&&!card.exhausted&&
      !card.faceDown&&card.zone==="battlefield"&&card.battlefield===current.battlefield))continue;
  }
  if(step.kind==="discard"){
   const count=Math.min(step.count-(item.discarded||0),state.players[actor].handCount);
   if(actor==="human"&&count>0){
    if(!choice.card){pending("card-text-discard","Défausse une carte de ta main ("+count+" restante(s)).");
     return {logs,paused:true};}
    const card=runtime.validateCard(choice.card);
    if(!/^(unit|gear|spell)$/i.test(card.type))throw Error("Indique une carte physique de ta main défaussée.");
    runtime.place(state,actor,card,"trash");state.players[actor].handCount--;
    logs.push("défausse "+card.name);item.discarded=(item.discarded||0)+1;choice={};
    if(item.discarded<step.count&&state.players[actor].handCount>0){
     pending("card-text-discard","Défausse encore "+Math.min(step.count-item.discarded,state.players[actor].handCount)+" carte(s).");
     return {logs,paused:true};
    }
   }else if(actor==="ai"){
    const preferred=(item.preferredDiscards||[]).filter(uid=>state.cards.some(c=>
     c.uid===uid&&c.owner===actor&&c.zone==="hand")).slice(0,count);
    const remaining={...state,cards:state.cards.filter(c=>!preferred.includes(c.uid))};
    step.uids=[...preferred,...(chooseRequiredDiscards(remaining,"",count-preferred.length)||[])];
    logs.push(...applySteps(state,source,[step],actor,runtime,item.trigger));
   }
   delete item.discarded;
   continue;
  }
  if(step.kind==="win-game"){
   state.winner=actor;
   state.finished=true;
   state.winBy="card-effect";
   logs.push(source.name+" donne la victoire");
   break;
  }
  if(step.kind==="spend-buff-to-draw"){
   const candidates=state.cards.filter(card=>card.owner===actor&&unit(card)&&
    ["base","battlefield"].includes(card.zone)&&!card.faceDown&&card.counters?.buff>0);
   if(!candidates.length||choice.decline)continue;
   if(actor==="human"&&!choice.targetUid){
    pending("card-text-spend-buff","Choisis le buff à dépenser ou décline.",
     {optional:true,targetUids:candidates.map(card=>card.uid)});
    return {logs,paused:true};
   }
   const selected=actor==="ai"?candidates.find(card=>card.zone==="base")??candidates[0]:
    candidates.find(card=>card.uid===choice.targetUid);
   if(!selected)throw Error("Choisis une de tes unités avec un buff.");
   selected.counters.buff--;
   logs.push("buff de "+selected.name+" dépensé");
   logs.push(...applySteps(state,source,[{kind:"draw",count:step.count}],actor,runtime,item.trigger));
   continue;
  }
  if(step.kind==="predict"&&actor==="human"&&state.players.human.deckCount>0){
   if(typeof choice.recycle!=="boolean"){
    pending("card-text-predict","Regarde la première carte de ton deck. Veux-tu la recycler ?");
    return {logs,paused:true};
   }
   logs.push(choice.recycle?"Vision : carte recyclée":"Vision : carte conservée");choice={};continue;
  }
  const before=state.pendingEffects.length;
  logs.push(...applySteps(state,source,[step],actor,runtime,item.trigger));
  if(state.pendingEffects.length>before){
   // Burn reveals physical cards before subsequent instructions may proceed.
   for(const effect of state.pendingEffects.slice(before)){
    effect.resumeCardText=item.uid;
   }
   item.cursor++;
   return {logs,paused:true};
  }
 }
 return {logs,paused:false};
}
export function processCardEvent(state,event,runtime={}){
 const {stageCardAbility}=runtime;
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
   if(ability.minimumXP!=null&&(state.players[actor].xp??0)<ability.minimumXP)continue;
   if(ability.toBattlefield&&source.zone!=="battlefield")continue;
   if(ability.minimumExcess!=null&&(event.excessDamage??0)<ability.minimumExcess)continue;
   if(ability.condition==="did-not-die-alone"&&!source.withAlly)continue;
   if(ability.condition==="was-mighty"&&!source.wasMighty)continue;
   if(ability.condition==="empowered"&&!source.counters?.empowered)continue;
   if(ability.condition==="facedown-at-battlefield"&&!state.cards.some(c=>
      c.owner===actor&&c.faceDown&&Number.isInteger(c.battlefield)&&["hidden","battlefield"].includes(c.zone)))continue;
   if(ability.condition==="seven-units-here"&&state.cards.filter(c=>c.owner===actor&&unit(c)&&
      !c.faceDown&&c.zone==="battlefield"&&c.battlefield===event.field).length<7)continue;
   if(ability.condition==="one-other-unit"&&state.cards.filter(c=>unit(c)&&
      c.owner===actor&&c.zone==="battlefield"&&c.battlefield===source.battlefield&&
      c.uid!==source.uid).length!==1)continue;
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
   const token=ability.steps.length===1&&ability.steps[0];
   if(token?.kind==="add-any-power"&&!ability.optional){
    state.powerPool[actor]+=token.count;
    summaries.push(source.name+" : +"+token.count+" Power");
    continue;
   }
   if(trigger==="ending"&&token?.kind==="ready-runes-ending"){
    summaries.push(...applySteps(state,source,[token],actor,runtime,trigger));
    continue;
   }
   if(token&&stageCardAbility&&(["create-gold","create-bird","mill-main","gain-xp","buff-here","ready-gear",
      "return-field-unit","schedule-enemy-move","expire-temporary","stun-played-unit"].includes(token.kind)||
      token.kind==="draw"&&(["did-not-die-alone","was-mighty"].includes(ability.condition)||ability.minimumXP!=null)||
      token.kind==="create-units"&&(token.destination==="base"||token.temporary||trigger==="move"))){
    const notice=stageCardAbility(source,ability,token,event);
    if(notice)summaries.push(notice);
    continue;
   }
   if(!stageCardAbility)throw Error("Le moteur doit mettre la capacité déclenchée sur la chaîne.");
   const notice=stageCardAbility(source,ability,{kind:"card-text"},event);
   if(notice)summaries.push(notice);
  }
 }
 if(trigger==="play"&&event.source&&unit(event.source))
  summaries.push(...processCardEvent(state,{trigger:"opponent-play",actor:OPPOSITE[actor],source:event.source},runtime));
 return summaries;
}
