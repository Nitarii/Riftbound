// Windows end-to-end uninstall test against the real packaged EXE.
// Uses disposable roots, one empty and one with an unrelated file. Does not
// require admin privileges or touch files outside the test installation.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {INSTALL_ID,INSTALL_MARKER} from "../portable.mjs";
if(process.platform!=="win32")throw Error("Windows-only uninstall smoke test.");
const binary=path.resolve("dist","RiftboundCompanion.exe");
const tests=[
 {name:"clean",path:path.resolve("dist","Uninstall - François O'Brien"),otherFile:false,port:8891},
 {name:"keep-personal",path:path.resolve("dist","Uninstall - Zoë Martin"),otherFile:true,port:8892}
];
async function poll(callback,description,timeout=35000){
 const stop=Date.now()+timeout;let last="";
 while(Date.now()<stop){
  try{const value=await callback();if(value)return value;}catch(e){last=String(e.message||e);}
  await sleep(200);
 }
 throw Error("Timed out waiting for "+description+"; last error: "+last);
}
async function run({name,path:root,port,otherFile}){
 const token="ci-uninstall-"+crypto.randomBytes(12).toString("hex");
 const exe=path.join(root,"RiftboundCompanion.exe");
 const logPath=path.resolve("dist","uninstall-"+name+".log");
 fs.mkdirSync(path.join(root,"updates"),{recursive:true});
 for(const name of ["free-opponent","speech","temp","downloads"]){
  fs.mkdirSync(path.join(root,name),{recursive:true});
  fs.writeFileSync(path.join(root,name,"owned-test.txt"),"delete by uninstaller");
 }
 fs.copyFileSync(binary,exe);
 fs.writeFileSync(path.join(root,INSTALL_MARKER),JSON.stringify({
  id:INSTALL_ID,path:root,instance:"e2e"+crypto.randomBytes(13).toString("hex"),
  executable:path.basename(exe),created:new Date().toISOString()
 }));
 if(otherFile)fs.writeFileSync(path.join(root,"my-personal-file.txt"),"KEEP ME");
 const fd=fs.openSync(logPath,"a");
 const child=spawn(exe,["--no-browser"],{cwd:root,windowsHide:true,
  stdio:["ignore",fd,fd],
  env:{...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,
   RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_SKIP_UPDATE_CHECK:"1",
   RIFTBOUND_DATA_DIR:root,TEMP:path.join(root,"temp"),
   TMP:path.join(root,"temp"),TMPDIR:path.join(root,"temp")}});
 fs.closeSync(fd);
 let helperFolder=null;
 const base="http://127.0.0.1:"+port;
 async function request(route,body){
  const res=await fetch(base+route,{
   method:body?"POST":"GET",headers:{
    Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(route==="/api/manager/uninstall"?15000:2500)});
  return {status:res.status,body:await res.json()};
 }
 try{
  await poll(async()=>{
   const response=await request("/api/health");
   return response.status===200&&response.body.packaged;
  },"companion startup",35000);
  const before=await request("/api/manager/status");
  if(before.status!==200||!before.body.portable)throw Error("Not a portable Windows install");
  const rejected=await request("/api/manager/uninstall",{
   confirm:"INVALID",folder:root
  });
  if(rejected.status!==400)throw Error("Unconfirmed destructive call not rejected");
  const wrongFolder=await request("/api/manager/uninstall",{
   confirm:"DELETE_RIFTBOUND_DATA",folder:path.resolve("dist","other")
  });
  if(wrongFolder.status!==400)throw Error("Wrong install path accepted");
  const started=await request("/api/manager/uninstall",{
   confirm:"DELETE_RIFTBOUND_DATA",folder:root
  });
  if(started.status!==200||!started.body.ok||!started.body.uninstalling)
   throw Error("Uninstaller failed handshake: "+JSON.stringify(started));
  const helperRequest=JSON.parse(fs.readFileSync(path.join(root,"updates","uninstall-request.json"),"utf8"));
  helperFolder=path.dirname(helperRequest.helperExe);
  if(helperFolder===root||!fs.existsSync(helperRequest.helperExe))
   throw Error("Independent helper executable was not created outside the installation.");
  await poll(async()=>child.exitCode!==null||child.signalCode!==null,
   "Riftbound executable shutdown",20000);
  await poll(async()=>{
   if(!fs.existsSync(root))return true;
   const files=fs.readdirSync(root);
   return files.every(name=>name==="my-personal-file.txt");
  },"all owned files to be deleted",35000);
  await poll(async()=>!fs.existsSync(helperFolder),
   "temporary uninstall helper to clean itself",15000);
  if(otherFile){
   if(fs.readFileSync(path.join(root,"my-personal-file.txt"),"utf8")!=="KEEP ME")
    throw Error("Uninstaller deleted unrelated user data.");
  }else if(fs.existsSync(root)){
   throw Error("Uninstaller left a supposedly empty install folder.");
  }
  console.log("PASS Windows uninstall "+name+": stopped process, deleted owned files, preserved unrelated data.");
 }catch(error){
  console.error("Uninstall smoke "+name+" failed: ",error.stack||error);
  if(helperFolder){
   console.error("Temporary helper directory:",helperFolder,
    fs.existsSync(helperFolder)?fs.readdirSync(helperFolder):"(already removed)");
   const helperExecutable=path.join(helperFolder,"RiftboundUninstall.exe");
   try{
    const wmi=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",
     "Get-CimInstance Win32_Process -Filter \"Name='RiftboundUninstall.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | Format-List | Out-String"],{
     encoding:"utf8",timeout:6000,windowsHide:true});
    console.error("Active helper process:",wmi.slice(0,1800));
   }catch(e){console.error("Helper WMI failed:",String(e.message||e).slice(0,300));}
   if(fs.existsSync(helperExecutable))try{
    fs.rmSync(helperExecutable,{force:true});
    console.error("Manual diagnostic removal succeeded: helper was not locked");
   }catch(e){console.error("Manual diagnostic removal failed:",e.code,e.message);}
  }
  try{
   const file=path.join(root,"updates","uninstall-request.json");
   if(fs.existsSync(file)){
    const helper=JSON.parse(fs.readFileSync(file,"utf8"));
    const dir=path.dirname(helper.helperExe);
    console.error("Temporary uninstall helper remaining files:",
     fs.existsSync(dir)?fs.readdirSync(dir):"(already removed)");
   }
  }catch(e){console.error("Temporary helper diagnostic:",String(e.message||e));}
  const diag=path.join(root,"updates","uninstall-status.json");
  if(fs.existsSync(diag))console.error("Helper status:",fs.readFileSync(diag,"utf8"));
  const launchLog=path.join(root,"updates","uninstall-launch.log");
  if(fs.existsSync(launchLog)){
   const text=fs.readFileSync(launchLog,"utf8");
   console.error("Helper launch:",text);
   const pid=/Helper spawned PID (\d+)/.exec(text)?.[1];
   if(pid){
    try{
     const command="Get-CimInstance Win32_Process -Filter 'ProcessId="+pid+"' | Select-Object ProcessId,Name,ParentProcessId,CreationDate,CommandLine | Format-List | Out-String";
     const output=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],
      {encoding:"utf8",timeout:7000,windowsHide:true});
     console.error("Helper process:",output.slice(0,1500));
    }catch(e){console.error("Helper process lookup failed:",String(e.message||e).slice(0,400));}
   }
  }
  const updates=path.join(root,"updates");
  if(fs.existsSync(updates)){
   console.error("Updates files:",fs.readdirSync(updates));
   for(const file of ["maintenance-output.log","companion-uninstall.ps1"]){
    const full=path.join(updates,file);
    if(fs.existsSync(full))console.error("File "+file+":",fs.readFileSync(full,"utf8").slice(0,1200));
   }
  }
  if(fs.existsSync(logPath))console.error("Server log:",fs.readFileSync(logPath,"utf8").slice(-3000));
  throw error;
 }finally{
  try{child.kill()}catch{}
  if(otherFile&&fs.existsSync(root))fs.rmSync(root,{recursive:true,force:true});
 }
}
for(const item of tests)await run(item);
