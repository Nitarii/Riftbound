// A real Windows SEA test. The installed client and its saves are never touched.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {CURRENT_VERSION} from "../release-policy.mjs";
import {previewCombat} from "../combat-engine.mjs";

const port=21966,origin="http://127.0.0.1:"+port;
const token=crypto.randomBytes(20).toString("hex");
const dist=path.resolve("dist");
const app=path.join(dist,"RiftboundCompanion.exe");
const root=await fs.mkdtemp(path.join(dist,"test-http-"));
let child,closed;
function launch(){
 child=spawn(app,["--no-browser"],{cwd:root,windowsHide:true,stdio:"ignore",env:{
  ...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,RIFTBOUND_PORTABLE_TEST:"1",
  RIFTBOUND_DATA_DIR:root,RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_TEST_NO_MIGRATION:"1"
 }});
 closed=once(child,"close");
 void closed.catch(()=>{});
}
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
async function ready(){
 for(let i=0;i<40;i++){
  try{const health=(await request("/api/health")).value;if(health.ok)return health;}catch{}
  await delay(150);
 }
 throw Error("Windows companion did not start");
}
async function stop(){
 const stopped=await request("/api/manager/stop",{confirm:"STOP_RIFTBOUND"});
 assert.equal(stopped.value.ok,true);
 await Promise.race([closed,delay(6000,null,{ref:false}).then(()=>{throw Error("Windows companion did not exit");})]);
}
launch();
try{
 const health=await ready();
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
 const zedDeck={type:"setup-ai",legend:card("Zed","Legend"),champion:card("Zed Champion"),
  battlefield:card("Zaun","Battlefield"),main:Array.from({length:12},(_,i)=>card("Secret "+i)),
  runes:Array.from({length:12},()=>card("Fury Rune","Rune")),mainIncludesChampion:false};
 let response=await cmd(zedDeck,rolled.value.state.revision);
 const hidden=response.value.state;
 assert.equal(hidden.players.ai.handCount,4);
 assert.ok(hidden.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").every(c=>!c.name&&c.faceDown));
 assert.equal(hidden.decks,undefined);
 assert.equal(hidden.rng,undefined);
 assert.ok(!(JSON.stringify(hidden).includes("Secret")));
 const shenDeck={type:"setup-human",legend:card("Shen","Legend"),champion:card("Shen Champion"),
  battlefield:card("Grove","Battlefield")};
 response=await cmd(shenDeck,hidden.revision);
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
 assert.equal((await request("/api/ai/disable",{})).status,200);
 async function apply(action){
  const result=await cmd(action,state.revision);
  assert.equal(result.status,200,result.value.error);
  state=result.value.state;
  return state;
 }
 const put=(player,value,zone,battlefield)=>apply({type:"add",player,card:value,zone,battlefield});
 await apply({type:"reset"});
 await apply(shenDeck);
 await apply(zedDeck);
 await apply({type:"start",player:"ai"});
 await apply({type:"phase",phase:"Main"});
 for(const player of ["human","ai"])await apply({type:"score",player,set:true,value:6});
 const disciple={...card("Disciple of Shen"),code:"VEN-117",might:1,
  text:"I have [Shield 3] while I'm at a battlefield with exactly one other unit you control."};
 await put("human",disciple,"battlefield",0);
 for(let i=0;i<3;i++)await put("human",card("Physical Rune","Rune"),"runes");
 await put("ai",{...card("Blade Twirler"),code:"VEN-002",might:4},"base");
 await put("ai",{...card("Shadow Assassin"),code:"VEN-013",might:5},"base");
 const blade=state.cards.find(c=>c.code==="VEN-002");
 const assassin=state.cards.find(c=>c.code==="VEN-013");
 await apply({type:"combat-attack",player:"ai",uids:[blade.uid,assassin.uid],battlefield:0,burnPlayer:"ai"});
 const opening=await apply({type:"combat-pass",player:"ai"});
 const burned=opening.cards.find(c=>c.owner==="ai"&&c.zone==="trash");
 assert.ok(burned,"Blade Twirler milled a card face up");
 assert.equal(opening.pendingCombat.focus,"human");
 const soulspinner={...card("Soulspinner"),code:"VEN-123",energy:3};
 await apply({type:"play-physical",ambush:true,card:soulspinner,battlefield:0});
 assert.equal(previewCombat(state,0,"ai").defendingMight,7);
 await apply({type:"combat-order",player:"human",uids:[assassin.uid,blade.uid]});
 await apply({type:"combat-pass",player:"ai"});
 await apply({type:"combat-pass",player:"human"});
 assert.equal(state.pendingCombat,null);
 assert.equal(state.players.ai.score,7);
 assert.deepEqual(state.scoredFields.ai,[0]);
 const abandonedRevision=state.revision;
 await stop();
 launch();
 await ready();
 assert.equal((await request("/api/state")).value.state.revision,abandonedRevision);
 assert.equal((await cmd({type:"rewind-combat"},opening.revision)).status,400);
 const announcement={text:"Non, on annulait ça. Reviens au moment où tu m’attaques.",requestId:crypto.randomUUID()};
 const rewind=await request("/api/messages",announcement);
 assert.equal(rewind.status,200);
 assert.equal((await request("/api/messages",announcement)).value.message.id,rewind.value.message.id);
 let message;
 for(let i=0;i<30;i++){
  const {value:thread}=await request("/api/messages");
  message=thread.messages.find(m=>m.id===rewind.value.message.id);
  if(message?.table?.status&&message.table.status!=="pending")break;
  await delay(50);
 }
 assert.equal(message?.table?.status,"applied");
 state=(await request("/api/state")).value.state;
 assert.equal(state.revision,abandonedRevision+1);
 assert.equal(message.table.revision,state.revision);
 assert.equal(state.history[0].rewoundTo,opening.revision);
 assert.equal(state.combatRewindId,undefined);
 assert.equal(state.decks,undefined);
 assert.deepEqual(state.pendingCombat,opening.pendingCombat);
 assert.deepEqual(state.players,opening.players);
 assert.deepEqual(state.scoredFields,opening.scoredFields);
 assert.deepEqual(state.cards,opening.cards);
 assert.equal(state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length,3);
 assert.equal(state.cards.filter(c=>c.owner==="ai"&&c.zone==="trash")[0].uid,burned.uid);
 assert.equal(previewCombat(state,0,"ai").attackingMight,9);
 assert.equal(previewCombat(state,0,"ai").defendingMight,1);
 await stop();
 launch();
 await ready();
 assert.equal((await request("/api/messages",announcement)).value.message.id,rewind.value.message.id);
 assert.equal((await request("/api/state")).value.state.revision,state.revision);
 assert.equal((await request("/api/messages",{...announcement,text:"Je passe."})).status,400);
 await apply({type:"combat-pass",player:"human"});
 await apply({type:"next-turn"});
 assert.equal((await cmd({type:"rewind-combat"},state.revision)).status,400);
 await stop();
 console.log("PASS: packaged Windows, priority, receipts, race, undo, hidden data, opponent without Qwen, Shen–Zed attack rewind after restart.");
}finally{
 if(child.exitCode===null)child.kill();
 await closed.catch(()=>{});
}
