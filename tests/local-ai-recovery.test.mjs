import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createState} from "../core.mjs";
import {createIntegratedAI,modelHTTPError,FREE_SYSTEM_PROMPT} from "../integrated-ai.mjs";

function createHarness(responses){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-free-retry-"));
 const requests=[];
 let done;
 const finished=new Promise(resolve=>done=resolve);
 const ai=createIntegratedAI({
  userData:dir,getState:()=>createState(),getCatalog:async()=>[],getMessages:()=>({messages:[]}),
  applyBatch:async()=>{},
  sendMessage:text=>done(text),
  fetchImpl:async(url,options)=>{
   requests.push({url,payload:JSON.parse(options.body)});
   return responses[requests.length-1]||{ok:false,status:400};
  }
 });
 ai.configure({provider:"free",model:"qwen3:0.6b",enabled:true});
 return {dir,ai,requests,finished,dispose:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test("local HTTP 400 retries once using shorter context, without JSON response grammar",async()=>{
 let h=createHarness([
  {ok:false,status:400},
  {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({reply:"Je t'écoute.",commands:[]})}}]})}
 ]);
 try{
  h.ai.onHumanMessage("Taureau loyal");
  const text=await Promise.race([h.finished,new Promise((_,reject)=>setTimeout(()=>reject(Error("AI timeout")),1500))]);
  assert.match(text,/écoute/);
  assert.equal(h.requests.length,2);
  assert.ok(h.requests[0].payload.response_format);
  assert.equal(h.requests[1].payload.response_format,undefined);
  assert.ok(h.requests[1].payload.max_tokens<h.requests[0].payload.max_tokens);
  assert.ok(h.requests[1].payload.messages[0].content.includes("physical Riftbound"));
  assert.equal(h.requests[1].payload.model,"qwen3:0.6b");
 }finally{h.dispose();}
});
test("repeated local HTTP 400 gives actionable local error, never an API-key prompt",async()=>{
 const h=createHarness([{ok:false,status:400},{ok:false,status:400}]);
 try{
  h.ai.onHumanMessage("Loyal Poro");
  const msg=await Promise.race([h.finished,new Promise((_,reject)=>setTimeout(()=>reject(Error("AI timeout")),1500))]);
  assert.match(msg,/IA locale HTTP 400/);
  assert.doesNotMatch(msg,/clé API|fournisseur/i);
  assert.equal(h.requests.length,2);
 }finally{h.dispose();}
});
test("fixed local instructions reserve context for actual cards and answer naturally",()=>{
 assert.ok(FREE_SYSTEM_PROMPT.includes("Reply")||FREE_SYSTEM_PROMPT.includes("reply"));
 assert.ok(!FREE_SYSTEM_PROMPT.includes("annonce courte en français"));
 assert.match(modelHTTPError(503,"free"),/IA locale HTTP 503/);
 assert.match(modelHTTPError(401,"openai"),/fournisseur/);
});
