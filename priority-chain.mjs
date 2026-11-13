// HOT FEPR / priority framework for the deterministic card rules engine.
//
// This module models rule timing ONLY; it does not claim a card's effect has
// resolved. The caller must validate exact card costs, legality and targets,
// and call its reducer when a finalized item reaches the top of the chain.
// Pending = queued by an effect. Finalized = costs and targets legally checked.
// Two consecutive passes resolve the newest finalized chain item (LIFO).
const OPPOSITE={ai:"human",human:"ai"};
const valid=p=>p==="ai"||p==="human";
const clone=s=>JSON.parse(JSON.stringify(s));
export function createPriorityChain({turnPlayer="human",kind="neutral"}={}){
 if(!valid(turnPlayer))throw Error("Invalid turn player");
 if(!["neutral","showdown"].includes(kind))throw Error("Invalid priority window");
 return {version:1,kind,turnPlayer,priority:turnPlayer,serial:0,
  passes:0,pending:[],stack:[],outstanding:[],resolved:[],closed:false};
}
function expectOpen(s){if(!s||s.closed)throw Error("Priority window is closed");}
function guard(s,player){expectOpen(s);if(player!==s.priority)throw Error("Player has no priority");}
export function queuePendingChainItem(state,{owner,sourceUid,kind="ability",text="",eventId=""}={}){
 expectOpen(state);
 if(!valid(owner)||!["ability","spell","unit","gear"].includes(kind))
  throw Error("Invalid queued item");
 const s=clone(state);
 if(s.pending.length+s.stack.length>=64)throw Error("Chain item cap reached");
 const id="chain_"+(++s.serial);
 s.pending.push({id,owner,sourceUid:String(sourceUid||"").slice(0,80),
  kind,text:String(text).slice(0,600),eventId:String(eventId).slice(0,100),
  status:"queued",targets:[],payment:null});
 return {state:s,id};
}
export function addOutstandingTask(state,task){
 expectOpen(state);
 if(typeof task!=="string"||!task.trim()||task.length>200)throw Error("Invalid task");
 const s=clone(state);if(s.outstanding.length>=64)throw Error("Task cap reached");
 s.outstanding.push(task);
 return s;
}
export function completeOutstandingTask(state,task){
 expectOpen(state);
 const s=clone(state);
 if(!s.outstanding.length||s.outstanding[0]!==task)throw Error("Wrong outstanding task");
 s.outstanding.shift();return s;
}
export function finalizeNextItem(state,{id,targets=[],payment=null,legal=false}={}){
 expectOpen(state);
 if(state.outstanding.length)throw Error("Outstanding tasks must resolve first");
 const s=clone(state),next=s.pending[0];
 if(!next||next.id!==id)throw Error("Finalize queued items in FIFO order");
 if(!legal)throw Error("Card costs, timing, zones and targets were not validated");
 if(!Array.isArray(targets)||targets.length>24||new Set(targets).size!==targets.length)
  throw Error("Invalid chosen targets");
 next.status="finalized";next.targets=targets;next.payment=payment;
 s.stack.push(s.pending.shift());
 s.priority=s.turnPlayer;s.passes=0;
 return s;
}
export function playReaction(state,{player,item}={}){
 guard(state,player);
 if(state.outstanding.length||state.pending.length)
  throw Error("Finish outstanding tasks and pending finalizations before reaction");
 if(!item||item.status!=="finalized"||!valid(item.owner)||
   item.owner!==player||!["spell","ability"].includes(item.kind))
  throw Error("Reaction must be a validated finalized Spell/Ability");
 const s=clone(state);
 if(s.stack.length>=64)throw Error("Chain item cap reached");
 s.stack.push({...item,id:"chain_"+(++s.serial)});
 s.priority=OPPOSITE[player];s.passes=0;
 return s;
}
export function passPriority(state,player){
 guard(state,player);
 if(state.outstanding.length||state.pending.length)
  throw Error("Handle outstanding tasks and finalizations before passing");
 const s=clone(state);
 s.passes++;
 if(s.passes===1){
  s.priority=OPPOSITE[player];
  return {state:s,resolving:null,windowClosed:false};
 }
 s.passes=0;
 const top=s.stack.pop()||null;
 if(!top){
  s.closed=true;
  return {state:s,resolving:null,windowClosed:true};
 }
 s.resolved.push(top.id);
 s.priority=s.turnPlayer;
 return {state:s,resolving:top,windowClosed:false};
}
