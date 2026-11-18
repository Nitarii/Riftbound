import {duelOpeningRuneCount} from "./rules-compendium.mjs";
// Deterministic, cost-checked basic Duel turn for the local AI.
// The local language model handles conversation, NOT unchecked game mutations.
import {applyCommand} from "./core.mjs";
import {planRunePayment} from "./rune-payment.mjs";
import {mandatoryPlayEffects,chooseRequiredDiscards} from "./play-effects.mjs";
import {battlefieldController} from "./battlefield-rules.mjs";
import {previewCombat,effectiveMight,hasKeyword,clearTurnUnitState} from "./combat-engine.mjs";
import {hiddenDisciple,shenLegend} from "./verified-cards.mjs";
import {spellRule} from "./effect-engine.mjs";
const isUnit=c=>/^unit$/i.test(c?.type||"");
const isPlayable=c=>/^(unit|gear)$/i.test(c?.type||"");
const extraRestrictions=c=>!mandatoryPlayEffects(c).supported;
const own=(view,zone)=>view.cards.filter(c=>c.owner==="ai"&&c.zone===zone);
const readyToMove=card=>isUnit(card)&&!card.exhausted&&card.counters?.tempNoMoveBy!=="ai";
const availableSpells=state=>[...own(state,"hand"),...own(state,"trash")].flatMap(card=>{
 const rule=spellRule(card);
 return rule&&(card.zone==="hand"||rule.flow)?[{card,rule}]:[];
});
const cast=(card,target)=>({type:"cast",player:"ai",uid:card.uid,...(target&&{targetUid:target.uid}),
 ...(card.zone==="trash"&&{flow:true})});
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
function threatenedFields(view){
 const board=view.cards.filter(card=>["base","battlefield"].includes(card.zone)&&!card.faceDown);
 const troops=board.filter(card=>card.owner==="human"&&card.zone==="base"&&isUnit(card));
 if(!troops.length)return [];
 const attackers=new Set(troops.map(card=>card.uid));
 return emptyBattlefieldTargets(view).filter(field=>field.friendly>0&&!field.enemy).flatMap(({i})=>{
  const cards=board.map(card=>{
   if(!isUnit(card))return card;
   const unit={...card,counters:{...card.counters}};
   clearTurnUnitState(unit);
   if(attackers.has(unit.uid)){unit.zone="battlefield";unit.battlefield=i;}
   return unit;
  });
  const projected={...view,cards};
  const before=previewCombat(projected,i,"human");
  return before.ready&&before.winner==="human"?[{i,projected,before}]:[];
 });
}
function defensivePlacement(card,threats){
 let best=null;
 for(const {i,projected,before} of threats){
  const cards=[...projected.cards,{...card,zone:"battlefield",battlefield:i}];
  const after=previewCombat({...projected,cards},i,"human");
  if(!after.ready||after.defendingMight<=before.defendingMight)continue;
  const gain=after.defendingMight-before.defendingMight;
  const value=(after.winner!=="human"?30:0)+gain+after.damage.filter(hit=>hit.owner==="human"&&hit.dead).length*4;
  if(!best||value>best.value)best={i,value};
 }
 return best?.i??null;
}
function concealedDefender(state){
 const fight=state.pendingCombat;
 if(fight?.kind!=="combat"||fight.attacker!=="human")return null;
 const slot=own(state,"hidden").find(c=>c.battlefield===fight.battlefield&&hiddenDisciple(c));
 if(!slot)return null;
 const command={type:"play-hidden",player:"ai",uid:slot.uid};
 try{
  const before=previewCombat(state,fight.battlefield,fight.attacker,fight.orders);
  const next=applyCommand(state,command);
  const after=previewCombat(next,fight.battlefield,fight.attacker,fight.orders);
  if(!before.ready||!after.ready)return null;
  if(before.winner==="human"&&after.winner!=="human"||after.dead.some(uid=>
     !before.dead.includes(uid)&&state.cards.some(card=>card.uid===uid&&card.owner==="human")))
    return command;
 }catch{}
 return null;
}
function defensiveTank(state){
 const fight=state.pendingCombat;
 const legend=own(state,"legend").find(c=>shenLegend(c)&&!c.exhausted);
 if(fight?.kind!=="combat"||!legend)return null;
 const allies=state.cards.filter(c=>c.owner==="ai"&&c.zone==="battlefield"&&c.battlefield===fight.battlefield&&isUnit(c));
 if(allies.length<2)return null;
 const preview=view=>previewCombat(view,fight.battlefield,fight.attacker,fight.orders);
 const value=result=>(result.winner==="ai"?25:result.winner==="human"?-25:0)-
  allies.filter(c=>result.dead.includes(c.uid)).reduce((sum,c)=>sum+2+(c.might||0),0)+
  result.damage.filter(c=>c.owner==="human"&&c.dead).reduce((sum,c)=>sum+2+c.might,0);
 const before=preview(state);
 if(!before.ready)return null;
 let bestValue=value(before),best=null;
 for(const ally of allies.filter(c=>!hasKeyword(c,"Tank")).slice(0,12)){
  const cards=state.cards.map(c=>c===ally?{...c,counters:{...c.counters,tempTank:true}}:c);
  const after=preview({...state,cards});
  if(!after.ready||value(after)<=bestValue)continue;
  bestValue=value(after);
  best={type:"activate",player:"ai",uid:legend.uid,targetUid:ally.uid};
 }
 return best;
}
function combatSpell(state){
 const fight=state.pendingCombat;
 if(fight?.kind!=="combat")return null;
 const value=result=>(result.winner==="ai"?30:result.winner==="human"?-30:0)+
  result.damage.filter(hit=>hit.dead).reduce((total,hit)=>
   total+(hit.owner==="human"?1:-1)*(2+hit.might),0);
 const before=previewCombat(state,fight.battlefield,fight.attacker,fight.orders);
 if(!before.ready)return null;
 const participants=state.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===fight.battlefield&&isUnit(c));
 let best=value(before),chosen=null;
 for(const {card,rule} of availableSpells(state)){
  if(rule.timing==="main"||!(rule.might||rule.assault||rule.stun))continue;
  const beneficial=rule.might>0||rule.assault;
  for(const target of participants.filter(c=>(c.owner==="ai")===Boolean(beneficial))){
   const counters={...target.counters,
    tempMight:(target.counters?.tempMight||0)+(rule.might||0),
    tempAssault:(target.counters?.tempAssault||0)+(rule.assault||0)};
   const projected={...target,counters,stunned:target.stunned||rule.stun};
   const after=previewCombat({...state,cards:state.cards.map(c=>c===target?projected:c)},
    fight.battlefield,fight.attacker,fight.orders);
   if(!after.ready)continue;
   const rating=value(after)-0.5*Number((card.zone==="trash"?rule.flow:rule).energy||0);
   if(rating<=best)continue;
   const command=cast(card,target);
   try{applyCommand(state,command);chosen=command;best=rating;}catch{}
  }
 }
 return chosen;
}
export function planAIChainAction(state){
 const chain=state.spellChain;
 if(state.pendingEffects?.length)return null;
 if(!chain){
  if(state.pendingCombat?.focus!=="ai"||state.pendingCombat.passes.ai)return null;
  return removalSpell(state)?.command??concealedDefender(state)??defensiveTank(state)??
   combatSpell(state)??{type:"combat-pass",player:"ai"};
 }
 if(chain.priority!=="ai")return null;
 const top=chain.items.at(-1);
 const target=state.cards.find(c=>c.uid===top.targetUid&&c.owner==="ai"&&
   ["base","battlefield"].includes(c.zone));
 if(target&&top.damage>0&&top.damage+(target.damage||0)-(target.counters.preventDamage||0)>=
    (effectiveMight(target,"none",state)??Infinity)){
  for(const {card,rule} of availableSpells(state)){
   if(!rule.prevention)continue;
   const command=cast(card,target);
   try{applyCommand(state,command);return command;}catch{}
  }
 }
 return concealedDefender(state)??{type:"chain-pass",player:"ai"};
}
function removalSpell(state){
 let best=null;
 for(const {card:spell,rule} of availableSpells(state)){
  if(!rule.damage&&!rule.damageFromDiscard&&!rule.returnToBase&&!rule.kill&&rule.killAtMost===undefined)continue;
  const discard=rule.discardDamage?chooseRequiredDiscards(state,spell.uid,1)?.[0]:null;
  const resolutionDiscard=rule.damageFromDiscard&&
   state.cards.find(c=>c.uid===chooseRequiredDiscards(state,spell.uid,1)?.[0]);
  for(const unit of state.cards.filter(c=>c.owner==="human"&&c.zone==="battlefield"&&isUnit(c)&&!c.faceDown)){
   const might=effectiveMight(unit,"none",state);
   if(might==null)continue;
   const need=might-(unit.damage||0)+(unit.counters.preventDamage||0);
   if(rule.damageFromDiscard&&(!resolutionDiscard||resolutionDiscard.energy<need))continue;
   if(rule.returnToBase&&/vilemaw.s lair|antre de vilemaw/i.test(state.battlefields[unit.battlefield]?.card?.name||""))continue;
   const after=rule.disempower?{...unit,counters:{...unit.counters,
    empowered:Math.max(0,(unit.counters?.empowered||0)-1)}}:unit;
   const needsDiscard=rule.damage!==undefined&&need>rule.damage;
   if(needsDiscard&&(!discard||need>rule.discardDamage))continue;
   if(rule.killAtMost!==undefined&&effectiveMight(after,"none",state)>rule.killAtMost)continue;
   const command={...cast(spell,unit),...(needsDiscard?{discardUid:discard}:{})};
   try{
    applyCommand(state,command);
    const value=might*2-(command.discardUid||resolutionDiscard?3:0)-(rule.returnToBase?2:0);
    if(!best||value>best.value)best={command,value,name:spell.name,target:unit.name};
   }catch{}
  }
 }
 return best;
}
function readyForConquest(state){
 if(targetForConquest(state)===null)return null;
 const exhausted=own(state,"base").filter(c=>isUnit(c)&&c.exhausted&&c.might!=null)
  .sort((a,b)=>b.might-a.might);
 if(!exhausted.length)return null;
 for(const {card:spell,rule} of availableSpells(state)){
  if(!rule.ready)continue;
  const command=cast(spell,exhausted[0]);
  try{applyCommand(state,command);return {command,name:spell.name,target:exhausted[0].name};}catch{}
 }
 return null;
}
function drawSpell(state){
 const {handCount,deckCount}=state.players.ai;
 if(handCount>5)return null;
 for(const {card,rule} of availableSpells(state)){
  if(rule.target||!rule.draw||rule.draw>deckCount)continue;
  const command=cast(card);
  try{applyCommand(state,command);return {command,name:card.name};}catch{}
 }
 return null;
}
function concealForDefense(state){
 const slot=own(state,"hand").find(hiddenDisciple);
 const rune=own(state,"runes").find(c=>c.exhausted);
 if(!slot||!rune)return null;
 const field=emptyBattlefieldTargets(state).find(f=>f.friendly===1&&!f.enemy&&
   !state.cards.some(c=>c.zone==="hidden"&&c.battlefield===f.i));
 if(!field)return null;
 const command={type:"hide",player:"ai",uid:slot.uid,battlefield:field.i,runeUid:rune.uid};
 try{applyCommand(state,command);return command;}catch{return null;}
}
export function enumerateAIAssaults(view,{limit=5,searchBudget=90}={}){
 if(!view.started||view.active!=="ai"||view.phase!=="Main"||view.finished||
    view.pendingCombat||view.spellChain||view.pendingEffects?.length)return [];
 const ready=own(view,"base").filter(c=>readyToMove(c)&&c.might!=null)
  .sort((a,b)=>(effectiveMight(b,"attack",view)||0)-(effectiveMight(a,"attack",view)||0)).slice(0,7);
 const fields=emptyBattlefieldTargets(view).filter(x=>x.enemy>0);
 const enemyWinNext=view.players.human.score+fields.length>=8;
 const options=[];
 let tested=0;
 // Test diverse groups rather than just successively larger prefixes.
 for(let size=1;size<=ready.length;size++){
  for(let mask=1;mask<1<<ready.length;mask++){
   const units=ready.filter((_,i)=>mask&(1<<i));
   if(units.length!==size)continue;
   for(const field of fields){
    if(tested++>=searchBudget)break;
    const command={type:"combat-attack",player:"ai",battlefield:field.i,uids:units.map(c=>c.uid)};
    try{
     const hypothetical=applyCommand(view,command);
     if(hypothetical.pendingEffects?.length||hypothetical.pendingCombat?.warnings?.length)continue;
     const preview=previewCombat(hypothetical,field.i,"ai");
     if(!preview.ready)continue;
     const losses=preview.damage.filter(c=>c.dead);
     const opponentLoss=losses.filter(c=>c.owner==="human").reduce((n,c)=>n+6+c.might,0);
     const friendlyLoss=losses.filter(c=>c.owner==="ai").reduce((n,c)=>n+7+c.might,0);
     const conquer=preview.winner==="ai";
     const deniesHold=preview.survivors.defender===0;
     const projectedWin=conquer&&!field.scored&&view.players.ai.score>=7&&
      view.battlefields.every((_,i)=>i===field.i||view.scoredFields?.ai?.includes(i));
     const value=(projectedWin?300:0)+(conquer?70:0)+(deniesHold&&enemyWinNext?110:0)+
      opponentLoss-friendlyLoss-units.length*2;
     if(value>0&&(conquer||opponentLoss>0))options.push({command,value,
      battlefield:view.battlefields[field.i].card.name,units:units.map(c=>c.name),
      attack:preview.attackingMight,defend:preview.defendingMight,
      losses:{human:losses.filter(c=>c.owner==="human").length,ai:losses.filter(c=>c.owner==="ai").length},
      projectedWin,deniesHold});
    }catch{}
   }
   if(tested>=searchBudget)break;
  }
  if(tested>=searchBudget)break;
 }
 return options.sort((a,b)=>b.value-a.value).slice(0,limit);
}
export function planAutonomousAITurn(state,{maxUnits=3,maxMoves=5,preferredAssault=null}={}){
 if(!state?.started||state.active!=="ai")return {commands:[],state,summary:""};
 if(state.finished)return {commands:[],state,summary:"Partie terminée",finished:true};
 if(state.spellChain)return {commands:[],state,waitingForChain:true,summary:"Chaîne en cours."};
 if(state.pendingCombat)return {commands:[],state,summary:"Combat : réactions en attente.",waitingForCombat:true};
 if(state.pendingEffects?.length)return {commands:[],state,
   summary:"Effet à résoudre : "+state.pendingEffects[0].cardName,
   waitingForEffects:true};
 // Resuming an Ending-phase effect must not reopen Main or allow extra plays.
 if(state.phase==="Ending"){
  const next=applyCommand(state,{type:"next-turn"});
  return {commands:[{type:"next-turn"}],state:next,enacted:["terminé son tour"],
   refused:[],summary:"fin du tour"};
 }
 const commands=[];let view=state;
 const enacted=[],refused=[];
 const apply=command=>{view=applyCommand(view,command);commands.push(command);};
 // A trigger can suspend the turn halfway through channeling, drawing or moving.
 // Preserve already legal actions instead of rolling back the complete batch.
 const interrupted=()=>Boolean(view.finished||view.pendingCombat||view.spellChain||view.pendingEffects?.length);
 const partial=()=>({commands,state:view,enacted,refused,finished:!!view.finished,
  summary:enacted.join(", ")});
 try{
  const count=duelOpeningRuneCount(view,"ai");
  if(view.phase!=="Main"&&!view.turnActions?.channeled&&!view.turnActions?.channelAttempted){
   const left=view.decks?.ai?.runes?.length||0;
   if(left>0){
    apply({type:"phase",phase:"Channel"});
    const n=Math.min(count,left);
    apply({type:"channel",player:"ai",count:n});
    enacted.push("canalisé "+n+" runes");
    if(interrupted())return partial();
   }
  }
  if(view.phase!=="Main"&&!view.turnActions?.drawn&&!view.turnActions?.drawAttempted){
   apply({type:"phase",phase:"Draw"});
   apply({type:"draw",player:"ai",count:1});
   enacted.push("pioché 1 carte");
   if(interrupted())return partial();
  }
  if(view.phase!=="Main")apply({type:"phase",phase:"Main"});
  if(interrupted())return partial();
  // Ready units already in base are useful now. They should not wait forever
  // while the AI continues playing new units into base.
  let moved=0;
  function moveUncontested(reinforce=false){
   for(const unit of own(view,"base").filter(readyToMove)){
    if(interrupted())break;
    if(moved>=maxMoves)break;
    const field=targetForConquest(view)??(reinforce?targetForReinforcement(view):null);
    if(field===null)break; // Opponent controls/contests all fields: combat needs arbitration.
    apply({type:"move",uid:unit.uid,zone:"battlefield",battlefield:field});
    enacted.push(unit.name+" → "+view.battlefields[field].card.name);
    moved++;
    if(interrupted())break;
   }
  }
  const opponentNextScore=view.players.human.score+
   view.battlefields.filter((_,i)=>battlefieldController(view,i)==="human").length;
  if(opponentNextScore>=8&&attackDefended(true))return partial();
  moveUncontested();
  if(interrupted())return partial();
  const removal=removalSpell(view);
  if(removal){
   apply(removal.command);
   enacted.push("lancé "+removal.name+" sur "+removal.target);
   return partial();
  }
  // If both fields are occupied, evaluate an actual multi-unit assault. It
  // creates a showdown and pauses the AI turn for the human's reactions.
  function attackDefended(urgent=false){
   const options=enumerateAIAssaults(view).filter(x=>!urgent||x.deniesHold);
   const best=options.find(x=>preferredAssault&&JSON.stringify(x.command)===JSON.stringify(preferredAssault))||options[0];
   if(!best)return false;
   apply(best.command);
   enacted.push("attaqué "+best.battlefield+" avec "+
    best.units.join(", ")+" ("+best.attack+" contre "+best.defend+" avant réactions)");
   return true;
  }
  if(attackDefended())return partial();
  // Only units with fully known printed costs, including domain-coloured Power,
  // are eligible. Do not guess spells/gear/effects requiring custom timing.
  for(let played=0;played<maxUnits&&!view.finished;played++){
   const threats=opponentNextScore<8?threatenedFields(view):[];
   const candidates=[...own(view,"hand"),...own(view,"champion")]
    .filter(c=>isPlayable(c))
    .map(c=>{
     const normal=planRunePayment(view,"ai",c);
     const canAccelerate=isUnit(c)&&/\baccelerate\b/i.test(c.text||"")&&
       targetForConquest(view)!==null;
     const extra=canAccelerate?planRunePayment(view,"ai",{
       ...c,energy:Number(c.energy||0)+1,power:Number(c.power||0)+1
     }):null;
     const accelerate=Boolean(extra&&!extra.error);
     return {card:c,accelerate,payment:accelerate?extra:normal,
       effect:mandatoryPlayEffects(c,{playedBefore:view.turnActions?.played?.ai||0})};
    })
    .map(x=>({...x,discardUids:chooseRequiredDiscards(view,x.card.uid,x.effect.discard)}))
    .filter(x=>!x.payment.error&&x.discardUids!==null)
    .flatMap(x=>{
     const cmd={type:"play-paid",uid:x.card.uid,zone:"base",discardUids:x.discardUids,accelerate:x.accelerate};
     const field=isUnit(x.card)&&!x.accelerate?defensivePlacement(x.card,threats):null;
     for(const command of field===null?[cmd]:[{...cmd,zone:"battlefield",battlefield:field},cmd])try{
      const simulated=applyCommand(view,command);
      // Never knowingly enter an unresolved mandatory or continuous ability
      // when other legal actions can progress the complete physical match.
      if(!simulated.pendingEffects?.length)return [{...x,command}];
     }catch{}
     return [];
    });
   if(!candidates.length)break;
   // Prefer useful units with affordable Power cost, so the AI develops a
   // board while preserving the rune economy when two choices are comparable.
   candidates.sort((a,b)=>
    ((b.effect.supported?12:0)+(isUnit(b.card)?7:0)+
      (b.card.might??0)*2+(b.card.energy??0)-b.payment.power*2)-
    ((a.effect.supported?12:0)+(isUnit(a.card)?7:0)+
      (a.card.might??0)*2+(a.card.energy??0)-a.payment.power*2)||
    a.payment.power-b.payment.power||
    String(a.card.code).localeCompare(String(b.card.code)));
   const {card,payment,discardUids,command}=candidates[0];
   const discarded=discardUids.map(uid=>view.cards.find(c=>c.uid===uid)?.name||"carte");
   apply(command);
   if(view.pendingEffects?.length){
    refused.push("Effet de "+card.name+" à résoudre : "+view.pendingEffects[0].text);
    break;
   }
   enacted.push("joué "+card.name+(command.zone==="battlefield"?" à "+view.battlefields[command.battlefield].card.name:"")+" ("+payment.energy+" énergie, "+
    payment.power+" Power / "+payment.recycleUids.length+" rune(s) recyclée(s)"+
    (payment.goldUids.length?" / "+payment.goldUids.length+" Gold dépensé(s)":"")+
    (payment.poolPower?" / "+payment.poolPower+" Power de la réserve":"")+")"+
    (discarded.length?", puis défaussé "+discarded.join(", ")+" pour son effet":""));
   // Accelerate / an explicit enters-ready instruction allows an immediate move.
   moveUncontested();
   if(interrupted())break;
  }
  if(view.finished||view.spellChain)return partial();
  if(!view.pendingCombat&&!view.pendingEffects?.length)attackDefended();
  if(!interrupted()){
   const spell=readyForConquest(view);
   if(spell){
    apply(spell.command);
    enacted.push("lancé "+spell.name+" sur "+spell.target);
    return partial();
   }
  }
  if(!interrupted())moveUncontested(true);
  const before=state.players.ai.score,after=view.players.ai.score;
  if(after>before)enacted.push("marqué "+(after-before)+" PV par conquête");
  const contested=emptyBattlefieldTargets(view).every(f=>f.enemy>0);
  if(contested&&own(view,"base").some(c=>isUnit(c)&&!c.exhausted)){
   refused.push("Les champs sont défendus : un combat avec réactions doit être résolu avant de compter une conquête.");
  }
  if(!interrupted()){
   const refill=drawSpell(view);
   if(refill){
    apply(refill.command);
    enacted.push("lancé "+refill.name);
    return partial();
   }
   const concealed=concealForDefense(view);
   if(concealed){
    apply(concealed);
    enacted.push("caché une carte à "+view.battlefields[concealed.battlefield].card.name);
   }
   apply({type:"phase",phase:"Ending"});
   if(!view.pendingEffects?.length&&!view.spellChain)apply({type:"next-turn"});
  }
  return {commands,state:view,enacted,refused,summary:enacted.join(", ")};
 }catch(error){
  // Do not return a partial turn: the caller commits the entire batch or none.
  return {commands:[],state,error:String(error.message||error),enacted:[],refused:[]};
 }
}
export function planSafeAITurn(state){return planAutonomousAITurn(state).commands;}
export function describeAITurn(result,{english=false}={}){
 if(result?.finished)return result.state?.winner==="ai"?
  (english?"I have won the game.":"J'ai gagné la partie !"):
  (english?"The player has won.":"Le joueur a gagné la partie !");
 if(!result?.commands?.length)return english?
  "I couldn't complete a safe turn; please check the battlefield and card rules.":
  "Je ne peux pas terminer mon tour de manière sûre : vérifie les cartes et les règles.";
 const actions=result.enacted||[];
 if(result.state?.spellChain)return "J'ai "+actions.join(", ")+". La carte est sur la chaîne, en attente de résolution.";
 const notes=result.refused||[];
 if(result.state?.pendingEffects?.length){
  const pending=result.state.pendingEffects[0];
  return english?"I "+(actions.length?actions.join(", "):"started my turn")+
   ". "+pending.cardName+" triggered: "+pending.text+
   ". This effect needs resolution before play continues.":
   "J'ai "+(actions.length?actions.join(", "):"commencé mon tour")+
   ". Effet déclenché de "+pending.cardName+" : "+pending.text+
   ". Il doit être résolu avant de poursuivre.";
 }
 if(result.state?.pendingCombat?.kind==="conquest")return "J'ai "+actions.join(", ")+
  ". Confrontation ouverte : le point sera compté après les réactions.";
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
