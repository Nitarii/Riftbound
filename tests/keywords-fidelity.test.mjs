import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities} from "../effect-engine.mjs";

const card=(name,type="Unit",extra={})=>({
 name,type,energy:0,power:0,might:2,...extra
});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champ"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champ"),battlefield:card("Arena","Battlefield"),
  main:Array.from({length:25},(_,i)=>card("Deck "+i)),
  runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:3});
 s=applyCommand(s,{type:"draw",player:"ai",count:1});
 return applyCommand(s,{type:"phase",phase:"Main"});
}
const add=(s,c,zone="hand",field)=>applyCommand(s,{
 type:"add",player:"ai",zone,battlefield:field,card:c
});
const play=(s,name,extra={})=>applyCommand(s,{
 type:"play-paid",uid:s.cards.find(x=>x.name===name&&x.zone==="hand").uid,
 zone:"base",...extra
});
test("printed Deathknell triggers on death and channels exhausted runes",()=>{
 const text="[Deathknell] — Channel 2 runes exhausted and draw 1. (When I die, get the effect.)";
 const read=compileCardAbilities(card("Tasty Faefolk","Unit",{text}));
 assert.equal(read.unsupported.length,0,JSON.stringify(read.unsupported));
 assert.deepEqual(read.abilities[0].steps,[{kind:"channel-exhausted",count:2},{kind:"draw",count:1}]);
 let s=setup();
 s=add(s,card("Tasty Faefolk","Unit",{text,might:1}),"base");
 const uid=s.cards.find(c=>c.name==="Tasty Faefolk").uid;
 const oldDeck=s.decks.ai.main.length,oldRunes=s.cards.filter(c=>c.zone==="runes"&&c.owner==="ai").length;
 s=applyCommand(s,{type:"damage",uid,value:1});
 assert.equal(s.cards.find(c=>c.uid===uid).zone,"trash");
 assert.equal(s.decks.ai.main.length,oldDeck-1);
 const runeCards=s.cards.filter(c=>c.zone==="runes"&&c.owner==="ai");
 assert.equal(runeCards.length,oldRunes+2);
 assert.equal(runeCards.filter(c=>c.exhausted).length,2);
 assert.equal(s.pendingEffects.length,0);
});
test("Legion play effect is inactive as first card, active after another different card",()=>{
 const legion=card("Scrapyard Champion","Unit",{
  energy:0,text:"[Legion] — When you play me, discard 1, then draw 1. (Get the effect if you've played another card this turn.)"
 });
 let s=setup();
 s=add(s,legion);
 s=play(s,"Scrapyard Champion");
 assert.equal(s.turnActions.played.ai,1);
 assert.equal(s.pendingEffects.length,0);
 s=add(s,card("Disposable","Unit"));
 s=add(s,legion);
 const before=s.players.ai.handCount;
 const discarded=s.cards.find(c=>c.name==="Disposable"&&c.zone==="hand").uid;
 s=play(s,"Scrapyard Champion",{discardUids:[discarded]});
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.cards.find(c=>c.uid===discarded).zone,"trash");
 assert.equal(s.players.ai.handCount,before-1);
});
test("identical ally-play trigger fires for each separate unit, not once per turn",()=>{
 let s=setup();
 s=add(s,card("Watcher","Unit",{text:"When you play a unit, draw 1."}),"base");
 s=add(s,card("Recruit A","Unit"));
 s=add(s,card("Recruit B","Unit"));
 const before=s.decks.ai.main.length;
 s=play(s,"Recruit A");
 s=play(s,"Recruit B");
 assert.equal(s.decks.ai.main.length,before-2);
 assert.equal(s.pendingEffects.length,0);
});
test("unit-only play triggers ignore spells",()=>{
 let s=setup();
 s=add(s,card("Watcher","Unit",{text:"When you play a unit, draw 1."}),"base");
 s=add(s,card("Quick Spell","Spell",{text:"Draw 1."}));
 const oldDeck=s.decks.ai.main.length;
 s=play(s,"Quick Spell");
 assert.equal(s.decks.ai.main.length,oldDeck-1);
});
test("Temporary unit dies before its controller's next Hold scoring",()=>{
 let s=setup();
 s=add(s,card("Ephemeral","Unit",{text:"[Temporary] (At start of my controller's Beginning Phase, kill this.)"}),"battlefield",0);
 const last=s.players.ai.score;
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.cards.find(c=>c.name==="Ephemeral").zone,"trash");
 assert.equal(s.players.ai.score,last);
});
test("Vision lets AI inspect its own deck without asking for a revealed opponent hand",()=>{
 let s=setup();
 s=add(s,card("Gemcraft Seer","Unit",{
  energy:1,text:"[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)"
 }));
 const before=s.decks.ai.main.length;
 s=play(s,"Gemcraft Seer");
 assert.equal(s.decks.ai.main.length,before);
 assert.equal(s.pendingEffects.length,0);
 assert.match(s.message,/Vision/);
});
test("human optional effects are not applied without their choice",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",zone:"hand",
  card:card("Optional Unit","Unit",{text:"When you play me, you may draw 1."})});
 const before=s.players.human.handCount;
 s=applyCommand(s,{type:"add",player:"human",zone:"base",fromHand:true,
  card:card("Optional Unit","Unit",{text:"When you play me, you may draw 1."})});
 assert.equal(s.players.human.handCount,before-1);
 assert.equal(s.pendingEffects.length,1);
});
