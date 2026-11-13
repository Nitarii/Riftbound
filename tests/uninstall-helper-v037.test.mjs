import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {initializePortableInstall,INSTALL_MARKER} from "../portable.mjs";
import {launchUninstallHelper} from "../uninstall-helper.mjs";

test("standalone uninstall starts a copy OUTSIDE the chosen root and requires a manifest",()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-uninstall-helper-"));
 const root=path.join(base,"Install - François O'Brien");
 const local=path.join(base,"local");
 fs.mkdirSync(path.join(local,"Temp"),{recursive:true});
 const original=path.join(root,"RiftboundCompanion.exe");
 try{
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(original,"SEA fixture for safe-copy validation");
  initializePortableInstall({packaged:true,exePath:original,platform:"win32",chooser:()=>root});
  let captured={};
  const started=launchUninstallHelper({root,exePath:original,pid:12345},{
   env:{...process.env,LOCALAPPDATA:local},
   spawnImpl:(file,args,options)=>{captured={file,args,options};return {pid:54321,unref(){}};}
  });
  assert.equal(started.pid,54321);
  assert.notEqual(path.dirname(captured.file),root);
  assert.equal(fs.readFileSync(captured.file,"utf8"),"SEA fixture for safe-copy validation");
  assert.deepEqual(captured.args,["--riftbound-uninstall-helper"]);
  assert.equal(captured.options.detached,true);
  assert.equal(captured.options.stdio,"ignore");
  const request=JSON.parse(fs.readFileSync(path.join(root,"updates","uninstall-request.json"),"utf8"));
  assert.equal(request.root,root);
  assert.equal(request.exePath,original);
  assert.equal(request.helperExe,captured.file);
  assert.equal(request.pid,12345);
  assert.ok(fs.existsSync(path.join(root,INSTALL_MARKER)));
  assert.equal(fs.existsSync(path.join(root,"updates","uninstall-go.signal")),false);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test("independent helper refuses root-level, unrelated executables and bad PID",()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-uninstall-invalid-"));
 try{
  assert.throws(()=>launchUninstallHelper({
   root:path.parse(base).root,exePath:path.join(base,"RiftboundCompanion.exe"),pid:4
  }),/dédié|Installation/);
  assert.throws(()=>launchUninstallHelper({
   root:base,exePath:path.join(base,"evil.exe"),pid:4
  }),/Installation|ENOENT/);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
