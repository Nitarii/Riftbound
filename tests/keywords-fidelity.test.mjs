import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities} from "../effect-engine.mjs";
import {resolveTop} from "./showdown-helper.mjs";

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
 assert.equal(s.decks.ai.main.length,oldDeck);
 s=resolveTop(s);
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
 assert.equal(s.cards.find(c=>c.uid===discarded).zone,"hand");
 s=resolveTop(s);
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
 s=resolveTop(s);
 s=play(s,"Recruit B");
 s=resolveTop(s);
 assert.equal(s.decks.ai.main.length,before-2);
 assert.equal(s.pendingEffects.length,0);
});
test("unit-only play triggers ignore spells",()=>{
 let s=setup();
 s=add(s,card("Watcher","Unit",{text:"When you play a unit, draw 1."}),"base");
 s=add(s,card("Quick Spell","Spell",{text:"Draw 1."}));
 const oldDeck=s.decks.ai.main.length;
 s=applyCommand(s,{type:"cast",player:"ai",uid:s.cards.find(c=>c.name==="Quick Spell").uid});
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
 assert.equal(s.decks.ai.main.length,oldDeck-1);
});
test("Temporary unit dies before its controller's next Hold scoring",()=>{
 let s=setup();
 s=add(s,card("Ephemeral","Unit",{text:"[Temporary] (At start of my controller's Beginning Phase, kill this.)"}),"battlefield",0);
 const last=s.players.ai.score;
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.cards.find(c=>c.name==="Ephemeral").zone,"battlefield");
 assert.equal(s.spellChain.items.at(-1).ability,"expire-temporary");
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
 assert.equal(s.cards.find(c=>c.name==="Ephemeral").zone,"trash");
 assert.equal(s.players.ai.score,last);
});
test("Trevor survives his own printed token keyword and creates a ready Sprite on Hold",()=>{
 let s=setup();
 s=add(s,card("Trevor Snoozebottom","Unit",{might:3,
  text:"[Shield] (+1 [S] while I'm a defender.)\nWhen I hold, play a ready 3 [S] Sprite unit token with [Temporary] here. (Kill it at the start of its controller's next Beginning Phase, before scoring.)"}),"battlefield",0);
 const find=(name)=>s.cards.find(c=>c.name===name);
 const end=()=>{s=applyCommand(s,{type:"next-turn"});};
 const resolve=()=>{s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});};
 end();end();
 assert.equal(find("Trevor Snoozebottom").zone,"battlefield");
 assert.equal(find("Sprite"),undefined);
 resolve();
 const firstSprite=find("Sprite");
 assert.equal(firstSprite.battlefield,0);
 assert.equal(firstSprite.might,3);
 assert.equal(firstSprite.exhausted,false);
 end();end();
 assert.equal(s.spellChain.items.at(-1).sourceUid,firstSprite.uid);
 resolve();
 assert.equal(find("Sprite"),undefined);
 resolve();
 assert.notEqual(find("Sprite").uid,firstSprite.uid);
 assert.equal(find("Trevor Snoozebottom").zone,"battlefield");
});
test("Vex, Apathetic stuns the played enemy after reactions and locks its movement through end of turn",()=>{
 let s=setup();
 s=add(s,card("Vex, Apathetic","Unit",{might:4,
  text:"[Deflect] (Opponents must pay [A] to choose me with a spell or ability.)\nWhen an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn. (It doesn't deal combat damage this turn.)"}),"battlefield",0);
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-physical",card:card("Newcomer","Unit",{text:"[Deflect]"})});
 const uid=s.cards.find(c=>c.name==="Newcomer").uid;
 const find=state=>state.cards.find(c=>c.uid===uid);
 assert.equal(s.spellChain.items.at(-1).targetUid,uid);
 assert.equal(find(s).stunned,undefined);
 const runes=s.players.ai.runeCount;
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
 assert.equal(find(s).stunned,true);
 assert.equal(s.players.ai.runeCount,runes);
 s=applyCommand(s,{type:"ready",uid});
 assert.throws(()=>applyCommand(s,{type:"move",uid,zone:"battlefield",battlefield:1}),/déplacement interdit/);
 assert.throws(()=>applyCommand(s,{type:"combat-attack",player:"human",uids:[uid],battlefield:0}),/déplacement interdit/);
 s=applyCommand(s,{type:"phase",phase:"Ending"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(find(s).counters.tempNoMoveBy,undefined);
 assert.equal(find(s).stunned,false);
});
test("Vision lets AI inspect its own deck without asking for a revealed opponent hand",()=>{
 let s=setup();
 s=add(s,card("Gemcraft Seer","Unit",{
  energy:1,text:"[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)"
 }));
 const before=s.decks.ai.main.length;
 s=play(s,"Gemcraft Seer");
 assert.equal(s.pendingEffects.length,0);
 s=resolveTop(s);
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
