import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
const card=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:1,...extra});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champion"),battlefield:card("Arena","Battlefield"),
  main:Array.from({length:15},(_,i)=>card("Filler "+i)),
  runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:3});
 s=applyCommand(s,{type:"draw",player:"ai",count:1});
 return applyCommand(s,{type:"phase",phase:"Main"});
}
const add=(s,c,zone="hand")=>applyCommand(s,{type:"add",player:"ai",card:c,zone});
const play=(s,name,rest={})=>applyCommand(s,{
 type:"play-paid",uid:s.cards.find(c=>c.name===name&&c.zone==="hand").uid,
 zone:"base",...rest
});
test("any unit with a printed draw effect uses the real AI deck and hand",()=>{
 let s=setup();
 s=add(s,card("Archivist","Unit",{energy:1,text:"When you play me, draw 2."}));
 const before=s.players.ai.handCount,deck=s.players.ai.deckCount;
 s=play(s,"Archivist");
 assert.equal(s.players.ai.handCount,before+1);
 assert.equal(s.players.ai.deckCount,deck-2);
 assert.equal(s.pendingEffects.length,0);
 assert.match(s.message,/pioche 2 carte/);
});
test("ordinary gear remains ready in base and executes its card text",()=>{
 let s=setup();
 s=add(s,card("Rune Lantern","Gear",{energy:1,text:"When you play this, ready 1 friendly rune."}));
 s=play(s,"Rune Lantern");
 assert.equal(s.cards.find(c=>c.name==="Rune Lantern").zone,"base");
 assert.equal(s.cards.find(c=>c.name==="Rune Lantern").exhausted,false);
 assert.equal(s.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length,0);
});
test("ordinary spell resolves printed instructions and goes to owner's trash",()=>{
 let s=setup();
 s=add(s,card("Quick Study","Spell",{energy:1,text:"[Action]\nDraw 2."}));
 const before=s.players.ai.deckCount;
 s=play(s,"Quick Study");
 assert.equal(s.cards.find(c=>c.name==="Quick Study").zone,"trash");
 assert.equal(s.players.ai.deckCount,before-2);
});
test("Beginning and Ending triggered abilities execute for cards already in play",()=>{
 let s=setup();
 s=add(s,card("Turn Scribe","Unit",{text:"At the start of your Beginning Phase, draw 1."}),"base");
 s=add(s,card("End Scribe","Unit",{text:"At the end of your turn, ready 1 friendly rune."}),"base");
 s=applyCommand(s,{type:"exhaust-runes",player:"ai",count:1});
 s=applyCommand(s,{type:"phase",phase:"Ending"});
 assert.equal(s.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length,0);
 s=applyCommand(s,{type:"next-turn"});
 const deck=s.players.ai.deckCount;
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.players.ai.deckCount,deck-1);
 assert.equal(s.pendingEffects.length,0);
});
test("on-conquer ability on the unit is applied after a genuine score",()=>{
 let s=setup();
 s=add(s,card("Victory Bird","Unit",{text:"When I conquer, draw 1."}),"base");
 const bird=s.cards.find(c=>c.name==="Victory Bird");
 const before=s.players.ai.deckCount;
 s=applyCommand(s,{type:"move",uid:bird.uid,zone:"battlefield",battlefield:0});
 assert.equal(s.players.ai.score,1);
 assert.equal(s.players.ai.deckCount,before-1);
});
test("unknown mandatory abilities are queued rather than being skipped, and require confirmation",()=>{
 let s=setup();
 s=add(s,card("Mystery","Unit",{text:"When you play me, choose a unit and transform it."}));
 s=play(s,"Mystery");
 assert.equal(s.pendingEffects.length,1);
 const pending=s.pendingEffects[0];
 assert.match(pending.text,/transform it/);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/en attente/);
 assert.throws(()=>applyCommand(s,{type:"effect-confirm",id:pending.id}),/Confirme explicitement/);
 s=applyCommand(s,{type:"effect-confirm",id:pending.id,confirm:true});
 assert.equal(s.pendingEffects.length,0);
 assert.equal(applyCommand(s,{type:"next-turn"}).active,"human");
});
test("Accelerate is never free: extra Energy and domain Power must be paid",()=>{
 let s=setup();
 const unit=card("Fast Unit","Unit",{energy:1,domains:["Chaos"],
  text:"[Accelerate] (You may pay {energy:1}{power:chaos} as an additional cost to have me enter ready.)"});
 s=add(s,unit);
 s=play(s,"Fast Unit");
 assert.equal(s.cards.find(c=>c.name==="Fast Unit").exhausted,true);
 let b=setup();b=add(b,unit);
 b=play(b,"Fast Unit",{accelerate:true});
 assert.equal(b.cards.find(c=>c.name==="Fast Unit").exhausted,false);
 assert.ok(b.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length>=2);
 assert.ok(b.cards.filter(c=>c.owner==="ai"&&c.zone==="runes").length<=2);
});
test("remaining trigger prevents automatic upkeep from advancing during unresolved phase",()=>{
 let s=setup();s=add(s,card("Unclear","Unit",{
  text:"At the end of your turn, choose a card in your trash. Return it to your hand."}),"base");
 s=applyCommand(s,{type:"phase",phase:"Ending"});
 assert.equal(s.pendingEffects.length,1);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/en attente/);
 assert.equal(advanceMandatoryTurn(s).revision,s.revision);
});
