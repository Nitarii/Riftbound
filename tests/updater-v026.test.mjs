import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {initializePortableInstall,launchMaintenance,readMarker,updateScript} from "../portable.mjs";
import {createPortableManager} from "../portable-manager.mjs";
import {buildUpdateScript,writeUpdateStatus,readUpdateStatus,updateStatusPath,updateLogPath} from "../update-transaction.mjs";
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-update-fix-"));
function installedFixture(base){
 const target=path.join(base,"Mon Riftbound & O'Brien");
 const original=path.join(base,"downloads","RiftboundCompanion-v0.25.exe");
 fs.mkdirSync(path.dirname(original),{recursive:true});
 fs.writeFileSync(original,"OLD COMPANION EXE");
 const installer=initializePortableInstall({
  packaged:true,exePath:original,platform:"win32",chooser:()=>target,
  spawnImpl:()=>({pid:12345,once(){},unref(){}})
 });
 assert.equal(installer.launched,true);
 return {target,exe:path.join(target,"RiftboundCompanion.exe"),original};
}
test("Update script validates source, destination, marker, SHA256, version and preserves selected directory",()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const staged=path.join(target,"updates","v0.26.exe");
  const sha="f".repeat(64);
  const script=buildUpdateScript({root:target,exePath:exe,staged,pid:54321,
   expectedSha256:sha,version:"0.26.0",port:8879});
  assert.match(script,/WaitForExit\(90000\)/);
  assert.match(script,/Get-FileHash -LiteralPath \$staged -Algorithm SHA256/);
  assert.match(script,/Get-FileHash -LiteralPath \$exe -Algorithm SHA256/);
  assert.match(script,/\[System\.IO\.File\]::Replace\(\$staged,\$exe,\$backup,\$true\)/);
  assert.match(script,/\[System\.IO\.File\]::Replace\(\$backup,\$exe,\$failed,\$true\)/);
  assert.match(script,/Start-Process -FilePath \$exe -WorkingDirectory \$r -PassThru/);
  assert.match(script,/Invoke-RestMethod -Uri/);
  assert.match(script,/rolled-back/);
  assert.match(script,/update-status\.json/);
  assert.match(script,/update\.log/);
  assert.doesNotMatch(script,/[’‘“”]/,"PowerShell smart quotes break parsing");
  assert.match(script,/\$version='0\.26\.0'/);
  assert.match(script,/\$port=8879/);
  assert.match(script,/\$expected='f{64}'/);
  assert.doesNotMatch(script,/Remove-Item -LiteralPath \$r -Recurse/);
  assert.throws(()=>updateScript({root:target,exePath:exe,staged,
   expectedSha256:"BAD",version:"0.26.0"}),/SHA256/);
  assert.throws(()=>updateScript({root:target,exePath:exe,staged,
   expectedSha256:sha,version:"next"}),/version/);
  assert.throws(()=>updateScript({root:target,exePath:exe,staged:path.join(base,"outside.exe"),
   expectedSha256:sha,version:"0.26.0"}),/dossier choisi/);
  assert.throws(()=>updateScript({root:target,exePath:path.join(base,"other.exe"),staged,
   expectedSha256:sha,version:"0.26.0"}),/dossier choisi/);
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("Detached PowerShell updater is written only in the portable folder and failure to spawn is visible",()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const staged=path.join(target,"updates","new.exe");
  const script=updateScript({root:target,exePath:exe,staged,expectedSha256:"a".repeat(64),
   version:"0.26.0"});
  let spawned;
  const started=launchMaintenance(script,{root:target,env:{TEMP:path.join(target,"temp"),RIFTBOUND_TOKEN:"mock-secret"},
   spawnImpl:(file,args,opts)=>{spawned={file,args,opts};return {pid:2500,once(){},unref(){}};}});
  assert.equal(started.pid,2500);
  assert.equal(spawned.file,"powershell.exe");
  assert.ok(spawned.args.includes("-File"));
  const file=spawned.args.at(-1);
  assert.equal(file,path.join(target,"updates","companion-update.ps1"));
  assert.equal(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""),script);
  assert.equal(spawned.opts.cwd,target);
  assert.equal(spawned.opts.env.RIFTBOUND_TOKEN,"mock-secret");
  assert.throws(()=>launchMaintenance(script,{root:target,spawnImpl:()=>({pid:undefined})}),
   /Impossible de démarrer/);
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("Manager keeps current server until the independent updater is launched, preserving auth token",async()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const bytes=Buffer.from("NEW VERIFIED COMPANION");
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  const asset={name:"RiftboundCompanion-v0.26.exe",
   browser_download_url:"https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.26.exe",
   digest:"sha256:"+hash,size:bytes.length};
  const fetchImpl=async()=>({ok:true,json:async()=>({assets:[asset]})});
  let launchArgs,shut=0;
  const manager=createPortableManager({root:target,exePath:exe,portable:true,
   current:"0.25.0",port:8879,sessionToken:"existing-local-browser-token",
   fetchImpl,download:async(_url,staged,actualHash,onProgress)=>{
    assert.equal(actualHash,hash);fs.writeFileSync(staged,bytes);
    onProgress(bytes.length,bytes.length);
   },launch:(script,opts)=>{launchArgs={script,opts};writeUpdateStatus(target,"waiting","0.26.0","Updater active");return {pid:1700};},
   shutdown:()=>{shut++;}});
  assert.equal((await manager.startupCheck()).mustUpdate,true);
  const handoff=await manager.applyUpdate();
  assert.equal(handoff.shuttingDown,true);
  assert.equal(handoff.canLaunch,false);
  assert.match(handoff.message,/redémarrage/);
  assert.equal(shut,0,"Old server may not be terminated until updater has launched");
  assert.equal(launchArgs.opts.root,target);
  assert.equal(launchArgs.opts.env.RIFTBOUND_TOKEN,"existing-local-browser-token");
  assert.match(launchArgs.script,/\$oldPid=\d+/);
  assert.match(launchArgs.script,/\$port=8879/);
  assert.equal(readUpdateStatus(target).phase,"waiting");
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.equal(shut,1);
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("Manager launch failure retains running original and writes actionable diagnostic",async()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const bytes=Buffer.from("NEW VERIFIED COMPANION");
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  const asset={name:"RiftboundCompanion-v0.26.exe",
   browser_download_url:"https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.26.exe",
   digest:"sha256:"+hash};
  let shutdown=false;
  const manager=createPortableManager({root:target,exePath:exe,portable:true,
   current:"0.25.0",fetchImpl:async()=>({ok:true,json:async()=>({assets:[asset]})}),
   download:async(_url,staged)=>fs.writeFileSync(staged,bytes),
   launch:()=>{throw Error("PowerShell missing");},shutdown:()=>{shutdown=true;}});
  await manager.startupCheck();
  await assert.rejects(manager.applyUpdate(),/PowerShell missing/);
  assert.equal(shutdown,false);
  assert.equal(fs.readFileSync(exe,"utf8"),"OLD COMPANION EXE");
  assert.equal(manager.status().shuttingDown,false);
  assert.equal(readUpdateStatus(target).phase,"failed");
  assert.match(readUpdateStatus(target).message,/PowerShell missing/);
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("Failed updates and success details stay readable, bounded, in chosen install folder",()=>{
 const base=root();
 try{
  const {target}=installedFixture(base);
  writeUpdateStatus(target,"rolled-back","0.26.0","La version précédente a été restaurée.");
  assert.equal(readUpdateStatus(target).phase,"rolled-back");
  assert.equal(readUpdateStatus(target).version,"0.26.0");
  assert.ok(updateStatusPath(target).startsWith(target));
  assert.ok(updateLogPath(target).startsWith(target));
  fs.writeFileSync(updateStatusPath(target),"{invalid");
  assert.equal(readUpdateStatus(target),null);
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("Manual update fixes a broken old updater by choosing the existing installation folder",()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const instance=readMarker(target).instance;
  fs.mkdirSync(path.join(target,"speech"),{recursive:true});
  fs.writeFileSync(path.join(target,"speech","base.gguf"),"PRESERVED_MODEL");
  const newExe=path.join(base,"downloads","RiftboundCompanion-v0.26.exe");
  fs.writeFileSync(newExe,"NEW COMPANION EXE");
  let spawned;
  const repaired=initializePortableInstall({packaged:true,exePath:newExe,
   platform:"win32",chooser:()=>target,
   spawnImpl:(file,args,opts)=>{spawned={file,args,opts};return {pid:1111,once(){},unref(){}};}});
  assert.equal(repaired.launched,true);
  assert.equal(spawned.file,exe);
  assert.equal(fs.readFileSync(exe,"utf8"),"NEW COMPANION EXE");
  assert.equal(fs.readFileSync(path.join(target,"speech","base.gguf"),"utf8"),"PRESERVED_MODEL");
  assert.equal(readMarker(target).instance,instance);
  assert.equal(fs.readFileSync(path.join(target,"updates","manual-repair-previous.exe"),"utf8"),
   "OLD COMPANION EXE");
  assert.equal(readUpdateStatus(target).phase,"launching");
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("A locked old EXE leaves the original intact; repair gives a clear close-and-retry instruction",()=>{
 const base=root();
 try{
  const {target,exe}=installedFixture(base);
  const newExe=path.join(base,"downloads","RiftboundCompanion-v0.26.exe");
  fs.writeFileSync(newExe,"NEW COMPANION EXE");
  const fsImpl={...fs,renameSync:(from,to)=>{
   if(from===exe)throw Object.assign(Error("file locked"),{code:"EPERM"});
   return fs.renameSync(from,to);
  }};
  assert.throws(()=>initializePortableInstall({packaged:true,exePath:newExe,
   platform:"win32",chooser:()=>target,fsImpl,
   spawnImpl:()=>{throw Error("Must not spawn on failure");}}),/Ferme l'ancien compagnon/);
  assert.equal(fs.readFileSync(exe,"utf8"),"OLD COMPANION EXE");
 }finally{fs.rmSync(base,{force:true,recursive:true});}
});
test("UI exposes restart, status and log rather than silently closing the terminal",()=>{
 const html=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 for(const id of ["update-diagnostics","update-diagnostics-title","update-diagnostics-text",
  "update-log-button","update-log-preview"])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/awaitingUpdateRestart/);
 assert.match(server,/\/api\/manager\/update\/log/);
 assert.match(server,/sessionToken:token/);
});
