import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createConversation} from "../conversation.mjs";

test("player and agent messages persist with server-assigned roles",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-chat-"));
 try{
  const file=path.join(dir,"chat.json");
  const chat=createConversation({file});
  assert.equal(chat.list().messages.length,0);
  const human=chat.post("human","J'avance mon champion sur le terrain.");
  const ai=chat.post("ai","Je défends mon terrain.");
  assert.equal(human.id,1);assert.equal(ai.id,2);
  assert.equal(chat.list(1).messages[0].role,"ai");
  const other=createConversation({file});
  assert.deepEqual(other.list().messages.map(x=>x.role),["human","ai"]);
  assert.equal(other.post("human","Je passe mon tour").id,3);
  other.clear();
  assert.equal(other.list().messages.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("message queue enforces bounded text and roles and tracks agent polling",()=>{
 const chat=createConversation();
 assert.throws(()=>chat.post("admin","hello"),/Émetteur/);
 assert.throws(()=>chat.post("human"," ".repeat(10)),/Message obligatoire/);
 assert.throws(()=>chat.post("ai","x".repeat(1201)),/1200/);
 assert.throws(()=>chat.list(-1),/Curseur/);
 for(let n=0;n<190;n++)chat.post("human","message "+n);
 assert.ok(chat.list().messages.length<=80);
 chat.markAgentPoll();
 assert.ok(chat.list(0).agentSeenAt>0);
});
test("bottom-right discussion, voice, Enter, end-turn and terrain detail are wired",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 for(const id of ["chat-messages","chat-connection","chat-pass-turn","send-note","notes","voice-note",
  "battlefield-name-0","battlefield-name-1","bf-image-0","bf-image-1"]){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(app,/sendNote\(\)/);
 assert.match(app,/event\.key==="Enter"&&!event\.shiftKey/);
 assert.match(app,/async function syncChat\(/);
 assert.match(app,/\/api\/messages\?after=/);
 assert.match(app,/method:"POST"/);
 assert.match(app,/showBattlefieldDetails\(Number\(field\.dataset\.battlefieldInspect\)\)/);
 assert.match(app,/data-fallback/);
 assert.match(app,/createVoiceConversation\(/);
 assert.match(app,/voiceController\.start\(\)/);
 assert.match(app,/voiceController\.speak\(m\.text\)/);
});
