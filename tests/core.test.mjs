import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
const card=(name,type="Unit")=>({name,type,code:name.toLowerCase().replaceAll(" ","-")});
test("setup records legend, champion, battlefield",()=>{
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),champion:card("Leader"),battlefield:card("Grove","Battlefield")});
 assert.equal(s.players.human.legend.name,"Shen");
 assert.equal(s.battlefields[0].card.name,"Grove");
 assert.equal(s.cards.length,2);
});
test("AI setup draws four actual card instances",()=>{
 let s=createState(),main=Array.from({length:40},(_,i)=>card("Unit "+i));
 s=applyCommand(s,{type:"setup-ai",legend:card("Legend","Legend"),champion:card("Hero"),battlefield:card("Field","Battlefield"),main,runes:Array.from({length:12},()=>card("Rune","Rune"))});
 assert.equal(s.players.ai.handCount,4);
 assert.equal(s.players.ai.deckCount,36);
 assert.equal(s.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").length,4);
});
test("actions track cards, scores and revisions without enforcing card rules",()=>{
 let s=createState();
 s=applyCommand(s,{type:"add",player:"ai",card:card("Test"),zone:"base"});
 const uid=s.cards[0].uid;
 s=applyCommand(s,{type:"move",uid,zone:"battlefield",battlefield:1});
 s=applyCommand(s,{type:"exhaust",uid});
 s=applyCommand(s,{type:"damage",uid,value:2});
 s=applyCommand(s,{type:"score",player:"ai",value:3});
 assert.equal(s.cards[0].battlefield,1);
 assert.equal(s.cards[0].damage,2);
 assert.equal(s.cards[0].exhausted,true);
 assert.equal(s.players.ai.score,3);
 assert.equal(s.revision,5);
});
test("does not mutate previous snapshots",()=>{
 const a=createState(),b=applyCommand(a,{type:"note",text:"Hello"});
 assert.equal(a.revision,0);assert.equal(b.revision,1);
});
test("rejects invalid commands",()=>{
 assert.throws(()=>applyCommand(createState(),{type:"add",card:card("X"),zone:"invalid"}));
 assert.throws(()=>applyCommand(createState(),{type:"score",player:"wrong",value:1}));
});
