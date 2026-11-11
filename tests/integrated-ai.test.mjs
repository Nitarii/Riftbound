import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createState,applyCommand} from "../core.mjs";
import {createIntegratedAI,validateAIConfig,validateAgentCommands,modelBoardState} from "../integrated-ai.mjs";

test("integrated AI supports three fixed providers and rejects unsafe custom endpoints",()=>{
 const a=validateAIConfig({provider:"openai",model:"gpt-4.1-mini",apiKey:"test-key"});
 assert.equal(a.endpoint,"https://api.openai.com/v1");
 assert.equal(a.apiKey,"test-key");
 assert.equal(validateAIConfig({provider:"ollama",model:"gpt-oss:20b"}).endpoint,"http://127.0.0.1:11434/v1");
 assert.equal(validateAIConfig({provider:"lmstudio",model:"my-model"}).apiKey,"");
 assert.equal(validateAIConfig({provider:"free",model:"qwen3:0.6b"}).endpoint,"http://127.0.0.1:11435/v1");
 assert.equal(validateAIConfig({provider:"compatible",model:"openai/gpt-4o-mini",apiKey:"x",
  endpoint:"https://openrouter.ai/api/v1"}).endpoint,"https://openrouter.ai/api/v1");
 assert.throws(()=>validateAIConfig({provider:"openai",model:"gpt-4.1-mini"}),/Clé API/);
 assert.throws(()=>validateAIConfig({provider:"compatible",model:"fake",apiKey:"x",endpoint:"http://127.0.0.1:1234/v1"}),/HTTPS/);
 assert.throws(()=>validateAIConfig({provider:"compatible",model:"fake",apiKey:"x",endpoint:"https://example.com@127.0.0.1/v1"}),/HTTPS|Domaine/);
});
function startState(){
 let state=createState();
 state=applyCommand(state,{type:"setup-human",legend:{name:"Shen",type:"Legend"},champion:{name:"Shen, Leader",type:"Unit"},battlefield:{name:"Grove",type:"Battlefield"}});
 state=applyCommand(state,{type:"setup-ai",legend:{name:"Jinx",type:"Legend"},champion:{name:"Jinx, Loose Cannon",type:"Unit"},
  battlefield:{name:"Arena",type:"Battlefield"},main:Array.from({length:10},(_,i)=>({name:"AI hidden "+i,type:"Unit"})),
  runes:Array.from({length:12},()=>({name:"Rune",type:"Rune"})),mainIncludesChampion:false});
 state=applyCommand(state,{type:"add",player:"human",zone:"hand",card:{name:"Human secret card",type:"Unit"}});
 state=applyCommand(state,{type:"start",player:"human"});
 return state;
}
test("the outbound context never exposes physical player's hidden cards, or deck order",()=>{
 const state=startState(),out=modelBoardState(state),text=JSON.stringify(out);
 assert.ok(text.includes("AI hidden"));
 assert.ok(!text.includes("Human secret card"));
 assert.ok(!text.includes("decks"));
});
test("the opponent cannot reset games, invent AI cards or manipulate a hidden hand",()=>{
 const state=startState();
 assert.throws(()=>validateAgentCommands([{type:"reset"}],state,"Je joue"),/Commande non autorisée/);
 assert.throws(()=>validateAgentCommands([{type:"add",player:"ai",zone:"base",card:{name:"Invented"}}],state,"Je joue"),/L'IA ne peut pas/);
 const secret=state.cards.find(c=>c.name==="Human secret card");
 assert.throws(()=>validateAgentCommands([{type:"move",uid:secret.uid,zone:"base"}],state,"Je joue"),/main physique/);
 assert.throws(()=>validateAgentCommands([{type:"score",player:"ai",value:50}],state,"Je joue"),/Score/);
});
test("local opponent uses outbound chat completion, keeps credentials local and applies a valid batch",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-ai-test-"));
 let state=startState(),requests=[],messages=[];
 let resolveReply;
 const completed=new Promise(resolve=>{resolveReply=resolve;});
 const hand=state.cards.find(c=>c.owner==="ai"&&c.zone==="hand");
 try{
  const ai=createIntegratedAI({
   userData:dir,getState:()=>state,getCatalog:async()=>[],getMessages:()=>({messages:[]}),
   sendMessage:text=>{messages.push(text);resolveReply(text);},
   applyBatch:async(cmds,revision)=>{
    assert.equal(state.revision,revision);
    let next=state;for(const cmd of cmds)next=applyCommand(next,cmd);
    state=next;
   },
   fetchImpl:async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
     reply:"Je déploie une unité en base.",
     commands:[{type:"move",uid:hand.uid,zone:"base"}]
    })}}]})};
   }
  });
  const conf=ai.configure({provider:"openai",model:"gpt-4.1-mini",apiKey:"secret-test-api-key"});
  assert.equal(conf.enabled,true);
  assert.equal(conf.hasKey,true);
  assert.ok(!JSON.stringify(conf).includes("secret-test-api-key"));
  ai.onHumanMessage("Ton tour.");
  await Promise.race([completed,new Promise((_,reject)=>setTimeout(()=>reject(Error("AI response timed out")),1500))]);
  assert.match(messages[0],/déploie une unité/);
  assert.equal(state.cards.find(c=>c.uid===hand.uid).zone,"base");
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.headers.Authorization,"Bearer secret-test-api-key");
  assert.equal(requests[0].url,"https://api.openai.com/v1/chat/completions");
  assert.equal(ai.disable().enabled,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("provider errors are displayed without leaking the API key",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-ai-error-"));
 const state=startState(),key="secret-to-not-leak";
 let done;const received=new Promise(resolve=>done=resolve);
 try{
  const ai=createIntegratedAI({userData:dir,getState:()=>state,
   getCatalog:async()=>[],getMessages:()=>({messages:[]}),applyBatch:async()=>{},
   sendMessage:text=>done(text),fetchImpl:async()=>({ok:false,status:401})
  });
  ai.configure({provider:"openai",model:"gpt-4.1-mini",apiKey:key});
  ai.onHumanMessage("Bonjour");
  const message=await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error("No error reply")),1500))]);
  assert.match(message,/HTTP 401/);
  assert.ok(!message.includes(key));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
