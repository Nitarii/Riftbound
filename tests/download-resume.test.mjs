import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {Readable} from "node:stream";
import {downloadVerified} from "../free-ai.mjs";

const hash=data=>crypto.createHash("sha256").update(data).digest("hex");
const headers=entries=>new Map(Object.entries(entries));
test("interrupted GGUF download resumes at the exact byte offset and verifies full SHA256",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-resume-"));
 try{
  const bytes=Buffer.from("a complete simulated GGUF file - the hash covers all bytes");
  const target=path.join(dir,"model.gguf");
  fs.writeFileSync(target+".part",bytes.subarray(0,12));
  let receivedRange="";
  const request=async(_url,opts)=>{
   receivedRange=opts.headers.Range;
   return {ok:true,status:206,headers:headers({
    "content-length":String(bytes.length-12),
    "content-range":"bytes 12-"+(bytes.length-1)+"/"+bytes.length
   }),body:Readable.from([bytes.subarray(12)])};
  };
  const progress=[];
  const count=await downloadVerified("https://example.org/model.gguf",target,hash(bytes),
   (n,total)=>progress.push([n,total]),request);
  assert.equal(receivedRange,"bytes=12-");
  assert.equal(count,bytes.length);
  assert.deepEqual(progress.at(-1),[bytes.length,bytes.length]);
  assert.deepEqual(fs.readFileSync(target),bytes);
  assert.equal(fs.existsSync(target+".part"),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("a server ignoring HTTP Range causes safe restart instead of corrupt append",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-range-"));
 try{
  const bytes=Buffer.from("complete corrected file");
  const target=path.join(dir,"model.gguf");
  fs.writeFileSync(target+".part",Buffer.from("wrong-prefix"));
  const request=async()=>({ok:true,status:200,headers:headers({"content-length":String(bytes.length)}),
   body:Readable.from([bytes])});
  await downloadVerified("https://example.org/model.gguf",target,hash(bytes),()=>{},request);
  assert.deepEqual(fs.readFileSync(target),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("invalid model bytes fail closed and remove both transient and final files",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-corrupt-"));
 try{
  const target=path.join(dir,"bad.gguf");
  const request=async()=>({ok:true,status:200,headers:headers({"content-length":"4"}),
   body:Readable.from([Buffer.from("bad!")])});
  await assert.rejects(
   downloadVerified("https://example.org/model.gguf",target,hash(Buffer.from("good")),()=>{},request),
   /SHA-256/
  );
  assert.equal(fs.existsSync(target),false);
  assert.equal(fs.existsSync(target+".part"),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("stopping an ongoing download aborts promptly and leaves no accepted model",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-cancel-"));
 try{
  const controller=new AbortController();
  const target=path.join(dir,"model.gguf");
  const request=async(_url,opts)=>{
   controller.abort();
   if(opts.signal.aborted)throw Error("abort");
   throw Error("unexpected");
  };
  await assert.rejects(downloadVerified("https://example.org/model.gguf",
   target,hash(Buffer.from("model")),()=>{},request,{signal:controller.signal}),
   /annulé/);
  assert.equal(fs.existsSync(target),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
