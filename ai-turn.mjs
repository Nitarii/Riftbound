// Small deterministic fallback when the local model cannot produce valid card UIDs.
// Moves only EXISTING AI cards, never invents or arbitrates their text/effects.
import {applyCommand} from "./core.mjs";
export function planSafeAITurn(state){
 if(!state?.started||state.active!=="ai")return [];
 const commands=[];let view=state;
 const apply=command=>{view=applyCommand(view,command);commands.push(command);};
 try{
  const first=view.firstPlayer||"human";
  const channelCount=view.turn===1&&first!=="ai"?3:2;
  if(!view.turnActions?.channeled){
   const available=view.decks?.ai?.runes?.length||0;
   if(available>0){apply({type:"phase",phase:"Channel"});apply({type:"channel",player:"ai",count:Math.min(channelCount,available)});}
  }
  if(!view.turnActions?.drawn&&view.decks?.ai?.main?.length){
   apply({type:"phase",phase:"Draw"});apply({type:"draw",player:"ai",count:1});
  }
  apply({type:"phase",phase:"Main"});
  const ready=view.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&!c.exhausted);
  // No action when the card's cost is missing, or its type is not a regular unit.
  // A model/physical player must confirm any additional play restrictions/effects.
  const hand=view.cards.filter(c=>c.owner==="ai"&&c.zone==="hand"&&/^unit$/i.test(c.type||"")&&
    Number.isFinite(c.energy)&&c.energy>=0&&c.energy<=ready.length &&
    !/(can't|cannot|ne peut pas|play only|jouer uniquement)/i.test(c.text||""))
   .sort((a,b)=>b.energy-a.energy);
  const unit=hand[0];
  if(unit){
   if(unit.energy>0)apply({type:"exhaust-runes",player:"ai",count:unit.energy});
   apply({type:"move",uid:unit.uid,zone:"base"});
  }
  apply({type:"phase",phase:"Ending"});
  apply({type:"next-turn"});
  return commands;
 }catch{return [];}
}
