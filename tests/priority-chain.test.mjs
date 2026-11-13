import test from "node:test";
import assert from "node:assert/strict";
import {
 createPriorityChain,queuePendingChainItem,addOutstandingTask,
 completeOutstandingTask,finalizeNextItem,playReaction,passPriority
} from "../priority-chain.mjs";
test("FIFO finalization and LIFO resolution are distinct, including opposing reaction",()=>{
 let s=createPriorityChain({turnPlayer:"ai",kind:"showdown"});
 const first=queuePendingChainItem(s,{owner:"ai",kind:"ability",sourceUid:"a",text:"draw 1"});
 s=first.state;
 const second=queuePendingChainItem(s,{owner:"human",kind:"ability",sourceUid:"b",text:"deal 2"});
 s=second.state;
 assert.throws(()=>finalizeNextItem(s,{id:second.id,legal:true}),/FIFO/);
 s=finalizeNextItem(s,{id:first.id,legal:true,targets:[],payment:[]});
 s=finalizeNextItem(s,{id:second.id,legal:true});
 assert.deepEqual(s.stack.map(x=>x.id),[first.id,second.id]);
 const after1=passPriority(s,"ai");
 assert.equal(after1.resolving,null);
 assert.throws(()=>passPriority(after1.state,"ai"),/no priority/);
 const next=passPriority(after1.state,"human");
 assert.equal(next.resolving.id,second.id);
 const ready=playReaction(next.state,{player:"ai",item:{kind:"spell",owner:"ai",
  status:"finalized",sourceUid:"react",text:"Counter",targets:[],payment:[]}});
 assert.equal(ready.stack.length,2);
 const p=passPriority(ready,"human");
 const r=passPriority(p.state,"ai");
 assert.equal(r.resolving.sourceUid,"react");
 const p2=passPriority(r.state,"ai");
 const r2=passPriority(p2.state,"human");
 assert.equal(r2.resolving.id,first.id);
 const p3=passPriority(r2.state,"ai");
 const r3=passPriority(p3.state,"human");
 assert.equal(r3.windowClosed,true);
});
test("tasks block priority until the oldest outstanding rule procedure is performed",()=>{
 let s=createPriorityChain();
 const q=queuePendingChainItem(s,{owner:"ai",kind:"unit",sourceUid:"por"});
 s=addOutstandingTask(q.state,"Awaken");
 s=addOutstandingTask(s,"Beginning");
 assert.throws(()=>finalizeNextItem(s,{id:q.id,legal:true}),/Outstanding/);
 assert.throws(()=>completeOutstandingTask(s,"Beginning"),/Wrong/);
 s=completeOutstandingTask(s,"Awaken");
 s=completeOutstandingTask(s,"Beginning");
 assert.throws(()=>finalizeNextItem(s,{id:q.id,legal:false}),/not validated/);
 s=finalizeNextItem(s,{id:q.id,legal:true});
 assert.equal(s.stack[0].status,"finalized");
});
test("invalid, duplicate and malicious actions cannot mutate a legal chain",()=>{
 const s=createPriorityChain({turnPlayer:"human"});
 assert.throws(()=>queuePendingChainItem(s,{owner:"imposter"}),/Invalid/);
 assert.throws(()=>playReaction(s,{player:"ai",item:{}}),/no priority/);
 assert.throws(()=>playReaction(s,{player:"human",item:{kind:"spell",owner:"ai",status:"finalized"}}),/Reaction/);
 const q=queuePendingChainItem(s,{owner:"human",kind:"spell"});
 assert.throws(()=>finalizeNextItem(q.state,{id:q.id,targets:["x","x"],legal:true}),/Invalid chosen/);
 assert.deepEqual(s.stack,[]);
 assert.equal(s.priority,"human");
});
