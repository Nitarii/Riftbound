import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {execFile,spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {promisify} from "node:util";
import {chromium} from "playwright-core";
import {ADVANCED_LOCAL_MODEL,DEFAULT_LOCAL_MODEL,LOCAL_MODELS} from "../local-ai-profiles.mjs";

const executable=path.resolve(process.argv[2]||"dist/desktop-publish/RiftboundCompanion.exe");
const version=(await fs.readFile(new URL("../desktop/RiftboundCompanion.csproj",import.meta.url),"utf8")).match(/<Version>([^<]+)<\/Version>/)?.[1];
await fs.mkdir("dist", {recursive:true});
const data=await fs.mkdtemp(path.resolve("dist/desktop-smoke-"));
const modelSource=process.env.RIFTBOUND_SMOKE_MODELS_ROOT;
const voiceSample=process.env.RIFTBOUND_SMOKE_WAV;
const useRemote=process.env.RIFTBOUND_SMOKE_REMOTE==="1";
const use9B=process.env.RIFTBOUND_SMOKE_QWEN==="9b";
const model=use9B?ADVANCED_LOCAL_MODEL:DEFAULT_LOCAL_MODEL;
if(modelSource&&voiceSample){
 const directories=["speech/engine","free-opponent/llama-b12277"];
 if(use9B)directories.push("free-opponent/llama-b12277-vulkan");
 for(const directory of directories){
  await fs.cp(path.join(modelSource,directory),path.join(data,directory),{recursive:true});
 }
 for(const file of ["speech/models/ggml-small.bin","free-opponent/models/"+LOCAL_MODELS[model].file]){
  const target=path.join(data,file);
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.link(path.join(modelSource,file),target);
 }
}
const socket=net.createServer();
socket.listen(0,"127.0.0.1");
await once(socket,"listening");
const debugURL="http://127.0.0.1:"+socket.address().port;
socket.close();
await once(socket,"close");

async function waitFor(test,timeout=30000){
 const deadline=Date.now()+timeout;
 let lastError;
 while(Date.now()<deadline){
  try{const value=await test();if(value)return value;}
  catch(error){lastError=error;}
  await delay(200);
 }
 throw Error("Desktop test timed out.",{cause:lastError});
}
function start(){
 return spawn(executable,["--data-dir",data],{stdio:"ignore",
  env:{...process.env,RIFTBOUND_DESKTOP_STARTUP_TRACE:"1",
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port="+new URL(debugURL).port}});
}
async function connect(){
 const startupLog=path.join(data,"temp","desktop-startup.log");
 try{
  await waitFor(async()=> (await fetch(debugURL+"/json/version",{signal:AbortSignal.timeout(500)})).ok);
 }catch(error){
  const startup=await fs.readFile(startupLog,"utf8").catch(()=>null);
  throw Error(startup||"WebView2 did not start. Host exit code: "+host.exitCode,{cause:error});
 }
 const browser=await chromium.connectOverCDP(debugURL);
 const page=await waitFor(()=>browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().startsWith("http://127.0.0.1:")));
 await page.locator(".desktop-app #home-create-game").waitFor();
 try{
  await waitFor(()=>page.locator("#home-create-game").isEnabled());
 }catch(error){
  const symptoms=await Promise.all(["#connection","#home-catalog-count","#home-feedback"].map(id=>page.locator(id).textContent()));
  const [snapshot,catalog]=await Promise.all([call(page,"/api/state"),call(page,"/api/catalog?limit=1")]);
  throw Error("Board setup unavailable. "+symptoms.join(" · ")+" · state HTTP "+snapshot.status+
   " · catalog HTTP "+catalog.status,{cause:error});
 }
 return {browser,page};
}
const call=(page,url,json)=>page.evaluate(async ({url,json})=>{
 const response=await fetch(url,{headers:{Authorization:"Bearer "+window.riftboundDesktop.token,
  "Content-Type":"application/json"},...(json?{method:"POST",body:JSON.stringify(json)}:{})});
 return {status:response.status,body:response.headers.get("content-type")?.includes("json")?await response.json():null};
},{url,json});
async function engineStopped(enginePid){
 await waitFor(()=>{
  try{process.kill(enginePid,0);return false;}
  catch(error){if(error.code==="ESRCH")return true;throw error;}
 });
}
async function closeWindow(pid){
 const command=`
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class RiftboundSmokeWindow {
  public delegate bool Inspect(IntPtr hwnd, IntPtr argument);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Inspect inspect, IntPtr argument);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  public static bool Close(uint pid) {
    bool posted = false;
    EnumWindows((hwnd, _) => {
      uint owner;
      GetWindowThreadProcessId(hwnd, out owner);
      if (owner != pid) return true;
      var text = new StringBuilder(256);
      GetWindowText(hwnd, text, text.Capacity);
      if (!text.ToString().StartsWith("Riftbound Companion", StringComparison.Ordinal)) return true;
      posted = PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero);
      return false;
    }, IntPtr.Zero);
    return posted;
  }
}
'@
if (![RiftboundSmokeWindow]::Close(${pid})) { exit 1 }`;
 await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{windowsHide:true});
}
async function pick(page,id,name,choice){
 await page.locator(id).fill(name);
 await page.getByRole("option",{name:choice}).first().click();
}
let host=start();
try{
 let {browser,page}=await connect();
 await page.locator(".remote-access-alternative > summary").click();
 assert.equal(await page.locator("#home-start-remote").isVisible(),true);
 assert.equal(await page.locator("#home-start-remote").isEnabled(),true);
 assert.equal((await call(page,"/manager.html")).status,404);
 assert.equal((await call(page,"/api/remote/status")).body.active,false);
 const health=(await call(page,"/api/health")).body;
 assert.equal(health.version,version);
 assert.equal((await call(page,"/api/pair",{})).status,404);
 const modules=(await call(page,"/api/manager/processes")).body;
 const pids=[modules.companion.pid];
 assert.equal(modules.qwen.active,false);
 assert.equal(modules.whisper.active,false);
 assert.ok((await call(page,"/api/catalog?limit=25000")).body.count>1000);

 await pick(page,"#home-human-legend","Shen",/Shen.*Eye of Twilight/i);
 await pick(page,"#home-human-champion","Shen",/Shen.*Leader of the Kinkou/i);
 await pick(page,"#home-human-battlefield","Grove of the God-Willow",/Grove of the God-Willow/i);
 await page.locator("#home-ai-deck").selectOption({label:await page.locator("#home-ai-deck option").filter({hasText:"Jinx"}).first().innerText()});
 await page.locator("#home-create-game").click();
 await page.locator("#game-app").waitFor();
 const opening=(await call(page,"/api/state")).body.state;
 assert.equal(opening.started,true);
 const invalid=await call(page,"/api/command",{type:"new-duel",ifRevision:opening.revision,
  legend:opening.players.human.champion.code,champion:opening.players.human.legend.code,
  battlefield:opening.battlefields[0].card.code,player:"human"});
 assert.equal(invalid.status,400);
 assert.equal((await call(page,"/api/state")).body.state.revision,opening.revision);
 assert.ok(opening.cards.filter(card=>card.owner==="ai"&&card.zone==="hand").every(card=>card.faceDown&&!card.name));
 if(useRemote){
  // Go back to the setup screen and activate the same gateway a player uses.
  await page.locator("#go-home").click();
  await page.locator("#home-start-remote").click();
  const session=await waitFor(async()=>{
   const status=(await call(page,"/api/remote/status")).body;
   return status.active&&status;
  },45000);
  const agent=(route,options={})=>fetch(session.url+route,{...options,
   headers:{Authorization:"Bearer "+session.agentToken,"Content-Type":"application/json"},signal:AbortSignal.timeout(5000)});
  const remoteState=await waitFor(async()=>{
   const response=await agent("/api/state");
   return response.ok&&(await response.json()).state;
  });
  assert.equal(remoteState.revision,opening.revision);
  assert.ok(!remoteState.decks);
  assert.ok(remoteState.cards.some(card=>card.owner==="ai"&&card.zone==="hand"&&card.name));
  assert.equal((await fetch(session.url+"/api/state",{signal:AbortSignal.timeout(5000)})).status,401);
  assert.equal((await (await agent("/openapi.json")).json()).info.version,version);
  assert.equal((await agent("/api/manager/status")).status,404);
  assert.equal((await agent("/agent/")).status,200);
  assert.equal((await call(page,"/api/ai/status")).body.enabled,false);
  assert.equal((await call(page,"/api/ai/free/desktop-enable",{})).status,409);
  const message=await agent("/api/messages",{method:"POST",body:JSON.stringify({text:"Réponse de l’agent de test."})});
  assert.equal(message.status,200);
  await waitFor(async()=> (await call(page,"/api/messages?after=0")).body.messages.some(
   entry=>entry.role==="ai"&&entry.text==="Réponse de l’agent de test."));
  await page.locator("#home-stop-remote").click();
  await waitFor(async()=>!(await call(page,"/api/remote/status")).body.active&&
   (await call(page,"/api/ai/status")).body.enabled);
  await page.locator("#home-resume").click();
  await page.locator("#game-app").waitFor();
  console.log("PASS: desktop HTTPS agent handoff, remote reply and local recovery.");
 }
 if(modelSource&&voiceSample){
  const data=Array.from(await fs.readFile(voiceSample));
  const transcript=await page.evaluate(async data=>{
   const response=await fetch("/api/speech/transcribe",{method:"POST",headers:{
    "Content-Type":"audio/wav",Authorization:"Bearer "+window.riftboundDesktop.token},body:new Uint8Array(data)});
   return response.json();
  },data);
  assert.match(transcript.text||transcript.error,/Disciple of Shen/i);
  assert.equal((await call(page,"/api/messages",{text:transcript.text,requestId:"desktop-smoke-voice"})).status,200);
  await waitFor(async()=> (await call(page,"/api/state")).body.state.cards.some(card=>
   card.owner==="human"&&card.name==="Disciple of Shen"&&card.zone==="base"));
  const speech=(await call(page,"/api/manager/processes")).body.whisper;
  assert.equal(speech.active,true);
  pids.push(speech.pid);
  const profile=(await call(page,"/api/ai/free/status")).body;
  if(use9B)assert.equal(profile.selectedModel,model);
  assert.equal((await call(page,"/api/ai/free/desktop-install",use9B?{}:{model,backend:"cpu"})).status,202);
  await waitFor(async()=>{
   const status=(await call(page,"/api/ai/status")).body;
   return status.model===model&&status.enabled&&!status.rulesOnly;
  },60000);
  assert.equal((await call(page,"/api/manager/processes")).body.qwen.active,false);
  await call(page,"/api/messages",{text:"Salut ! Quelle est ta stratégie préférée ?",requestId:"desktop-smoke-qwen"});
  const qwen=await waitFor(async()=>{
   const status=(await call(page,"/api/manager/processes")).body.qwen;
   return status.active&&status.ready&&status;
  },60000);
  pids.push(qwen.pid);
  const running=(await call(page,"/api/ai/free/status")).body;
  assert.equal(running.backend,use9B?"vulkan":"cpu");
  await waitFor(async()=>{
   const messages=(await call(page,"/api/messages?after=0")).body.messages;
   const question=messages.findLastIndex(message=>message.role==="human"&&message.text.includes("stratégie préférée"));
   const reply=messages.slice(question+1).find(message=>message.role==="ai");
   return question>=0&&reply&&!reply.text.startsWith("⚠")&&reply;
  },50000);
  assert.equal((await call(page,"/api/ai/rules/activate",{})).status,200);
  console.log(`PASS: real Whisper WAV to game action and ${model} launched on demand with ${running.backend}.`);
 }
 await call(page,"/api/messages",{text:"Je termine mon tour.",requestId:"desktop-smoke-turn"});
 const after=await waitFor(async()=>{
  const state=(await call(page,"/api/state")).body.state;
  return state.turn>opening.turn&&state.active==="human"&&state;
 });
 await page.locator("#language-select").selectOption("en");
 await waitFor(async()=>JSON.parse(await fs.readFile(path.join(data,"desktop-preferences.json"),"utf8"))==="en");
 await fs.mkdir("artifacts",{recursive:true});
 await page.screenshot({path:"artifacts/desktop-board.png"});
 const killed=once(host,"exit");
 host.kill();
 await killed;
 await Promise.all(pids.map(engineStopped));
 await browser.close().catch(()=>{});

 host=start();
 ({browser,page}=await connect());
 assert.equal(await page.locator("#language-select").inputValue(),"en");
 const restored=(await call(page,"/api/state")).body.state;
 assert.equal(restored.turn,after.turn);
 assert.equal(restored.revision,after.revision);
 await page.locator("#home-resume").click();
 await page.locator("#game-app").waitFor();
 const secondPid=(await call(page,"/api/manager/processes")).body.companion.pid;
 const exited=once(host,"exit");
 await closeWindow(host.pid);
 await exited;
 await engineStopped(secondPid);
 await browser.close().catch(()=>{});
 console.log("PASS: embedded WebView2, offline catalog, duel, hidden hand, AI turn, save/resume, language and process shutdown.");
}finally{
 if(host.exitCode===null&&!host.killed){
  const exited=once(host,"exit");host.kill();await exited;
 }
}
