import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createPortableManager,selectOfficialUpdate} from "../portable-manager.mjs";
import {CURRENT_VERSION,MINIMUM_COMPANION_VERSION,compareVersions,companionNeedsUpdate} from "../release-policy.mjs";
import {stopOwnedProcess} from "../process-lifecycle.mjs";

const release=(version=CURRENT_VERSION)=>({
 assets:[{
  name:"RiftboundCompanion-v"+version.replace(/\.0$/,"")+".exe",
  browser_download_url:"https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v"+
   version.replace(/\.0$/,"")+".exe",
  digest:"sha256:"+"a".repeat(64),size:134000000
 }]
});
const fetchRelease=source=>async url=>{
 if(source instanceof Error)throw source;
 return {ok:true,json:async()=>source};
};
test("the site and Windows app share a minimum version",()=>{
 assert.equal(CURRENT_VERSION,"0.22.0");
 assert.equal(MINIMUM_COMPANION_VERSION,CURRENT_VERSION);
 assert.equal(compareVersions("0.21.0",CURRENT_VERSION),-1);
 assert.equal(companionNeedsUpdate("0.21"),true);
 assert.equal(companionNeedsUpdate(CURRENT_VERSION),false);
 assert.equal(companionNeedsUpdate("0.23.0"),false);
 assert.equal(companionNeedsUpdate("not installed"),true);
 assert.equal(selectOfficialUpdate(release("0.23.0"),CURRENT_VERSION).version,"0.23.0");
});
test("on first launch an outdated portable EXE cannot launch the board or bypass via offline",async()=>{
 const manager=createPortableManager({root:"/test/root",portable:true,current:"0.21.0",
  fetchImpl:fetchRelease(release("0.22.0"))});
 assert.equal(manager.status().updateState,"checking");
 assert.equal(manager.status().canLaunch,false);
 const result=await manager.startupCheck();
 assert.equal(result.updateState,"outdated");
 assert.equal(result.mustUpdate,true);
 assert.equal(result.canLaunch,false);
 assert.equal(result.availableVersion,"0.22.0");
 assert.throws(()=>manager.continueOffline(),/hors ligne/);
 assert.deepEqual((await manager.checkUpdate()).mustUpdate,true);
});
test("current portable version enables launch only after the release check",async()=>{
 const manager=createPortableManager({root:"/test/root",portable:true,
  fetchImpl:fetchRelease(release(CURRENT_VERSION))});
 assert.equal(manager.status().canLaunch,false);
 const verified=await manager.startupCheck();
 assert.equal(verified.updateState,"current");
 assert.equal(verified.mustUpdate,false);
 assert.equal(verified.canLaunch,true);
 assert.equal(typeof verified.checkedAt,"string");
});
test("network failure requires explicit offline approval rather than starting immediately",async()=>{
 const manager=createPortableManager({root:"/test/root",portable:true,
  fetchImpl:fetchRelease(Error("No network"))});
 const result=await manager.startupCheck();
 assert.equal(result.updateState,"unavailable");
 assert.equal(result.canLaunch,false);
 assert.match(result.error,/No network/);
 const approved=manager.continueOffline();
 assert.equal(approved.canLaunch,true);
 assert.equal(approved.offlineApproved,true);
 assert.equal(approved.updateState,"unavailable");
});
test("a confirmed stop closes the app and its children without deleting files",async()=>{
 let shutdownCalls=0;
 const manager=createPortableManager({root:"/test/root",portable:true,
  skipStartupCheck:true,shutdown:()=>{shutdownCalls++;}});
 assert.throws(()=>manager.requestStop({confirm:"NO"}),/Confirmation/);
 assert.equal(shutdownCalls,0);
 assert.equal(manager.status().canLaunch,true);
 const response=manager.requestStop({confirm:"STOP_RIFTBOUND"});
 assert.equal(response.stopping,true);
 assert.equal(manager.status().canLaunch,false);
 assert.equal(manager.status().shuttingDown,true);
 manager.requestStop({confirm:"STOP_RIFTBOUND"});
 await new Promise(resolve=>setTimeout(resolve,370));
 assert.equal(shutdownCalls,1);
});
test("Windows tree termination targets only the exact child PID, never the process image name",()=>{
 const calls=[];
 const child={pid:48201,exitCode:null,signalCode:null,kill:()=>{throw Error("Unnecessary fallback");}};
 const result=stopOwnedProcess(child,{platform:"win32",spawnSyncImpl:(file,args,options)=>{
  calls.push({file,args,options});return {status:0};
 }});
 assert.equal(result,true);
 assert.equal(calls[0].file,"taskkill.exe");
 assert.deepEqual(calls[0].args,["/PID","48201","/T","/F"]);
 assert.ok(!calls[0].args.includes("/IM"));
 let killed=false;
 stopOwnedProcess({pid:0,exitCode:null,signalCode:null,kill:()=>{killed=true;}},{
  platform:"win32",spawnSyncImpl:()=>{throw Error("No PID 0 termination allowed");}
 });
 assert.equal(killed,true);
 assert.equal(stopOwnedProcess({pid:101,exitCode:0,kill:()=>{throw Error("Already exited");}},{
  platform:"win32"}),false);
});
test("website and manager both provide version-first entry points and permanent process stop",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const manager=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 for(const id of ["manager-open","manager-open-play","companion-version-gate",
  "version-open-manager","version-download"])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const id of ["manager-stop","startup-screen","manager-dashboard",
  "startup-update","startup-retry","startup-offline"])
  assert.ok(manager.includes('id="'+id+'"'),id);
 assert.match(app,/function versionGateReason\(/);
 assert.match(app,/companionNeedsUpdate\(version,MINIMUM_COMPANION_VERSION\)/);
 assert.match(app,/if\(companionGate\)\{/);
 assert.match(manager,/data\.canLaunch/);
 assert.match(manager,/\/api\/manager\/stop/);
 assert.match(server,/\/api\/manager\/offline\/continue/);
 assert.match(server,/\/api\/manager\/stop/);
 assert.match(server,/if\(!manager\.status\(\)\.canLaunch\)/);
 assert.match(server,/shutdown:true/);
});
