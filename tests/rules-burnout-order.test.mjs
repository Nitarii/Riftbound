import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
const c=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:2,...extra});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:c("Shen","Legend"),
  champion:c("Shen C"),battlefield:c("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:c("Jinx","Legend"),
  champion:c("Jinx C"),battlefield:c("Arena","Battlefield"),
  main:Array.from({length:9},(_,i)=>c("Deck "+i)),
  runes:Array.from({length:12},()=>c("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 s=applyCommand(s,{type:"draw",player:"ai",count:1});
 return s;
}
test("AI Burn Out recycles Main Deck trash and grants precisely one opposing VP",()=>{
 let s=setup();
 s.decks.ai.main=[];s.players.ai.deckCount=0;
 s=applyCommand(s,{type:"add",player:"ai",zone:"trash",card:c("Discard One")});
 s=applyCommand(s,{type:"add",player:"ai",zone:"trash",card:c("Discard Two")});
 const before=s.players.ai.handCount;
 s=applyCommand(s,{type:"draw",player:"ai",count:2});
 assert.equal(s.players.human.score,1);
 assert.equal(s.players.ai.handCount,before+2);
 assert.equal(s.players.ai.deckCount,0);
 assert.equal(s.cards.filter(x=>x.owner==="ai"&&x.zone==="trash").length,0);
 assert.match(s.message,/Burn Out/);
});
test("Burn Out with empty Main Deck and trash gives opponent the victory",()=>{
 let s=setup();
 s.decks.ai.main=[];s.players.ai.deckCount=0;s.players.human.score=7;
 s=applyCommand(s,{type:"draw",player:"ai",count:1});
 assert.equal(s.winner,"human");
 assert.equal(s.finished,true);
 assert.equal(s.players.human.score,8);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/Partie terminée/);
});
test("Unknown physical deck and trash are never simulated as AI knowledge",()=>{
 let s=setup();
 s.players.human.deckCount=0;
 const points=s.players.ai.score;
 s=applyCommand(s,{type:"draw",player:"human",count:1});
 assert.equal(s.players.ai.score,points);
 assert.equal(s.pendingEffects[0].cardName,"Burn Out");
});
test("Beginning abilities are resolved BEFORE Hold scoring",()=>{
 let s=setup();
 s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"add",player:"ai",zone:"base",card:c("Phase Assassin","Unit",{
  text:"At the start of your Beginning Phase, deal 2 damage to an enemy unit."
 })});
 s=applyCommand(s,{type:"add",player:"ai",zone:"battlefield",battlefield:0,card:c("AI Holder")});
 s=applyCommand(s,{type:"add",player:"human",zone:"battlefield",battlefield:0,card:c("Human Defender")});
 const before=s.players.ai.score;
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.cards.find(x=>x.name==="Human Defender").zone,"trash");
 assert.equal(s.players.ai.score,before+1);
});
