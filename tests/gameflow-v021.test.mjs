import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createState,applyCommand} from "../core.mjs";
import {battlefieldController,hasScoredField} from "../battlefield-rules.mjs";
import {planPlayerSequence} from "../player-sequence.mjs";
import {isChatAtBottom,restoredChatPosition,shouldShowJump} from "../chat-scrolling.mjs";
import {createConversation} from "../conversation.mjs";
const card=(name,type="Unit",energy=1)=>({code:name.replaceAll(" ","-"),name,type,energy});
const catalog=[card("Loyal Poro")];
const setup=()=>{
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Leader"),battlefield:card("Grove of the God-Willow","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),champion:card("Jinx Demolitionist"),
  battlefield:card("Star Spring","Battlefield"),main:[],runes:[]});
 return applyCommand(s,{type:"start",player:"human"});
};
const boardMove=(state,unit,field=0)=>{
 // A standard move is legal only in the controlling player's Main Phase.
 if(state.phase!=="Main")state=applyCommand(state,{type:"phase",phase:"Main"});
 const uid=state.cards.find(c=>c.owner==="human"&&c.name===unit&&c.zone==="base")?.uid;
 return applyCommand(state,{type:"move",uid,zone:"battlefield",battlefield:field});
};
test("sequential French announcements move an existing Poro, score a Conquer, and end the turn",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base"});
 const announcement="je pioche deux runes, je pioche une carte, je conquiers le grove of the god willow avec mon loyal poro puis je termine mon tour";
 const plan=planPlayerSequence(announcement,s,catalog);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.some(x=>x.type==="move"),"must move the existing card");
 assert.ok(plan.commands.some(x=>x.type==="next-turn"));
 for(const cmd of plan.commands)s=applyCommand(s,cmd);
 const poro=s.cards.find(c=>c.owner==="human"&&c.name==="Loyal Poro");
 assert.equal(poro.zone,"battlefield");
 assert.equal(poro.battlefield,0);
 assert.equal(poro.exhausted,true);
 assert.equal(s.players.human.score,1);
 assert.equal(s.active,"ai");
 assert.equal(battlefieldController(s,0),"human");
});
test("conquering once and then holding next turn score once per field per turn",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base"});
 s=applyCommand(s,{type:"channel",player:"human",count:2});
 s=applyCommand(s,{type:"draw",player:"human",count:1});
 s=boardMove(s,"Loyal Poro",0);
 assert.equal(s.players.human.score,1);
 assert.equal(hasScoredField(s,"human",0),true);
 s=applyCommand(s,{type:"phase",phase:"Beginning"});
 assert.equal(s.players.human.score,1);
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.players.human.score,2,"hold after opponent's turn adds 1");
 assert.equal(s.phase,"Beginning");
 assert.equal(s.scoredFields.human.length,1);
});
test("contested field never grants an automatic Conquer point",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"ai",card:card("Enemy"),zone:"battlefield",battlefield:0});
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base"});
 s=boardMove(s,"Loyal Poro",0);
 assert.equal(battlefieldController(s,0),null);
 assert.equal(s.players.human.score,0);
});
test("final point limitation: a first conquest at seven grants draw rather than a win",()=>{
 let s=setup();
 s=applyCommand(s,{type:"score",player:"human",set:true,value:7});
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base"});
 const original=s.players.human.handCount;
 s=boardMove(s,"Loyal Poro",0);
 assert.equal(s.players.human.score,7);
 assert.equal(s.players.human.handCount,original+1);
 assert.equal(s.scoredFields.human.includes(0),true);
});
test("mixed-language narration targets the player's named battlefield and doesn't invent UID",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base"});
 let p=planPlayerSequence("Je channel deux runnes, I draw une carte, je move mon loyal poro sur mon champ de bataille",s,catalog);
 assert.equal(p.error,undefined,p.error);
 for(const action of p.commands)s=applyCommand(s,action);
 assert.equal(s.cards.find(c=>c.name==="Loyal Poro").battlefield,0);
 const no=planPlayerSequence("Je conquiers le star spring avec mon imaginary poro",s,catalog);
 assert.ok(no.error);
 assert.equal(no.commands.length,0);
});
test("unready unit cannot conquer or claim points",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",card:card("Loyal Poro"),zone:"base",fromHand:true});
 const p=planPlayerSequence("je canalise deux runes je pioche une carte je conquiers grove avec loyal poro",s,catalog);
 assert.match(p.error,/épuisé/i);
 assert.equal(s.players.human.score,0);
});
test("reader scrolls back to older messages without being forced to the bottom",()=>{
 const old={scrollTop:150,scrollHeight:1200,clientHeight:350};
 const next={scrollHeight:1510,clientHeight:350};
 assert.equal(isChatAtBottom(old),false);
 assert.equal(restoredChatPosition(old,next,{stickToBottom:false}),150);
 assert.equal(shouldShowJump(old,true),true);
 const bottom={scrollTop:850,scrollHeight:1200,clientHeight:350};
 assert.equal(isChatAtBottom(bottom),true);
 assert.equal(restoredChatPosition(bottom,next,{stickToBottom:true}),1160);
});
test("every new game clears messages and starts a new chat session",()=>{
 const c=createConversation();
 const first=c.list().session;
 c.post("human","Je termine mon tour");
 c.post("ai","D'accord");
 c.clear();
 const next=c.list();
 assert.notEqual(next.session,first);
 assert.equal(next.messages.length,0);
 assert.equal(c.post("human","Nouvelle partie").id,1);
});
test("UI has voice auto-send toggle, in-thread typing and jump to new messages",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
 for(const id of ["voice-auto-send","chat-jump","chat-typing","chat-messages","field-control-0","field-control-1"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/onTranscript:handleVoiceTranscript/);
 assert.match(app,/chatSession!==result\.session/);
 assert.match(app,/resetChatView\(\)/);
 assert.match(css,/\.side\.opponent \.playmat/);
 assert.match(css,/chat-log-wrap/);
 assert.match(css,/voice-auto-send/);
});

test("two paid units spoken in one sentence are applied in order or rejected atomically",()=>{
 let s=setup();
 const speech="je canalise deux runes je pioche une carte j'en exhaust une et je joue loyal poro dans ma base puis j'en exhaust une et je joue loyal poro dans ma base";
 const result=planPlayerSequence(speech,s,catalog);
 assert.equal(result.error,undefined,result.error);
 assert.equal(result.commands.filter(x=>x.type==="add").length,2);
 for(const cmd of result.commands)s=applyCommand(s,cmd);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="base"&&c.name==="Loyal Poro").length,2);
 assert.equal(s.cards.filter(c=>c.zone==="runes"&&c.exhausted).length,2);
 const invalid=planPlayerSequence("je joue loyal poro dans ma base et je joue loyal poro dans ma base et je joue loyal poro dans ma base",setup(),catalog);
 assert.ok(invalid.error);
 assert.equal(invalid.commands.length,0);
});
