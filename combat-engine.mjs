// Riftbound combat arithmetic for the October 9, 2026 Core Rules 466–468.
// Pure, deterministic. Reactions/triggered effects must be resolved before damage.
import {conditionalShieldRule} from "./effect-engine.mjs";
export const COMBAT_RULES_DATE="2026-10-09";
export const OPPOSITE={ai:"human",human:"ai"};
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const isUnit=c=>/^unit$/i.test(c?.type||"");
const words=c=>String(c?.text||"")
 .replace(/\[([^\]]*)\]/g,(_,value)=>
  /^(?:assault|assaut|shield|bouclier|tank|backline|deathknell)\b/i.test(value.trim())?
   " "+value.trim()+" ":" ")
 .replace(/[–—]/g," ");
export function hasKeyword(card,keyword){
 return new RegExp("\\b"+keyword+"\\b","i").test(words(card));
}
function keywordValue(card,keyword){
 const text=words(card);
 const match=new RegExp("\\b(?:"+keyword+")\\b\\s*\\+?(\\d+)?","i").exec(text);
 return match?match[1]?Number(match[1]):1:0;
}
function shieldBonus(card,role,state){
 if(role!=="defend")return 0;
 const normal=keywordValue(card,"Shield|Bouclier");
 const condition=conditionalShieldRule(card);
 if(!condition)return normal;
 // Without board context, do NOT grant an unverified conditional bonus.
 if(!state||card.zone!=="battlefield"||!Number.isInteger(card.battlefield))
  return 0;
 const otherFriendlyUnits=state.cards.filter(unit=>
  unit.uid!==card.uid&&isUnit(unit)&&unit.owner===card.owner&&
  unit.zone==="battlefield"&&unit.battlefield===card.battlefield).length;
 return otherFriendlyUnits===condition.otherFriendlyUnits?condition.shield:0;
}
export function effectiveMight(card,role="none",state=null){
 if(!isUnit(card))return null;
 const printed=Number(card.counters?.baseMight??card.might);
 if((card.counters?.baseMight??card.might)==null||!Number.isFinite(printed))return null;
 const counters=card.counters||{};
 const stats=Math.max(0,printed+number(counters.might)+number(counters.buff)+
  number(counters.tempMight)+number(counters.mightThisTurn)+number(counters["might bonus"])+
  (role==="attack"?keywordValue(card,"Assault|Assaut"):0)+
  shieldBonus(card,role,state));
 return stats;
}
export function offensiveMight(card,role,state=null){
 return card.stunned||card.counters?.stunned?0:effectiveMight(card,role,state);
}
export function combatPriority(card){
 const tank=hasKeyword(card,"Tank"),backline=hasKeyword(card,"Backline");
 if(tank&&!backline)return 0;
 if(backline&&!tank)return 2;
 return 1;
}
export function combatWarnings(state,index,attackers,defenders){
 const notices=[];
 const combatRelevant=/\b(when i (attack|defend|deal|take|die|kill)|when you (attack|defend)|when (a|an|this|the) (unit|combat|showdown)|when a unit|at the (start|end) of (combat|a showdown)|during (combat|a showdown)|prevent|deflect|can't be (dealt|killed)|cannot be (dealt|killed)|combat damage|end of combat|on kill|on death|backline|deathknell|assault|shield)\b/i;
 for(const u of [...attackers,...defenders]){
  if(combatRelevant.test(words(u))){
   // Assault/Shield/Backline/Deathknell etc can require card-specific
   // timing. Explain which card needs review instead of inventing its effect.
   const special=words(u).replace(/\b(?:Assault|Assaut|Shield|Bouclier)\s*\d*|\b(?:Tank|Backline)\b/gi,"").trim();
   if(combatRelevant.test(special))notices.push(u.name+" : effet ou déclenchement à vérifier");
  }
  if(effectiveMight(u,u.owner===state.pendingCombat?.attacker?"attack":"defend",state)===null)
   notices.push(u.name+" : Might manquante");
 }
 const battlefield=state.battlefields?.[index]?.card;
 if(battlefield?.text?.trim())notices.push("Champ de bataille "+battlefield.name+" : vérifier ses effets de combat et conquête");
 return [...new Set(notices)];
}
export function assignDamage(total,targets,role,preferredOrder=[],state=null){
 if(!Number.isFinite(total)||total<0)throw Error("Total de dégâts invalide.");
 const order=new Map((preferredOrder||[]).map((uid,i)=>[uid,i]));
 const sorted=[...targets].sort((a,b)=>
   combatPriority(a)-combatPriority(b)||
   (order.get(a.uid)??999)-(order.get(b.uid)??999)||
   (Math.max(1,(effectiveMight(a,role,state)??0)-number(a.damage))-
    Math.max(1,(effectiveMight(b,role,state)??0)-number(b.damage)))||
   String(a.uid).localeCompare(String(b.uid)));
 const assigned={};let left=total;
 for(let i=0;i<sorted.length&&left>0;i++){
  const u=sorted[i];
  const might=effectiveMight(u,role,state);
  if(might===null)throw Error("Might inconnue sur "+u.name);
  const lethal=Math.max(1,might-number(u.damage));
  // Rule 467.2.c.4: no more than the minimum lethal until all other
  // eligible targets have been assigned their required lethal.
  const amount=i===sorted.length-1?left:Math.min(left,lethal);
  assigned[u.uid]=amount;
  left-=amount;
 }
 return {assigned,order:sorted.map(x=>x.uid),total,unassigned:left};
}
export function battleParties(state,index,attacker){
 const units=state.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===index&&isUnit(c));
 return {
  attackers:units.filter(c=>c.owner===attacker),
  defenders:units.filter(c=>c.owner===OPPOSITE[attacker])
 };
}
export function previewCombat(state,index,attacker,orders={}){
 if(!OPPOSITE[attacker]||!state.battlefields[index]?.card)throw Error("Champ de bataille invalide.");
 const {attackers,defenders}=battleParties(state,index,attacker);
 if(!attackers.length||!defenders.length){
  // A reaction may kill or recall the last combatant during the showdown:
  // there is no Combat Damage Step, but cleanup and control still resolve.
  return {ready:true,index,attacker,defender:OPPOSITE[attacker],
   attackingMight:0,defendingMight:0,
   attackers:attackers.map(c=>c.uid),defenders:defenders.map(c=>c.uid),
   damageToAttackers:{},damageToDefenders:{},damage:[],dead:[],recalled:[],
   winner:attackers.length?attacker:defenders.length?OPPOSITE[attacker]:"none",
   survivors:{attacker:attackers.length,defender:defenders.length}};
 }
 const unknown=[...attackers.map(c=>effectiveMight(c,"attack",state)),
  ...defenders.map(c=>effectiveMight(c,"defend",state))].some(x=>x===null);
 if(unknown)return {ready:false,error:"Might d'une unité inconnue : préciser les statistiques avant résolution."};
 const attackingMight=attackers.reduce((n,c)=>n+offensiveMight(c,"attack",state),0);
 const defendingMight=defenders.reduce((n,c)=>n+offensiveMight(c,"defend",state),0);
 // Both allocations are determined first; only then is damage dealt.
 const toDefenders=assignDamage(attackingMight,defenders,"defend",orders.ai&&attacker==="ai"?orders.ai:
  orders.human&&attacker==="human"?orders.human:[],state);
 const toAttackers=assignDamage(defendingMight,attackers,"attack",orders[OPPOSITE[attacker]]||[],state);
 const after=[...attackers,...defenders].map(c=>{
  const damage=(c.damage||0)+(toDefenders.assigned[c.uid]||0)+(toAttackers.assigned[c.uid]||0);
  const role=c.owner===attacker?"attack":"defend";
  const might=effectiveMight(c,role,state);
  return {uid:c.uid,name:c.name,owner:c.owner,might,
   assigned:(toDefenders.assigned[c.uid]||0)+(toAttackers.assigned[c.uid]||0),
   damage,dead:damage>0&&damage>=might};
 });
 const survivingAttackers=after.filter(c=>c.owner===attacker&&!c.dead);
 const survivingDefenders=after.filter(c=>c.owner!==attacker&&!c.dead);
 return {ready:true,index,attacker,defender:OPPOSITE[attacker],attackingMight,defendingMight,
  attackers:attackers.map(c=>c.uid),defenders:defenders.map(c=>c.uid),
  damageToAttackers:toAttackers.assigned,damageToDefenders:toDefenders.assigned,
  damage:after,dead:after.filter(c=>c.dead).map(c=>c.uid),
  recalled:survivingDefenders.length?survivingAttackers.map(c=>c.uid):[],
  winner:survivingDefenders.length&&survivingAttackers.length?"none":
   survivingAttackers.length?attacker:
   survivingDefenders.length?OPPOSITE[attacker]:"none",
  survivors:{attacker:survivingAttackers.length,defender:survivingDefenders.length}};
}
export function applyCombatResult(state,result,{previousController=null}={}){
 if(!result?.ready)throw Error(result?.error||"Combat non prêt.");
 const before=new Map(result.damage.map(x=>[x.uid,x]));
 const dead=new Set(result.dead),recall=new Set(result.recalled);
 const trash=[];
 for(const card of state.cards){
  const outcome=before.get(card.uid);
  if(outcome)card.damage=outcome.damage;
  if(dead.has(card.uid)){
   card.zone="trash";card.battlefield=null;card.exhausted=false;trash.push(card.name);
  }else if(recall.has(card.uid)){
   card.zone="base";card.battlefield=null;card.exhausted=true;
  }
 }
 // Combat cleanup heals ALL units on the board, not just combatants.
 for(const card of state.cards)if(isUnit(card)&&["base","battlefield"].includes(card.zone))
  card.damage=0;
 // Kill cleanup removes marked damage when cards leave the board.
 for(const card of state.cards)if(dead.has(card.uid))card.damage=0;
 const current=state.cards.filter(c=>isUnit(c)&&c.zone==="battlefield"&&c.battlefield===result.index);
 const owners=[...new Set(current.map(c=>c.owner))];
 const controller=owners.length===1?owners[0]:null;
 state.pendingCombat=null;
 return {controller,previousController,dead:trash,recalled:result.recalled.length,
  attackerDamage:result.attackingMight,defenderDamage:result.defendingMight,winner:result.winner};
}
