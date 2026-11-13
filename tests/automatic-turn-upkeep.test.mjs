import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
import {planHumanAnnouncement} from "../player-actions.mjs";

const card=(name,type="Unit",energy=0)=>({code:name.replaceAll(" ","-"),name,type,energy,power:0});
const cards=[card("Loyal Poro","Unit",1),card("Shen","Unit",2)];
function start(first="human"){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Hero","Legend"),
  champion:card("Shen"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),champion:card("Jinx Champion"),
  battlefield:card("Arena","Battlefield"),main:Array.from({length:15},(_,i)=>card("AI Unit "+i)),
  runes:Array.from({length:12},()=>card("Rune","Rune")),mainIncludesChampion:false});
 return applyCommand(s,{type:"start",player:first});
}
test("automatic opening phases apply once to the physical player without revealing cards",()=>{
 let s=advanceMandatoryTurn(start());
 assert.equal(s.active,"human");
 assert.equal(s.phase,"Main");
 assert.equal(s.turnActions.channeled,2);
 assert.equal(s.turnActions.drawn,1);
 assert.equal(s.players.human.handCount,5);
 assert.equal(s.players.human.deckCount,34);
 const once=s.revision;
 s=advanceMandatoryTurn(s);
 assert.equal(s.revision,once);
 assert.equal(s.players.human.handCount,5);
 assert.deepEqual(planHumanAnnouncement("je canalise deux runes et je pioche une carte",s,cards).commands,[]);
});
test("first AI turn automatically channels three runes as second player and draws once",()=>{
 let s=advanceMandatoryTurn(start("human"));
 s=applyCommand(s,{type:"next-turn"});
 s=advanceMandatoryTurn(s);
 assert.equal(s.active,"ai");
 assert.equal(s.turnActions.channeled,3);
 assert.equal(s.turnActions.drawn,1);
 assert.equal(s.phase,"Main");
});
test("human second player receives three runes and one card automatically",()=>{
 let s=advanceMandatoryTurn(start("ai"));
 s=applyCommand(s,{type:"next-turn"});
 s=advanceMandatoryTurn(s);
 assert.equal(s.active,"human");
 assert.equal(s.turnActions.channeled,3);
 assert.equal(s.turnActions.drawn,1);
 assert.equal(s.players.human.runeCount,9);
});
test("natural Poro announcement recognizes costs and does not double draw",()=>{
 let s=advanceMandatoryTurn(start());
 const before=s.players.human.handCount;
 const plan=planHumanAnnouncement("je pioche une carte et je joue loyal poro pour 1 rune",s,cards);
 assert.equal(plan.error,undefined,plan.error);
 assert.equal(plan.commands.filter(c=>c.type==="draw").length,0);
 assert.ok(plan.commands.some(c=>c.type==="add"&&c.card.name==="Loyal Poro"));
 for(const command of plan.commands)s=applyCommand(s,command);
 assert.equal(s.players.human.handCount,before-1);
});
test("printed energy can be paid without speaking the rune count",()=>{
 const s=advanceMandatoryTurn(start());
 const plan=planHumanAnnouncement("je joue Loyal Poro",s,cards);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.some(c=>c.type==="exhaust-runes"&&c.count===1));
});
test("an incorrect announced rune count is never silently accepted",()=>{
 const s=advanceMandatoryTurn(start());
 const plan=planHumanAnnouncement("je joue Loyal Poro pour 3 runes",s,cards);
 assert.ok(plan.error);
 assert.equal(plan.commands.length,0);
});

test("real Loyal Poro costing 3 energy is played on first turn of second player",()=>{
 let s=advanceMandatoryTurn(start("ai"));
 s=advanceMandatoryTurn(applyCommand(s,{type:"next-turn"}));
 const realCost=[card("Loyal Poro","Unit",3)];
 const plan=planHumanAnnouncement("je pioche une carte et je joue Loyal Poro pour 3 runes",s,realCost);
 assert.equal(plan.error,undefined,plan.error);
 assert.equal(plan.commands.filter(c=>c.type==="draw").length,0);
 assert.equal(plan.commands.find(c=>c.type==="exhaust-runes")?.count,3);
 assert.ok(plan.commands.some(c=>c.type==="add"&&c.card.name==="Loyal Poro"));
 for(const cmd of plan.commands)s=applyCommand(s,cmd);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,3);
});
