import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {OWNED_FILES,ownedEntry,uninstallScript} from "../portable.mjs";
import {initializePortableInstall} from "../portable.mjs";
import os from "node:os";
import path from "node:path";

test("only the exact Riftbound state backup belongs to the uninstall allowlist",()=>{
 assert.equal(OWNED_FILES.includes(".riftbound-local-state.json.bak"),true);
 assert.equal(ownedEntry(".riftbound-local-state.json.bak"),true);
 assert.equal(ownedEntry("my-personal-file.json.bak"),false);
 assert.equal(ownedEntry(".riftbound-local-state.json.bak.old"),false);
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(server,/const backupStateFile=stateFile\+"\.bak"/);
});

test("uninstall script includes the exact state backup and never bulk-deletes *.bak",()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-v038-backup-"));
 const root=path.join(base,"Companion");
 const exe=path.join(root,"RiftboundCompanion.exe");
 try{
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(exe,"fixture");
  initializePortableInstall({packaged:true,exePath:exe,platform:"win32",chooser:()=>root});
  const script=uninstallScript({root,exePath:exe,pid:12345});
  assert.ok(script.includes("'.riftbound-local-state.json.bak'"));
  assert.ok(!/Remove-Item[^\n]*\*\.bak/.test(script));
  assert.ok(!OWNED_FILES.includes("my-personal-file.json.bak"));
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
