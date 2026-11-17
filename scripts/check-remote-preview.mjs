// End-to-end check over an actual temporary tunnel with a synthetic table.
// The URL and one-time token exist only in this process.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as pause} from "node:timers/promises";

const port=21967,base="http://127.0.0.1:"+port;
const token=crypto.randomBytes(24).toString("hex");
const dist=path.resolve("dist");
const root=await fs.mkdtemp(path.join(dist,"test-remote-"));
const child=spawn(path.join(dist,"RiftboundCompanion.exe"),["--no-browser"],{
 cwd:root,windowsHide:true,stdio:"ignore",env:{
  ...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,RIFTBOUND_PORTABLE_TEST:"1",
  RIFTBOUND_DATA_DIR:root,RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_TEST_NO_MIGRATION:"1"
 }
});
const closed=once(child,"close");
void closed.catch(()=>{});
async function request(origin,route,secret,body,timeout=5000){
 const res=await fetch(origin+route,{signal:AbortSignal.timeout(timeout),redirect:"error",
  method:body?"POST":"GET",
  headers:{...(secret?{Authorization:"Bearer "+secret}:{}),"Content-Type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const type=res.headers.get("content-type")||"";
 return {status:res.status,data:type.includes("application/json")?await res.json():await res.text()};
}
const local=(route,body,timeout)=>request(base,route,token,body,timeout);
async function poll(fn,description,timeout=10000){
 const until=Date.now()+timeout;
 while(Date.now()<until){
  try{const result=await fn();if(result)return result;}catch{}
  await pause(200);
 }
 throw Error(description);
}
const card=(name,type="Unit",energy=1)=>({name,type,energy,power:0,might:2});
try{
 await poll(async()=>(await local("/api/health")).data.ok,"Le compagnon Windows n’a pas démarré.");
 const command=async(action)=>{
  const {data:{state}}=await local("/api/state");
  const result=await local("/api/command",{...action,ifRevision:state.revision,commandId:crypto.randomUUID()});
  assert.equal(result.status,200,result.data.error);
  return result.data.state;
 };
 await command({type:"setup-human",legend:card("Test Human","Legend"),champion:card("Test Champion"),
  battlefield:card("Grove","Battlefield")});
 await command({type:"setup-ai",legend:card("Test AI","Legend"),champion:card("Test AI Champion"),
  battlefield:card("Zaun","Battlefield"),main:Array.from({length:12},(_,i)=>card("AI test unit "+i)),
  runes:Array.from({length:12},()=>card("Order Rune","Rune")),mainIncludesChampion:false});
 const enabled=await local("/api/ai/rules/activate",{});
 assert.equal(enabled.data.rulesOnly,true);
 const start=await local("/api/remote/start",{},45000);
 assert.equal(start.status,200,typeof start.data.error==="string"?start.data.error:"Tunnel indisponible");
 assert.equal(start.data.active,true);
 assert.ok(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(start.data.url));
 const agent=(route,body)=>request(start.data.url,route,start.data.agentToken,body);
 await poll(async()=>(await agent("/api/state")).status===200,
  "Le tunnel a fourni une URL, mais le plateau n’est pas accessible par HTTPS.",30000);
 assert.equal((await request(start.data.url,"/api/state",null)).status,401);
 assert.equal((await agent("/api/manager/status")).status,404);
 const guide=(await agent("/api/guide")).data;
 assert.equal(guide.commands.cast.type,"cast");
 assert.equal(guide.commands.activate.type,"activate");
 assert.equal(guide.commands["chain-pass"].type,"chain-pass");
 assert.equal(guide.commands["rewind-combat"],undefined);
 assert.equal(guide.commands["cancel-follow-up"],undefined);
 assert.equal((await agent("/api/command",{type:"rewind-combat"})).status,403);
 assert.equal((await agent("/api/command",{type:"cancel-follow-up"})).status,403);
 assert.equal(guide.endpoints["GET /api/ai/status"],undefined);
 assert.equal((await local("/api/ai/status")).data.enabled,false);
 assert.equal((await local("/api/ai/rules/activate",{})).status,409);
 const startState=await command({type:"start",player:"human"});
 await command({type:"add",player:"human",card:{...card("Public test defender"),might:3},zone:"battlefield",battlefield:0});
 const hide=await local("/api/messages",{text:"Je cache une carte au Grove."});
 const pass=await poll(async()=>{
  const r=await agent("/api/messages?after=0");
  return r.data.messages?.find(m=>m.id===hide.data.message.id&&m.table?.status==="applied");
 },"L’annonce de la carte cachée n’a pas été transmise avec son résultat.");
 assert.ok(pass.table.revision>startState.revision);
 const hidden=(await agent("/api/state")).data.state.cards.find(c=>c.zone==="hidden");
 assert.equal(hidden.owner,"human");
 assert.equal(hidden.faceDown,true);
 assert.equal(hidden.name,undefined);
 assert.equal(hidden.type,undefined);
 const showBoard=await local("/api/messages",{text:"Tu peux m’afficher l’état du plateau actuel ?"});
 const boardExchange=await poll(async()=>{
  const {data}=await agent("/api/messages?after="+hide.data.message.id);
  const read=data.messages?.find(m=>m.id===showBoard.data.message.id&&m.table?.status==="unchanged");
  const reply=data.messages?.find(m=>m.id>showBoard.data.message.id&&m.view?.kind==="board");
  return read&&reply?{read,reply}:null;
 },"Le résumé public du plateau n’a pas été transmis à l’agent.");
 assert.equal(boardExchange.read.table.revision,(await agent("/api/state")).data.state.revision);
 assert.match(boardExchange.reply.text,/Public test defender/);
 assert.doesNotMatch(boardExchange.reply.text,/AI test unit/);
 const end=await local("/api/messages",{text:"Je passe mon tour."});
 const announcement=await poll(async()=>{
  const r=await agent("/api/messages?after="+hide.data.message.id);
  return r.data.messages?.find(m=>m.id===end.data.message.id&&m.table?.status==="applied");
 },"L’agent ne reçoit pas le passage de tour avec son résultat.");
 const {data:{state:turn}}=await agent("/api/state");
 assert.equal(turn.active,"ai");
 assert.equal(turn.revision,announcement.table.revision);
 assert.ok(!turn.decks);
 const playable=turn.cards.find(c=>c.owner==="ai"&&c.zone==="hand");
 assert.ok(playable?.name);
 const play={type:"play-paid",uid:playable.uid,ifRevision:turn.revision,commandId:crypto.randomUUID()};
 const played=await agent("/api/command",play);
 assert.equal(played.data.receipt.status,"applied");
 assert.equal(played.data.state.cards.find(c=>c.uid===playable.uid).zone,"base");
 const duplicate=await agent("/api/command",play);
 assert.equal(duplicate.data.receipt.status,"duplicate");
 const response=await agent("/api/messages",{text:"Je joue une unité de test et je rends la main."});
 assert.equal(response.data.message.role,"ai");
 const localMessages=(await local("/api/messages?after=0")).data.messages;
 assert.ok(localMessages.some(m=>m.id===response.data.message.id&&m.text===response.data.message.text));
 const ready=await agent("/api/command",{type:"ready",uid:playable.uid,
  ifRevision:played.data.state.revision,commandId:crypto.randomUUID()});
 assert.equal(ready.status,200,ready.data.error);
 const attack=await agent("/api/command",{type:"combat-attack",player:"ai",battlefield:0,uids:[playable.uid],
  ifRevision:ready.data.state.revision,commandId:crypto.randomUUID()});
 assert.equal(attack.status,200,attack.data.error);
 const opening=await agent("/api/command",{type:"combat-pass",player:"ai",
  ifRevision:attack.data.state.revision,commandId:crypto.randomUUID()});
 assert.equal(opening.status,200,opening.data.error);
 await command({type:"combat-pass",player:"human"});
 const rewind=await local("/api/messages",{text:"Non, on annulait ça. Reviens au moment où tu m’attaques."});
 assert.equal(rewind.status,200);
 const rewound=await poll(async()=>{
  const {data}=await agent("/api/messages?after="+response.data.message.id);
  return data.messages?.find(m=>m.id===rewind.data.message.id&&m.table?.status==="applied");
 },"L’agent n’a pas reçu l’annulation locale.");
 const resumed=(await agent("/api/state")).data.state;
 assert.equal(resumed.revision,rewound.table.revision);
 assert.equal(resumed.combatRewindId,undefined);
 assert.deepEqual(resumed.pendingCombat,opening.data.state.pendingCombat);
 const resolved=await command({type:"combat-pass",player:"human"});
 const turnEnd=await agent("/api/command",{type:"next-turn",ifRevision:resolved.revision,
  commandId:crypto.randomUUID()});
 assert.equal(turnEnd.status,200,turnEnd.data.error);
 assert.equal(turnEnd.data.state.active,"human");
 const stop=await local("/api/remote/stop",{});
 assert.equal(stop.data.active,false);
 assert.equal((await local("/api/remote/status")).data.active,false);
 console.log("PASS: accès HTTPS, prise de relais, annonces du joueur, retour à l’attaque, contrôle du plateau, réponse et fermeture.");
}finally{
 try{await local("/api/remote/stop",{},2000);}catch{}
 try{await local("/api/manager/stop",{confirm:"STOP_RIFTBOUND"},2000);}catch{}
 await Promise.race([closed.catch(()=>{}),pause(1500)]);
 if(child.exitCode===null)child.kill();
 await closed.catch(()=>{});
}
