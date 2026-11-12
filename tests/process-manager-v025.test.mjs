import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createProcessDashboard} from "../process-dashboard.mjs";
import {createLocalWhisper} from "../whisper-local.mjs";
function mocks(){
 const events=[];
 const flags={enabled:true,active:true,installed:true,voiceInstalled:true,
  voiceEnabled:true,voiceActive:false,voiceInstalling:false,tunnelActive:true,
  qwenInstall:false};
 const integratedAI={
  status:()=>({enabled:flags.enabled,provider:"free",model:"qwen3:0.6b",processing:false}),
  disable:()=>{flags.enabled=false;events.push("ai-disable");}
 };
 const localFreeAI={
  status:()=>({processActive:flags.active,installed:flags.installed,
   installing:flags.qwenInstall,ready:flags.active,pid:flags.active?4321:null}),
  stop:()=>{flags.active=false;flags.qwenInstall=false;events.push("qwen-stop");}
 };
 const speech={
  status:()=>({processActive:flags.voiceActive,installed:flags.voiceInstalled,
   enabled:flags.voiceEnabled,selected:"base",pid:flags.voiceActive?7654:null,
   processing:flags.voiceActive,installing:flags.voiceInstalling}),
  stop:({disable=false}={})=>{
   flags.voiceActive=false;flags.voiceInstalling=false;
   if(disable)flags.voiceEnabled=false;
   events.push("whisper-stop"+(disable?":disable":""));
  },
  enable:()=>{
   if(!flags.voiceInstalled)throw Error("Whisper absent");
   flags.voiceEnabled=true;events.push("whisper-enable");
   return speech.status();
  }
 };
 const remoteAccess={
  status:()=>({active:flags.tunnelActive,starting:false,url:"",expiresAt:null}),
  stop:()=>{flags.tunnelActive=false;events.push("tunnel-stop");}
 };
 return {controller:createProcessDashboard({integratedAI,localFreeAI,speech,remoteAccess}),flags,events};
}
test("Process dashboard distinguishes installed model, actual Qwen server and idle Whisper",()=>{
 const {controller,flags}=mocks();
 let snap=controller.status();
 assert.equal(snap.scope,"companion-only");
 assert.equal(snap.companion.active,true);
 assert.equal(snap.qwen.active,true);
 assert.equal(snap.qwen.pid,4321);
 assert.equal(snap.qwen.enabled,true);
 assert.equal(snap.whisper.active,false,"installed Whisper is not a persistent service");
 assert.equal(snap.whisper.installed,true);
 assert.equal(snap.whisper.enabled,true);
 assert.equal(snap.whisper.pid,null);
 flags.active=false;
 snap=controller.status();
 assert.equal(snap.qwen.active,false,"configured AI is not a running process");
 assert.equal(snap.qwen.enabled,true);
});
test("Stopping only Qwen persists disable and terminates its owned process, not Whisper or tunnel",()=>{
 const {controller,events}=mocks();
 const response=controller.stop("qwen");
 assert.deepEqual(events,["ai-disable","qwen-stop"]);
 assert.equal(response.qwen.active,false);
 assert.equal(response.qwen.enabled,false);
 assert.equal(response.whisper.enabled,true);
 assert.equal(response.tunnel.active,true);
});
test("Stopping Whisper disables future transcription without closing the local companion",()=>{
 const {controller,flags,events}=mocks();
 flags.voiceActive=true;
 const snap=controller.stop("whisper");
 assert.deepEqual(events,["whisper-stop:disable"]);
 assert.equal(snap.companion.active,true);
 assert.equal(snap.whisper.active,false);
 assert.equal(snap.whisper.enabled,false);
 assert.equal(snap.qwen.active,true);
 assert.equal(snap.tunnel.active,true);
 const resumed=controller.enableWhisper();
 assert.equal(resumed.whisper.enabled,true);
 assert.deepEqual(events,["whisper-stop:disable","whisper-enable"]);
});
test("Stopping tunnel does not touch local Qwen or Whisper",()=>{
 const {controller,events}=mocks();
 const response=controller.stop("tunnel");
 assert.deepEqual(events,["tunnel-stop"]);
 assert.equal(response.tunnel.active,false);
 assert.equal(response.qwen.active,true);
 assert.equal(response.whisper.enabled,true);
});
test("Stop-all leaves server up, stops all engines and refuses invalid process names",()=>{
 const {controller,events}=mocks();
 assert.throws(()=>controller.stop("powershell"),/inconnu/);
 assert.deepEqual(events,[]);
 const all=controller.stop("all");
 assert.deepEqual(events,["ai-disable","qwen-stop","whisper-stop:disable","tunnel-stop"]);
 assert.equal(all.companion.active,true);
 assert.equal(all.qwen.active,false);
 assert.equal(all.whisper.active,false);
 assert.equal(all.whisper.enabled,false);
 assert.equal(all.tunnel.active,false);
});
test("Whisper permanent pause is saved only in the selected portable root and survives restart",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-process-status-"));
 try{
  const voice=createLocalWhisper({userData:dir});
  assert.equal(voice.status().enabled,true);
  voice.stop({disable:true});
  assert.equal(voice.status().enabled,false);
  const prefs=path.join(dir,"speech",".speech-preferences.json");
  assert.equal(JSON.parse(fs.readFileSync(prefs,"utf8")).enabled,false);
  assert.equal(createLocalWhisper({userData:dir}).status().enabled,false);
  assert.rejects(voice.transcribe(Buffer.from([1,2,3])),/désactivé/);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
test("Manager offers live status and individual/combined stop buttons without a model reinstall",()=>{
 const page=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 for(const id of ["process-dashboard","process-qwen-status","process-whisper-status",
  "process-tunnel-status","process-qwen-stop","process-whisper-stop",
  "process-whisper-enable","process-tunnel-stop","process-stop-all"])
  assert.ok(page.includes('id="'+id+'"'),"Missing "+id);
 assert.match(page,/\/api\/manager\/processes/);
 assert.match(page,/function renderProcesses/);
 assert.match(server,/createProcessDashboard/);
 assert.match(server,/\/api\/manager\/processes\/stop/);
 assert.match(server,/\/api\/manager\/processes\/whisper\/enable/);
});
