import {applyCommand} from "../core.mjs";
export function resolveTop(state){
 for(let i=0;i<2;i++)state=applyCommand(state,{type:"chain-pass",player:state.spellChain.priority});
 return state;
}
export function passShowdown(state){
 while(state.pendingCombat&&
       (!state.pendingCombat.passes.human||!state.pendingCombat.passes.ai)){
  state=applyCommand(state,{type:"combat-pass",player:state.pendingCombat.focus??"human"});
 }
 return state;
}
