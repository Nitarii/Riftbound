import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {publicGameState,manualAgentRequest,parseManualAgentReply,previewManualActions} from "../manual-bridge.mjs";

function game(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",
   legend:{name:"Shen, Eye of Twilight",type:"Legend"},
   champion:{name:"Shen, Leader",type:"Unit"},
   battlefield:{name:"Grove of the God-Willow",type:"Battlefield"}
 });
 s=applyCommand(s,{type:"setup-ai",
  legend:{name:"Fiora, Peerless",type:"Legend"},
  champion:{name:"Fiora, Challenger",type:"Unit"},
  battlefield:{name:"Training Grounds",type:"Battlefield"},
  main:Array.from({length:8},(_,i)=>({name:"Secret AI Card "+i,type:"Unit"})),
  runes:Array.from({length:12},()=>({name:"Rune",type:"Rune"})),
  mainIncludesChampion:false,format:"custom"
 });
 s=applyCommand(s,{type:"note",text:"Private note: 123456PRIVATE"});
 s.password="private-token";
 return s;
}
test("text handoff exports only visible cards and count, never secrets or decks",()=>{
 const state=game(),value=publicGameState(state);
 const result=JSON.stringify(value);
 assert.equal(value.revision,state.revision);
 assert.equal(value.players.ai.handCount,4);
 assert.equal(value.cards.filter(c=>c.zone==="hand").length,4);
 assert.ok(value.cards.filter(c=>c.zone==="hand").every(c=>!c.name&&!c.code));
 for(const secret of ["Secret AI Card","123456PRIVATE","private-token","decks","password"]){
  assert.ok(!result.includes(secret),"Leaked "+secret);
 }
 const request=manualAgentRequest(state);
 assert.match(request,/JSON/);
 assert.match(request,/mains et l'ordre des decks/i);
 assert.ok(!request.includes("Secret AI Card"));
});
test("accepts one JSON code fence and validates all changes",()=>{
 const state=game(),revision=state.revision;
 const response="Je joue\n"+String.fromCharCode(96).repeat(3)+"json\n"+
  JSON.stringify({revision,message:"Je passe",commands:[
   {type:"phase",phase:"Main"},
   {type:"note",text:"Je prépare mon jeu"},
   {type:"next-turn"}
  ]})+"\n"+String.fromCharCode(96).repeat(3);
 const preview=previewManualActions(state,response);
 assert.equal(preview.commands.length,3);
 assert.equal(preview.changes.length,3);
 assert.equal(preview.revision,revision);
 assert.equal(state.revision,revision,"Preview must not mutate real state");
});
test("refuses old revision, dangerous operations and arbitrary JavaScript",()=>{
 const state=game(),rev=state.revision;
 assert.throws(()=>parseManualAgentReply(JSON.stringify({revision:rev-1,commands:[{type:"note",text:"ok"}]}),rev),/ancien état/);
 assert.throws(()=>parseManualAgentReply(JSON.stringify({commands:[{type:"reset"}]}),rev),/interdite/);
 assert.throws(()=>parseManualAgentReply(JSON.stringify({commands:[{type:"setup-human"}]}),rev),/interdite/);
 assert.throws(()=>parseManualAgentReply("console.log('please execute')",rev),/JSON/);
 assert.throws(()=>parseManualAgentReply(JSON.stringify({commands:Array.from({length:16},()=>({type:"note",text:"x"}))}),rev),/15/);
});
test("preflight rejects invalid commands before any actual action is applied",()=>{
 const state=game(),revision=state.revision;
 assert.throws(()=>previewManualActions(state,JSON.stringify({
  revision,commands:[{type:"note",text:"first valid"},{type:"move",uid:"does-not-exist",zone:"base"}]
 })),/Carte absente/);
 assert.equal(state.revision,revision);
});
test("site exposes a no-console manual agent UI and an easy entry point",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 for(const id of ["manual-copy-state","manual-agent-reply","manual-preview","manual-apply","manual-agent-preview"]){
  assert.ok(html.includes('id="'+id+'"'),"missing UI "+id);
  assert.ok(app.includes('"'+id+'"'),"unwired UI "+id);
 }
 assert.match(app,/showGame\("agent"\)/);
 assert.match(app,/manualAgentRequest\(state\)/);
 assert.match(app,/previewManualActions\(state,/);
 assert.match(app,/ifRevision:state\.revision/);
});
