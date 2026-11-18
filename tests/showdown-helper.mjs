import {applyCommand} from "../core.mjs";
export function passShowdown(state){
 while(state.pendingCombat&&
       (!state.pendingCombat.passes.human||!state.pendingCombat.passes.ai)){
  state=applyCommand(state,{type:"combat-pass",player:state.pendingCombat.focus??"human"});
 }
 return state;
}
