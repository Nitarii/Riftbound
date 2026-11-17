import {duelOpeningRuneCount} from "./rules-compendium.mjs";
// Mandatory opening phases are orchestrated by the local companion, leaving
// the shared reducer usable for manual testing and complex card interactions.
import {applyCommand} from "./core.mjs";

export function advanceMandatoryTurn(state){
 if(!state?.started||state.finished||!["human","ai"].includes(state.active))return state;
 if(["Main","Ending"].includes(state.phase))return state;
 if(state.pendingCombat||state.pendingEffects?.length)return state;
 let next=state,who=state.active;
 const wanted=duelOpeningRuneCount(state,who);
 if(!next.turnActions?.channeled&&!next.turnActions?.channelAttempted){
  const remaining=who==="ai"?next.decks.ai.runes.length:next.players.human.runeCount;
  next=applyCommand(next,{type:"phase",phase:"Channel"});
  if(remaining>0)next=applyCommand(next,{type:"channel",player:who,count:Math.min(wanted,remaining)});
 }
 if(!next.turnActions?.drawn&&!next.turnActions?.drawAttempted){
  next=applyCommand(next,{type:"phase",phase:"Draw"});
  next=applyCommand(next,{type:"draw",player:who,count:1});
  if(next.pendingEffects?.length||next.finished)return next;
 }
 if(!next.pendingCombat&&!next.pendingEffects?.length&&next.phase!=="Main")next=applyCommand(next,{type:"phase",phase:"Main"});
 // Keep the reducer's exact revision and resource changes, but display a
 // single understandable history entry rather than five phase transitions.
 if(next.revision!==state.revision){
  const runes=(next.turnActions?.channeled||0)-(state.turnActions?.channeled||0);
  const drawn=(next.turnActions?.drawn||0)-(state.turnActions?.drawn||0);
  const description="Début du tour : "+(runes?"+ "+runes+" runes":"pas de rune disponible")+
   ", "+(drawn?"+ "+drawn+" carte":"pioche vide")+". "+(who==="ai"?"Tour de l’IA.":"À toi de jouer.");
  next.history=[{revision:next.revision,at:new Date().toISOString(),text:description},
   ...(state.history||[])].slice(0,120);
  next.message=description;
 }
 return next;
}
