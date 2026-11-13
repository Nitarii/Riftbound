// Mandatory opening phases are orchestrated by the local companion, leaving
// the shared reducer usable for manual testing and complex card interactions.
import {applyCommand} from "./core.mjs";

export function advanceMandatoryTurn(state){
 if(!state?.started||!["human","ai"].includes(state.active))return state;
 if(state.pendingCombat)return state;
 let next=state,who=state.active;
 const first=state.firstPlayer||"human";
 const wanted=state.turn===1&&who!==first?3:2;
 if(!next.turnActions?.channeled){
  const remaining=who==="ai"?next.decks.ai.runes.length:next.players.human.runeCount;
  next=applyCommand(next,{type:"phase",phase:"Channel"});
  if(remaining>0)next=applyCommand(next,{type:"channel",player:who,count:Math.min(wanted,remaining)});
 }
 if(!next.turnActions?.drawn){
  const remaining=who==="ai"?next.decks.ai.main.length:next.players.human.deckCount;
  next=applyCommand(next,{type:"phase",phase:"Draw"});
  if(remaining>0)next=applyCommand(next,{type:"draw",player:who,count:1});
 }
 if(!next.pendingCombat&&next.phase!=="Main")next=applyCommand(next,{type:"phase",phase:"Main"});
 return next;
}
