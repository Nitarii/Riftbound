import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {Readable} from "node:stream";
import {createFreeLocalAI,freeModelID,FREE_MODELS,FREE_ENGINE_DOWNLOAD,
 FREE_MODEL_DOWNLOAD,downloadVerified,verifiedDownloadHash} from "../free-ai.mjs";

test("CPU model has a single simple free option and cryptographically pinned downloads",()=>{
 assert.deepEqual(FREE_MODELS.map(x=>x.id),["qwen3:4b-instruct-2507"]);
 assert.equal(freeModelID(), "qwen3:4b-instruct-2507");
 assert.equal(freeModelID("qwen3:4b-instruct-2507"),"qwen3:4b-instruct-2507");
 assert.throws(()=>freeModelID("qwen3:0.6b"),/Un seul modèle/);
 assert.match(FREE_ENGINE_DOWNLOAD.url,/win-cpu-x64\.zip/);
 assert.match(FREE_MODEL_DOWNLOAD.url,/huggingface\.co\/Open4bits\/Qwen3-4B-Instruct-2507-GGUF/);
 assert.match(FREE_ENGINE_DOWNLOAD.sha256,/^[a-f0-9]{64}$/);
 assert.match(FREE_MODEL_DOWNLOAD.sha256,/^[a-f0-9]{64}$/);
 assert.notEqual(FREE_ENGINE_DOWNLOAD.sha256,FREE_MODEL_DOWNLOAD.sha256);
});
test("verified model downloads stream to disk and reject corrupted downloads",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-free-test-"));
 const destination=path.join(dir,"model.gguf");
 const bytes=Buffer.from("Test quantized model bytes, not actual model data");
 const hash=crypto.createHash("sha256").update(bytes).digest("hex");
 let calls=0,progress=0;
 const request=async()=>{calls++;return {ok:true,status:200,headers:new Map([["content-length",String(bytes.length)]]),
  body:Readable.from([bytes.subarray(0,10),bytes.subarray(10)])};};
 try{
  const written=await downloadVerified("https://example.org/model.gguf",destination,hash,
   amount=>progress=amount,request);
  assert.equal(written,bytes.length);
  assert.equal(progress,bytes.length);
  assert.equal(fs.readFileSync(destination,"utf8"),bytes.toString());
  assert.equal(await downloadVerified("https://example.org/model.gguf",destination,hash,()=>{},request),bytes.length);
  assert.equal(calls,1,"Valid cached files must not be downloaded twice");
  assert.equal(verifiedDownloadHash(bytes,hash),true);
  await assert.rejects(downloadVerified("https://example.org/model.gguf",destination,"0".repeat(64),()=>{},request),/SHA-256/);
  assert.ok(!fs.existsSync(destination+".part"));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("free local CPU agent reports not installed and never downloads before a click",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-free-status-"));
 let requests=0;
 try{
  const free=createFreeLocalAI({userData:dir,platform:"linux",fetchImpl:async()=>{requests++;throw Error("Unexpected network request");}});
  assert.equal(free.status().free,true);
  assert.equal(free.status().ready,false);
  assert.equal(free.status().installed,false);
  assert.equal(requests,0);
  assert.equal(free.resume().running,false);
  free.start();
  for(let i=0;i<40&&free.status().running;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(free.status().phase,"error");
  assert.match(free.status().error,/Windows/);
  assert.equal(requests,0);
  free.stop();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("simple free UI has one button and avoids API keys or paid model choices",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 assert.match(html,/Ton adversaire IA 100 % gratuit/);
 assert.match(html,/id="free-ai-model" type="hidden" value="qwen3:4b-instruct-2507"/);
 assert.match(html,/id="free-ai-install"/);
 assert.match(html,/id="free-ai-progress"/);
 assert.match(html,/id="free-ai-stage"/);
 assert.match(html,/id="legacy-ai-config"/);
 assert.match(app,/\/api\/ai\/free\/install/);
 assert.match(app,/\/api\/ai\/free\/status/);
});
