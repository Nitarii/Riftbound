import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createState,applyCommand} from "../core.mjs";
import {planAutonomousAITurn} from "../ai-turn.mjs";
import {createIntegratedAI} from "../integrated-ai.mjs";
import {passShowdown} from "./showdown-helper.mjs";

const card=(name,extras={})=>({name,type:"Unit",energy:0,power:0,might:2,...extras});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen",{type:"Legend"}),
  champion:card("Shen Champion"),battlefield:card("Grove",{type:"Battlefield"})});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx",{type:"Legend"}),
  champion:card("Jinx Champion"),battlefield:card("Arena",{type:"Battlefield"}),
  main:Array.from({length:25},(_,i)=>card("Filler "+i,{energy:2})),
  runes:Array.from({length:12},()=>card("Chaos Rune",{type:"Rune",domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"phase",phase:"Main"});
 // Pre-clear automatic upkeep to isolate movement and its trigger.
 s.turnActions.channeled=2;
 s.turnActions.drawn=1;
 s=applyCommand(s,{type:"add",player:"ai",zone:"base",
  card:card("Effect Scout",{text:"When I move, choose a card and transform it."})});
 s=applyCommand(s,{type:"add",player:"ai",zone:"base",card:card("Reserve Scout")});
 return s;
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
test("AI commits first legal move, then pauses before moving more units or ending turn",()=>{
 const s=setup(),plan=planAutonomousAITurn(s);
 assert.ok(!plan.error,plan.error);
 assert.equal(plan.commands.filter(c=>c.type==="move").length,1);
 assert.equal(plan.commands.some(c=>c.type==="next-turn"),false);
 assert.equal(plan.state.pendingEffects.length,1);
 assert.equal(plan.state.active,"ai");
 assert.equal(plan.state.cards.find(c=>c.name==="Reserve Scout").zone,"base");
 let replay=s;
 for(const cmd of plan.commands)replay=applyCommand(replay,cmd);
 assert.deepEqual(replay.cards,plan.state.cards);
 assert.deepEqual(replay.pendingEffects,plan.state.pendingEffects);
});
test("after explicit effect confirmation, AI resumes safely and ends its turn",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rift-resume-"));
 let s=setup();const messages=[];let batches=0;
 const ai=createIntegratedAI({userData:dir,getState:()=>s,
  applyBatch:async(commands,revision)=>{
   assert.equal(s.revision,revision);
   batches++;
   for(const cmd of commands)s=applyCommand(s,cmd);
  },sendMessage:t=>messages.push(t),getMessages:()=>({session:"resume",messages:[]}),
  getCatalog:async()=>[],fetchImpl:async()=>{throw Error("Qwen must not be called");}});
 try{
  ai.configure({provider:"free",model:"qwen3:4b-instruct-2507",enabled:true});
  assert.equal(ai.advanceTurnIfAI(),true);
  await flush();
  assert.equal(batches,1);
  assert.equal(s.pendingEffects.length,1);
  assert.equal(s.active,"ai");
  // A pending effect must remain paused until the physical human confirms it.
  assert.equal(ai.advanceTurnIfAI(),true);
  await flush();
  assert.equal(batches,1);
  s=applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true});
  assert.equal(ai.advanceTurnIfAI(),true);
  await flush();
  assert.ok(batches>=2);
  for(let i=0;i<3&&s.active==="ai"&&s.pendingCombat;i++){
   s=passShowdown(s);
   ai.advanceTurnIfAI();
   await flush();
  }
  assert.equal(s.pendingEffects.length,0);
  assert.equal(s.active,"human");
  assert.ok(s.cards.find(c=>c.name==="Reserve Scout").zone==="battlefield");
  assert.ok(messages.some(t=>/Effet|effet/i.test(t)));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
