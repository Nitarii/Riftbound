import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {EventEmitter} from "node:events";
import {
 INSTALL_ID,INSTALL_MARKER,assertSafeInstallFolder,readMarker,inside,ownedEntry,
 portableEnvironment,initializePortableInstall,moveLegacyFiles,uninstallScript,updateScript
} from "../portable.mjs";
import {compareVersions,selectOfficialUpdate,createPortableManager} from "../portable-manager.mjs";
const makeRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-portable-unit-"));
const fakeExe=(dir,name="RiftboundCompanion-v0.20.exe")=>{
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,name);fs.writeFileSync(file,"portable exe fixture");
 return file;
};
test("Windows first-run picks empty folder, copies portable EXE, and keeps all temporaries inside it",()=>{
 const base=makeRoot();
 try{
  const exe=fakeExe(path.join(base,"incoming"));
  const location=path.join(base,"my dedicated folder");
  let spawned=null;
  const r=initializePortableInstall({packaged:true,exePath:exe,platform:"win32",
   chooser:()=>location,spawnImpl:(file,args,opts)=>{spawned={file,args,opts};return {unref(){}};}});
  assert.equal(r.launched,true);
  assert.equal(r.root,location);
  assert.equal(spawned.file,path.join(location,"RiftboundCompanion.exe"));
  assert.equal(fs.readFileSync(spawned.file,"utf8"),"portable exe fixture");
  assert.equal(spawned.opts.env.TEMP,path.join(location,"temp"));
  assert.equal(spawned.opts.env.TMPDIR,path.join(location,"temp"));
  assert.equal(readMarker(location).id,INSTALL_ID);
  assert.ok(fs.existsSync(path.join(location,INSTALL_MARKER)));
  const relaunch=initializePortableInstall({packaged:true,exePath:spawned.file,
   platform:"win32",chooser:()=>{throw Error("Must not prompt again");}});
  assert.equal(relaunch.launched,false);
  assert.equal(relaunch.root,location);
  assert.equal(fs.existsSync(exe),true,"Do not silently delete the original downloaded EXE");
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("the chosen folder cannot contain unrelated files and deletion ignores other files",()=>{
 const base=makeRoot();
 try{
  const exe=fakeExe(path.join(base,"incoming"));
  const target=path.join(base,"dedicated");fs.mkdirSync(target);
  fs.writeFileSync(path.join(target,"photos.txt"),"precious");
  assert.throws(()=>assertSafeInstallFolder(target,{exePath:exe}),/fichiers personnels/);
  assert.equal(ownedEntry("photos.txt"),false);
  assert.equal(ownedEntry("free-opponent"),true);
  assert.equal(ownedEntry("RiftboundCompanion-v0.20.exe"),true);
  assert.equal(inside(target,path.join(base,"another","photos.txt")),false);
  assert.throws(()=>uninstallScript({root:target,exePath:exe}),/Installation non reconnue|ENOENT/);
  assert.equal(fs.readFileSync(path.join(target,"photos.txt"),"utf8"),"precious");
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("migration moves only old companion files, never unrelated AppData files",()=>{
 const base=makeRoot();
 try{
  const legacy=path.join(base,"legacy"),installed=path.join(base,"installed");
  fs.mkdirSync(legacy);fs.mkdirSync(installed);
  fs.writeFileSync(path.join(legacy,".riftbound-local-state.json"),"{}");
  fs.mkdirSync(path.join(legacy,"free-opponent"));
  fs.writeFileSync(path.join(legacy,"important-other-app.txt"),"keep");
  const moved=moveLegacyFiles(legacy,installed);
  assert.deepEqual(moved.sort(),[".riftbound-local-state.json","free-opponent"].sort());
  assert.equal(fs.readFileSync(path.join(legacy,"important-other-app.txt"),"utf8"),"keep");
  assert.equal(fs.readFileSync(path.join(installed,".riftbound-local-state.json"),"utf8"),"{}");
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("uninstaller uses a manifest checked against the exact installation and an allowlist",()=>{
 const base=makeRoot();
 try{
  const exe=fakeExe(path.join(base,"Riftbound Companion"));
  const install=initializePortableInstall({packaged:true,exePath:exe,
   platform:"win32",chooser:()=>path.dirname(exe)});
  assert.equal(install.launched,false);
  const script=uninstallScript({root:install.root,exePath:exe,pid:12345});
  assert.match(script,/Wait-Process -Id \$pidToWait/);
  assert.match(script,/Get-Content -LiteralPath \$m/);
  assert.match(script,/free-opponent/);
  assert.match(script,/RiftboundCompanion/);
  assert.doesNotMatch(script,/Remove-Item.+-LiteralPath \$r -Recurse/);
  assert.match(updateScript({root:install.root,exePath:exe,
   staged:path.join(install.root,"updates","new.exe"),
   expectedSha256:"a".repeat(64),version:"0.26.0"}),/Start-Process -FilePath \$exe/);
  assert.throws(()=>updateScript({root:install.root,exePath:exe,
   staged:path.join(base,"outside.exe")}),/dossier choisi/);
  let launched="",shutdown=false;
  const manager=createPortableManager({root:install.root,exePath:exe,portable:true,
   launch:code=>{launched=code;},shutdown:()=>{shutdown=true;}});
  assert.throws(()=>manager.uninstall({confirm:"YES",folder:install.root}),/confirmation/);
  assert.deepEqual(manager.uninstall({confirm:"DELETE_RIFTBOUND_DATA",folder:install.root}).ok,true);
  assert.match(launched,/Wait-Process/);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("version update accepts only a newer official release and verified digests",()=>{
 assert.equal(compareVersions("0.20.0","0.19.0"),1);
 assert.equal(compareVersions("0.20.0","0.20.0"),0);
 const candidate={assets:[{name:"RiftboundCompanion-v0.21.0.exe",
  browser_download_url:"https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.21.0.exe",
  size:130000000,digest:"sha256:"+"a".repeat(64)}]};
 assert.equal(selectOfficialUpdate(candidate,"0.20.0").version,"0.21.0");
 assert.equal(selectOfficialUpdate(candidate,"0.21.0"),null);
 const twoPart={assets:[{...candidate.assets[0],name:"RiftboundCompanion-v0.21.exe",
  browser_download_url:"https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.21.exe"}]};
 assert.equal(selectOfficialUpdate(twoPart,"0.20.0").version,"0.21.0");
 assert.throws(()=>selectOfficialUpdate({assets:[{...candidate.assets[0],
  browser_download_url:"https://fake.org/bad.exe"}]},"0.20.0"),/non officielle/);
});
