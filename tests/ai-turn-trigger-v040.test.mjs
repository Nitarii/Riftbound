import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createState,applyCommand} from "../core.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
import {createIntegratedAI} from "../integrated-ai.mjs";

const unit=(name,energy=1)=>({name,code:name.replaceAll(" ","-"),
 type:"Unit",energy,power:0,might:2,text:""});
const rune={name:"Fury Rune",code:"FURY-RUNE",type:"Rune",domains:["Fury"]};
function game(){
 let state=createState();
 state=applyCommand(state,{type:"setup-human",legend:{name:"Shen",type:"Legend"},
  champion:unit("Shen, Leader",2),battlefield:{name:"Grove",type:"Battlefield"}});
 state=applyCommand(state,{type:"setup-ai",legend:{name:"Zed",type:"Legend"},
  champion:unit("Zed, Without a Sound",3),
  battlefield:{name:"Zaun Warrens",type:"Battlefield"},
  main:Array.from({length:39},(_,i)=>unit("AI Recruit "+i,1)),
  runes:Array.from({length:12},()=>rune),mainIncludesChampion:false});
 return advanceMandatoryTurn(applyCommand(state,{type:"start",player:"human"}));
}
function harness(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rift-ai-turn-"));
 let state=game(),calls=0,requests=0;
 const messages=[],resolveList=[];
 const ai=createIntegratedAI({
  userData:dir,getState:()=>state,getCatalog:async()=>[],
  getMessages:()=>({session:"test-session",messages:[]}),
  sendMessage:t=>{messages.push(t);resolveList.splice(0).forEach(fn=>fn());},
  applyBatch:async(commands,revision)=>{
   assert.equal(state.revision,revision);
   calls++;
   for(const cmd of commands){
    state=applyCommand(state,cmd);
    if(cmd.type==="next-turn")state=advanceMandatoryTurn(state);
   }
  },
  fetchImpl:async(_url,options)=>{
   requests++;
   return new Promise((resolve,reject)=>{
    options.signal.addEventListener("abort",()=>{
     const err=new Error("Aborted");err.name="AbortError";reject(err);
    },{once:true});
   });
  }
 });
 ai.configure({provider:"free",model:"qwen3:4b-instruct-2507",enabled:true});
 const wait=async(ms=1400)=>{
  if(messages.length)return;
  await Promise.race([new Promise(resolve=>resolveList.push(resolve)),
   new Promise((_,reject)=>setTimeout(()=>reject(Error("AI turn stayed idle")),ms))]);
 };
 return {ai,messages,wait,
  get state(){return state},
  get calls(){return calls},
  get requests(){return requests},
  toAITurn(){
   state=advanceMandatoryTurn(applyCommand(state,{type:"next-turn"}));
   assert.equal(state.active,"ai");
   assert.equal(state.phase,"Main");
   assert.equal(state.turnActions.channeled,3);
   assert.equal(state.turnActions.drawn,1);
  },
  dispose(){fs.rmSync(dir,{recursive:true,force:true});}
 };
}
test("voice or chat end-turn with actionApplied MUST start AI Main without waiting for Qwen",async()=>{
 const h=harness();
 try{
  h.toAITurn();
  h.ai.onHumanMessage("Je termine mon tour. À toi de jouer.",{actionApplied:true});
  await h.wait();
  assert.equal(h.calls,1);
  assert.equal(h.requests,0,"Deterministic turn must not issue a slow Qwen request");
  assert.equal(h.state.active,"human");
  // The planner may legally decline unknown or unsafe card plays; it must
  // always finish or explicitly signal a pending effect instead of waiting.
  assert.ok(h.state.revision>0);
  assert.match(h.messages[0],/joué|terminé|conquête|à toi/i);
 }finally{h.dispose();}
});
test("toolbar next-turn can trigger AI independently of a human chat message",async()=>{
 const h=harness();
 try{
  h.toAITurn();
  assert.equal(h.ai.advanceTurnIfAI(),true);
  await h.wait();
  assert.equal(h.calls,1);
  assert.equal(h.state.active,"human");
  assert.equal(h.ai.advanceTurnIfAI(),false);
 }finally{h.dispose();}
});
test("pending human-chat model request is aborted; AI turn bypasses it immediately",async()=>{
 const h=harness();
 try{
  h.ai.onHumanMessage("Bonjour.");
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(h.requests,1);
  h.toAITurn();
  h.ai.onHumanMessage("Je passe.",{actionApplied:true});
  await h.wait();
  assert.equal(h.calls,1);
  assert.equal(h.state.active,"human");
  assert.equal(h.requests,1);
  assert.ok(!h.messages.some(x=>/Aborted|délai/i.test(x)));
 }finally{h.dispose();}
});
test("duplicate turn notifications never double-play, draw or advance phases",async()=>{
 const h=harness();
 try{
  h.toAITurn();
  h.ai.advanceTurnIfAI();
  h.ai.advanceTurnIfAI();
  h.ai.onHumanMessage("Terminé",{actionApplied:true});
  await h.wait();
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(h.calls,1);
  assert.equal(h.state.active,"human");
  assert.ok(h.state.players.ai.handCount<=5,
   "AI hand must not be duplicated by repeated notifications");
 }finally{h.dispose();}
});
