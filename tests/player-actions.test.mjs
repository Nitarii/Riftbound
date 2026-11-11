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
test("first player cannot channel three opening runes",()=>{
 const {state,plan}=applyPlan(setup(),"je pioche mes 3 runes de départ et je joue un loyal poro dans ma base");
 assert.match(plan.error,/2 runes/);
 assert.equal(state.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,0);
});
test("physical runes and card placement update real board in French, with payment",()=>{
 let s=setup();
 let x=applyPlan(s,"je canalise deux runes");assert.equal(x.plan.error,undefined);s=x.state;
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,2);
 x=applyPlan(s,"je pioche une carte");assert.equal(x.plan.error,undefined);s=x.state;
 x=applyPlan(s,"j'épuise une rune pour jouer Loyal Poro dans ma base");assert.equal(x.plan.error,undefined);s=x.state;
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="base")[0].name,"Loyal Poro");
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,1);
 assert.equal(s.players.human.handCount,4);
 x=applyPlan(s,"je termine mon tour");assert.equal(x.plan.error,undefined);
 assert.equal(x.state.active,"ai");
});
test("English channeling, drawing and play are understood",()=>{
 let s=setup();
 for(const message of ["I channel two runes","I draw one card","I exhaust one rune to play Loyal Poro in my base"]){
  const x=applyPlan(s,message);assert.equal(x.plan.error,undefined,message+": "+x.plan.error);s=x.state;
 }
 assert.equal(s.cards.find(c=>c.owner==="human"&&c.zone==="base").name,"Loyal Poro");
});
test("unrecognized cards are never invented",()=>{
 const s=setup();
 assert.equal(findAnnouncedCard(catalog,"fictional attacker"),null);
 const x=applyPlan(s,"I play fictional attacker in my base");
 assert.ok(x.plan.error);
 assert.equal(x.state.revision,s.revision);
});
test("second player opening turn gets three channel runes",()=>{
 let s=setup("ai");
 s=applyCommand(s,{type:"next-turn"});
 const x=applyPlan(s,"je canalise trois runes");
 assert.equal(x.plan.error,undefined);
 assert.equal(x.state.players.human.runeCount,9);
});
test("AI fallback uses only real UIDs and returns control to human",()=>{
 let s=setup();
 s=applyCommand(s,{type:"next-turn"});
 const commands=planSafeAITurn(s);
 assert.ok(commands.some(x=>x.type==="play-paid"),"AI pays before playing a known card");
 assert.ok(commands.some(x=>x.type==="channel"));
 for(const command of commands)s=applyCommand(s,command);
 assert.equal(s.active,"human");
 assert.ok(s.cards.find(c=>c.owner==="ai"&&c.zone==="base"));
 assert.ok(s.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length>=1);
});
