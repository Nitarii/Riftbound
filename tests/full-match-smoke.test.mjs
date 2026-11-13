import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
import {planAutonomousAITurn} from "../ai-turn.mjs";
const card=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:3,...extra});
function start(index){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champion"),battlefield:card("Arena","Battlefield"),
  main:Array.from({length:40},(_,i)=>card("Unit "+index+"-"+i,"Unit",{energy:1+(i%2)})),
  runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 return advanceMandatoryTurn(applyCommand(s,{type:"start",player:"ai"}));
}
function check(s){
 assert.equal(s.players.ai.deckCount,s.decks.ai.main.length);
 assert.equal(s.players.ai.runeCount,s.decks.ai.runes.length);
 assert.equal(s.players.ai.handCount,s.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").length);
 assert.equal(new Set(s.cards.map(c=>c.uid)).size,s.cards.length);
 for(const p of ["ai","human"]){
  assert.ok(s.players[p].score>=0&&s.players[p].score<=8);
  assert.ok(s.players[p].handCount>=0&&s.players[p].deckCount>=0);
 }
}
test("deterministic opponent can complete 8 physical-board matches without illegal command or stalemate",()=>{
 for(let i=0;i<8;i++){
  let s=start(i),steps=0;
  check(s);
  while(!s.finished&&steps<55){
   if(s.active==="ai"){
    const plan=planAutonomousAITurn(s,{maxUnits:3,maxMoves:5});
    assert.equal(plan.error,undefined,"AI action failed: "+plan.error);
    assert.ok(plan.commands.length>0||plan.finished,"AI must progress or finish");
    for(const command of plan.commands){s=applyCommand(s,command);check(s);}
   }else{
    s=advanceMandatoryTurn(s);
    s=applyCommand(s,{type:"next-turn"});
   }
   s=advanceMandatoryTurn(s);
   check(s);steps++;
  }
  assert.equal(s.finished,true,"game "+i+" must reach a true victory");
  assert.equal(s.winner,"ai","AI should win when the physical opponent makes no moves");
  assert.equal(s.players.ai.score,8);
  assert.throws(()=>applyCommand(s,{type:"next-turn"}),/Partie terminée/);
 }
});
