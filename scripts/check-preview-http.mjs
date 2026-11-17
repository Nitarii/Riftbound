// A real Windows SEA test. The installed client and its saves are never touched.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {CURRENT_VERSION} from "../release-policy.mjs";

const port=21966,origin="http://127.0.0.1:"+port;
const token=crypto.randomBytes(20).toString("hex");
const dist=path.resolve("dist");
const app=path.join(dist,"RiftboundCompanion.exe");
const root=await fs.mkdtemp(path.join(dist,"test-http-"));
const child=spawn(app,["--no-browser"],{cwd:root,windowsHide:true,stdio:"ignore",env:{
 ...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,RIFTBOUND_PORTABLE_TEST:"1",
 RIFTBOUND_DATA_DIR:root,RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_TEST_NO_MIGRATION:"1"
}});
const closed=once(child,"close");
void closed.catch(()=>{});
async function request(route,body,authenticated=true){
 const response=await fetch(origin+route,{
  signal:AbortSignal.timeout(2500),
  method:body?"POST":"GET",
  headers:{...(authenticated?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const type=response.headers.get("content-type");
 return {status:response.status,value:type?.includes("json")?await response.json():await response.text()};
}
const cmd=(command,ifRevision)=>request("/api/command",{
 commandId:crypto.randomUUID(),...command,ifRevision
});
try{
 let health;
 for(let i=0;i<40;i++){
  try{health=(await request("/api/health")).value;if(health.ok)break;}catch{}
  await delay(150);
 }
 assert.equal(health?.version,CURRENT_VERSION);
 assert.equal(health.packaged,true);
 assert.equal((await request("/api/state",null,false)).status,401);
 assert.equal((await request("/api/speech/synthesis",{text:"test"},false)).status,401);
 assert.match((await request("/verified-cards.mjs")).value,/verifiedSpell/);
 assert.match((await request("/manager.html")).value,/ai-rules-only/);
 const initial=(await request("/api/state")).value.state;
 const input={type:"note",ifRevision:initial.revision,commandId:crypto.randomUUID(),text:"test unique"};
 const first=await request("/api/command",input);
 const duplicate=await request("/api/command",input);
 assert.equal(first.value.receipt.status,"applied");
 assert.equal(duplicate.value.receipt.status,"duplicate");
 assert.equal(first.value.state.revision,duplicate.value.state.revision);
 const revision=first.value.state.revision;
 const race=await Promise.all([cmd({type:"note",text:"A"},revision),cmd({type:"note",text:"B"},revision)]);
 assert.deepEqual(race.map(x=>x.status).sort(),[200,400]);
 const rolled=await cmd({type:"undo"},revision+1);
 assert.equal(rolled.value.state.revision,revision+2);
 assert.equal(rolled.value.state.history[1].text,"test unique");
 const card=(name,type="Unit")=>({name,type,energy:2,power:0,might:3});
 let response=await cmd({type:"setup-ai",legend:card("Zed","Legend"),champion:card("Zed Champion"),
  battlefield:card("Zaun","Battlefield"),main:Array.from({length:12},(_,i)=>card("Secret "+i)),
  runes:Array.from({length:12},()=>card("Fury Rune","Rune")),mainIncludesChampion:false},rolled.value.state.revision);
 const hidden=response.value.state;
 assert.equal(hidden.players.ai.handCount,4);
 assert.ok(hidden.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").every(c=>!c.name&&c.faceDown));
 assert.equal(hidden.decks,undefined);
 assert.equal(hidden.rng,undefined);
 assert.ok(!(JSON.stringify(hidden).includes("Secret")));
 response=await cmd({type:"setup-human",legend:card("Shen","Legend"),champion:card("Shen Champion"),
  battlefield:card("Grove","Battlefield")},hidden.revision);
 assert.equal((await request("/api/ai/rules/activate",{})).value.rulesOnly,true);
 response=await cmd({type:"start",player:"ai"},response.value.state.revision);
 assert.equal(response.status,200);
 let state;
 for(let i=0;i<40;i++){
  state=(await request("/api/state")).value.state;
  if(state.active==="human")break;
  await delay(75);
 }
 assert.equal(state.active,"human","the AI finishes its turn on a fresh install without model files");
 const added=await cmd({type:"add",player:"human",card:card("Test Scout"),zone:"base"},state.revision);
 const scout=added.value.state.cards.find(c=>c.name==="Test Scout");
 const move=await cmd({type:"move",uid:scout.uid,zone:"battlefield",battlefield:0},added.value.state.revision);
 assert.equal(move.value.state.players.human.score,0);
 assert.equal(move.value.state.pendingCombat.focus,"human");
 await cmd({type:"combat-pass",player:"human"},move.value.state.revision);
 for(let i=0;i<40;i++){
  state=(await request("/api/state")).value.state;
  if(state.players.human.score===1)break;
  await delay(75);
 }
 assert.equal(state.players.human.score,1);
 assert.equal(state.pendingCombat,null);
 const stopped=await request("/api/manager/stop",{confirm:"STOP_RIFTBOUND"});
 assert.equal(stopped.value.ok,true);
 await Promise.race([closed,delay(6000).then(()=>{if(child.exitCode===null)throw Error("Windows companion did not exit");})]);
 console.log("PASS: packaged Windows, strict priority, receipts, race, undo, hidden data, opponent without Qwen.");
}finally{
 if(child.exitCode===null)child.kill();
 await closed.catch(()=>{});
}
