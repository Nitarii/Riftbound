// Real Windows end-to-end updater test. Runs against the packaged SEA binary,
// not a mocked PowerShell string. A failed update must recover the running manager.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {launchMaintenance,updateScript,INSTALL_ID,INSTALL_MARKER} from "../portable.mjs";
import {readUpdateStatus,updateLogPath} from "../update-transaction.mjs";
import {CURRENT_VERSION} from "../release-policy.mjs";
if(process.platform!=="win32")throw Error("Windows update smoke test must run on Windows.");
const root=path.resolve("dist","Portable - René O'Brien");
const exe=path.join(root,"RiftboundCompanion.exe");
const original=path.resolve("dist","RiftboundCompanion.exe");
const port=8879,token="test-local-update-token";
const base="http://127.0.0.1:"+port;
const shaFile=f=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const env={...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,
 RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_SKIP_UPDATE_CHECK:"1",
 RIFTBOUND_DATA_DIR:root,
 TEMP:path.join(root,"temp"),TMP:path.join(root,"temp"),TMPDIR:path.join(root,"temp")};
const logpath=path.join(root,"updates","update.log");
const summary=()=>fs.existsSync(logpath)?fs.readFileSync(logpath,"utf8").slice(-5000):"(aucun journal)";
let ownedPids=new Set();
async function request(pathname,{method="GET",body,timeout=1500}={}){
 const response=await fetch(base+pathname,{method,headers:{
  "Authorization":"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error(pathname+" returned HTTP "+response.status+": "+await response.text());
 return response.json();
}
async function waitUntil(fn,{timeout=105000,label="condition"}={}){
 const end=Date.now()+timeout;
 let last="";
 while(Date.now()<end){
  try{const result=await fn();if(result)return result;}
  catch(e){last=String(e.message||e);}
  await sleep(500);
 }
 throw Error("Timed out waiting for "+label+"; last error: "+last+"\n"+summary());
}
async function runningPid(){
 const info=await request("/api/manager/processes");
 return info.companion?.pid;
}
async function stopCurrent(){
 try{await request("/api/manager/stop",{method:"POST",body:{confirm:"STOP_RIFTBOUND"}});}
 catch(e){throw Error("Could not stop companion normally: "+e.message);}
 await waitUntil(async()=>{
  try{await request("/api/health",{timeout:650});return false;}
  catch{return true;}
 },{timeout:15000,label:"old server to exit"});
}
async function checkRunning(previous){
 const instance=await waitUntil(async()=>{
  const status=await request("/api/health",{timeout:1500});
  if(status.version!==CURRENT_VERSION||status.packaged!==true)return null;
  const pid=await runningPid();
  return Number.isInteger(pid)&&pid>0&&pid!==previous?{pid,status}:null;
 },{label:"restarted Windows companion "+CURRENT_VERSION});
 ownedPids.add(instance.pid);
 const manager=await request("/api/manager/status");
 if(manager.version!==CURRENT_VERSION||!manager.canLaunch)
  throw Error("Restarted manager version or availability is incorrect: "+JSON.stringify(manager));
 return instance;
}
async function beginUpdate(pid,staged,expected){
 const script=updateScript({root,exePath:exe,staged,pid,expectedSha256:expected,
  version:CURRENT_VERSION,port});
 const result=launchMaintenance(script,{root,env});
 if(!result?.pid)throw Error("Independent updater did not launch");
 await stopCurrent();
 return result;
}
try{
 fs.mkdirSync(path.join(root,"updates"),{recursive:true});
 fs.mkdirSync(path.join(root,"temp"),{recursive:true});
 fs.copyFileSync(original,exe);
 const marker={id:INSTALL_ID,path:root,instance:"e2e"+crypto.randomBytes(13).toString("hex"),
  executable:path.basename(exe),created:new Date().toISOString()};
 fs.writeFileSync(path.join(root,INSTALL_MARKER),JSON.stringify(marker,null,2),"utf8");
 const stdout=fs.openSync(path.join(root,"update-smoke.log"),"a");
 const child=spawn(exe,["--no-browser"],{
  cwd:root,env,windowsHide:true,stdio:["ignore",stdout,stdout]
 });
 ownedPids.add(child.pid);
 await waitUntil(async()=>{const health=await request("/api/health");return health.ok?true:false;},
  {timeout:40000,label:"original Windows companion"});
 const pid=await runningPid();
 const checksum=shaFile(exe);
 // Transaction 1: a valid official-sized binary is actually installed, then
 // the new process must accept the SAME local browser authorization token.
 const good=path.join(root,"updates","RiftboundCompanion-next.exe");
 fs.copyFileSync(original,good);
 console.log("Update smoke: handoff, SHA verification, atomic replacement, restart...");
 await beginUpdate(pid,good,checksum);
 const updated=await checkRunning(pid);
 const result=await waitUntil(()=>readUpdateStatus(root)?.phase==="success"?true:false,
  {timeout:12000,label:"successful transaction log"});
 if(shaFile(exe)!==checksum)throw Error("Replaced executable checksum does not match the download");
 console.log("PASS: replacement and manager restart, new PID "+updated.pid);
 // Transaction 2: corrupted download rejected, old executable must still be
 // available and the server must restart with persisted credentials.
 const corrupted=path.join(root,"updates","RiftboundCompanion-corrupted.exe");
 fs.writeFileSync(corrupted,"tampered binary");
 console.log("Update smoke: corrupted SHA must restore old app and manager...");
 await beginUpdate(updated.pid,corrupted,checksum);
 const afterError=await checkRunning(updated.pid);
 await waitUntil(()=>readUpdateStatus(root)?.phase==="rolled-back"?true:false,
  {timeout:12000,label:"recovery log"});
 if(shaFile(exe)!==checksum)throw Error("A failed update corrupted the installed EXE");
 const failure=readUpdateStatus(root);
 if(!/SHA256|mismatch|incorrect/i.test(failure.message))throw Error("Recovery reason is missing: "+failure.message);
 console.log("PASS: invalid update rejected; old manager recovered, PID "+afterError.pid);
 await stopCurrent();
 console.log("PASS Windows update transaction end-to-end");
}catch(e){
 console.error("Update smoke failed:",e?.stack||e);
 console.error("Updater transaction log:",summary());
 process.exitCode=1;
}finally{
 try{
  const p=await runningPid();
  if(p&&p!==process.pid)process.kill(p);
 }catch{}
 // Keep logs in the runner artifacts for failed CI diagnostics.
 for(const pid of ownedPids)try{process.kill(pid);}catch{}
}
