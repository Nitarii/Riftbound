import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {planHumanAnnouncement,findAnnouncedCard} from "../player-actions.mjs";
import {planSafeAITurn} from "../ai-turn.mjs";
const c=(name,type="Unit",energy=0)=>({code:name.replaceAll(" ","-"),name,type,energy});
const catalog=[c("Loyal Poro","Unit",1),c("Shen","Unit",2)];
function setup(first="human"){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:c("Hero","Legend"),champion:c("Shen"),battlefield:c("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:c("Jinx","Legend"),champion:c("Jinx Demolitionist"),
  battlefield:c("Arena","Battlefield"),main:Array.from({length:10},(_,i)=>c("AI Unit "+i,"Unit",1)),
  runes:Array.from({length:12},()=>c("Rune","Rune")),mainIncludesChampion:false});
 return applyCommand(s,{type:"start",player:first});
}
function applyPlan(s,announcement){
 const plan=planHumanAnnouncement(announcement,s,catalog);
 if(plan.error)return {state:s,plan};
 for(const command of plan.commands)s=applyCommand(s,command);
 return {state:s,plan};
}

test("opening upkeep runs automatically, including the physical player's hidden draw",()=>{
 let s=setup("human");
 assert.equal(s.phase,"Main");
 assert.equal(s.turnActions.channeled,2);
 assert.equal(s.turnActions.drawn,1);
 assert.equal(s.players.human.handCount,5);
 assert.equal(s.players.human.deckCount,34);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,2);
 assert.deepEqual(planHumanAnnouncement("je pioche une carte",s,catalog).commands,[]);
 assert.deepEqual(planHumanAnnouncement("je canalise deux runes",s,catalog).commands,[]);
 assert.equal(planHumanAnnouncement("je canalise trois runes",s,catalog).error!==undefined,true);
});

test("player can play a basic unit without narrating normal upkeep or printed energy",()=>{
 let s=setup();
 const plan=planHumanAnnouncement("Je joue Loyal Poro",s,catalog);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.some(c=>c.type==="add"&&c.card.name==="Loyal Poro"));
 for(const command of plan.commands)s=applyCommand(s,command);
 assert.equal(s.players.human.handCount,4);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,1);
});

test("announced cost is separated from the card name and no duplicate draw happens",()=>{
 let s=setup("human");
 const before=s.players.human.handCount;
 const plan=planHumanAnnouncement("je pioche une carte et je joue loyal poro pour 1 rune",s,catalog);
 assert.equal(plan.error,undefined,plan.error);
 assert.equal(plan.commands.filter(c=>c.type==="draw").length,0);
 assert.ok(plan.commands.some(c=>c.type==="add"&&c.card.name==="Loyal Poro"));
 for(const command of plan.commands)s=applyCommand(s,command);
 assert.equal(s.players.human.handCount,before-1);
});
test("bad payment is rejected without modifying the state",()=>{
 const s=setup();
 const plan=planHumanAnnouncement("je joue loyal poro pour 3 runes",s,catalog);
 assert.ok(plan.error);
 assert.equal(plan.commands.length,0);
});
test("second player's opening channel of three is automatic",()=>{
 let s=setup("ai");
 assert.equal(s.turnActions.channeled,2);
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.active,"human");
 assert.equal(s.turnActions.channeled,3);
 assert.equal(s.turnActions.drawn,1);
 assert.equal(s.players.human.runeCount,9);
});
test("AI planner does not duplicate mandatory opening upkeep",()=>{
 let s=setup();
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.active,"ai");
 assert.equal(s.turnActions.channeled,3);
 assert.equal(s.turnActions.drawn,1);
 const commands=planSafeAITurn(s);
 assert.ok(!commands.some(c=>c.type==="channel"||c.type==="draw"));
 for(const command of commands)s=applyCommand(s,command);
 assert.equal(s.active,"human");
 assert.equal(s.turnActions.drawn,1);
});
