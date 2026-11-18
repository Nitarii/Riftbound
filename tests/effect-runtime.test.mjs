import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {passShowdown} from "./showdown-helper.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";
import {planPlayerSequence} from "../player-sequence.mjs";
import {planAutonomousAITurn,planAIChainAction} from "../ai-turn.mjs";
import {spellRule,compileCardAbilities} from "../effect-engine.mjs";
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
test("ordinary spell opens reactions before resolving printed instructions and going to trash",()=>{
 let s=setup();
 s=add(s,card("Quick Study","Spell",{energy:1,text:"[Action]\nDraw 2."}));
 const before=s.players.ai.deckCount;
 const uid=s.cards.find(c=>c.name==="Quick Study").uid;
 assert.throws(()=>play(s,"Quick Study"),/réactions/);
 s=applyCommand(s,{type:"cast",player:"ai",uid});
 assert.equal(s.cards.find(c=>c.uid===uid).zone,"chain");
 assert.equal(s.players.ai.deckCount,before);
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
 assert.equal(s.cards.find(c=>c.name==="Quick Study").zone,"trash");
 assert.equal(s.players.ai.deckCount,before-2);
});
const passChain=(s,player=s.spellChain.priority)=>applyCommand(s,{type:"chain-pass",player});
const putHuman=(s,value,zone,battlefield)=>applyCommand(s,{type:"add",player:"human",card:value,zone,battlefield});
const fury=card("Fury Rune","Rune",{domains:["Fury"]});
const calm=card("Calm Rune","Rune",{domains:["Calm"]});
const voidSeeker=card("Void Seeker","Spell",{code:"OGN-024",energy:3,power:1,domains:["Fury"],
 text:"[Action] (Play on your turn or in showdowns.)\nDeal 4 to a unit at a battlefield. Draw 1."});
const lunar=card("Lunar Boon","Spell",{code:"UNL-125",energy:3,domains:["Chaos"],
 text:"[Reaction] (Play any time, even before spells and abilities resolve.)\nDiscard 1, then draw 2."});
test("Jinx can play Void Seeker through the chain with a battlefield target and a subsequent draw",()=>{
 let s=add(add(setup(),voidSeeker),fury,"runes");
 s=putHuman(s,card("Base Unit"),"base");
 s=putHuman(s,card("Field Defender","Unit",{might:4}),"battlefield",0);
 const spell=s.cards.find(c=>c.code===voidSeeker.code);
 const base=s.cards.find(c=>c.name==="Base Unit"),defender=s.cards.find(c=>c.name==="Field Defender");
 const command={type:"cast",player:"ai",uid:spell.uid,targetUid:defender.uid};
 assert.throws(()=>applyCommand(s,{...command,targetUid:base.uid}),/pas légal/);
 assert.deepEqual(planAutonomousAITurn(s).commands[0],command);
 const {deckCount,runeCount}=s.players.ai;
 s=passChain(applyCommand(s,command));
 assert.equal(s.spellChain.priority,"human");
 assert.equal(s.cards.find(c=>c.uid===spell.uid).zone,"chain");
 assert.equal(s.cards.find(c=>c.uid===defender.uid).damage,0);
 assert.equal(s.players.ai.deckCount,deckCount);
 assert.equal(s.players.ai.runeCount,runeCount+1);
 s=passChain(s);
 assert.equal(s.cards.find(c=>c.uid===defender.uid).zone,"trash");
 assert.equal(s.cards.find(c=>c.uid===spell.uid).zone,"trash");
 assert.equal(s.players.ai.deckCount,deckCount-1);
});
test("Void Seeker cannot recycle itself or its lethal friendly target during its draw",()=>{
 let s=add(add(setup(),voidSeeker),fury,"runes");
 s=applyCommand(s,{type:"add",player:"ai",card:card("Friendly Unit","Unit",{might:3}),zone:"battlefield",battlefield:0});
 s=add(s,card("Recyclable Unit"),"trash");
 s.decks.ai.main=[];s.players.ai.deckCount=0;
 const spell=s.cards.find(c=>c.code===voidSeeker.code),target=s.cards.find(c=>c.name==="Friendly Unit");
 const humanScore=s.players.human.score;
 s=passChain(passChain(applyCommand(s,{type:"cast",player:"ai",uid:spell.uid,targetUid:target.uid})));
 assert.equal(s.cards.find(c=>c.uid===spell.uid).zone,"trash");
 assert.equal(s.cards.find(c=>c.uid===target.uid).zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Recyclable Unit").zone,"hand");
 assert.equal(s.players.ai.deckCount,0);
 assert.equal(s.players.human.score,humanScore+1);
});
test("a Reaction can raise Soul Harvest's target above its printed limit before resolution",()=>{
 const harvest=card("Soul Harvest","Spell",{code:"UNL-159",energy:2,power:1,domains:["Order"],
  text:"Kill a unit at a battlefield with 3 [S] or less."});
 const discipline=card("Discipline","Spell",{code:"OGN-058",energy:2,domains:["Calm"]});
 let s=add(add(setup(),harvest),card("Order Rune","Rune",{domains:["Order"]}),"runes");
 s=putHuman(putHuman(s,calm,"runes"),calm,"runes");
 s=putHuman(s,card("Shen Unit","Unit",{might:3}),"battlefield",0);
 const target=s.cards.find(c=>c.name==="Shen Unit");
 const launch={type:"cast",player:"ai",uid:s.cards.find(c=>c.code===harvest.code).uid,targetUid:target.uid};
 s=passChain(applyCommand(s,launch));
 const response=planPlayerSequence("Je joue Discipline sur Shen Unit.",s,[discipline]);
 assert.ok(!response.error,response.error);
 s=passChain(passChain(response.commands.reduce(applyCommand,s)));
 assert.equal(s.spellChain.priority,"ai");
 assert.equal(s.cards.find(c=>c.uid===target.uid).counters.tempMight,2);
 s=passChain(passChain(s));
 assert.equal(s.cards.find(c=>c.uid===target.uid).zone,"battlefield");
 assert.match(s.message,/cible devenue invalide/);
});
test("Lunar Boon asks only for the physical discard after both passes and then draws exactly twice",()=>{
 let s=applyCommand(setup(),{type:"next-turn"});
 s=applyCommand(s,{type:"phase",phase:"Main"});
 for(let i=0;i<3;i++)s=putHuman(s,calm,"runes");
 const discarded=card("Loyal Poro","Unit",{code:"UNL-156"});
 const speech=planPlayerSequence("Je lance Lunar Boon.",s,[lunar]);
 assert.ok(!speech.error,speech.error);
 assert.deepEqual(speech.commands,[{type:"cast",player:"human",card:lunar}]);
 const {deckCount,handCount}=s.players.human;
 s=passChain(speech.commands.reduce(applyCommand,s));
 assert.deepEqual(s.pendingEffects,[]);
 assert.equal(s.players.human.handCount,handCount-1);
 s=passChain(s);
 assert.equal(s.pendingEffects[0].trigger,"spell-discard");
 assert.equal(s.players.human.deckCount,deckCount);
 const confirm=planPlayerSequence("Je défausse Loyal Poro et je pioche.",s,[discarded]);
 assert.equal(confirm.commands[0].type,"effect-confirm");
 s=confirm.commands.reduce(applyCommand,s);
 assert.equal(s.spellChain,null);
 assert.equal(s.players.human.deckCount,deckCount-2);
 assert.equal(s.players.human.handCount,handCount);
 assert.equal(s.cards.find(c=>c.name===discarded.name).zone,"trash");
 assert.ok(planPlayerSequence("Je défausse Loyal Poro et je pioche.",s,[discarded]).error);
});
test("targetless Hidden and Flow use their printed costs and the right final zones",()=>{
 const consult=card("Consult the Past","Spell",{code:"OGN-083",energy:4,domains:["Mind"],
  text:"[Hidden] (Hide now for [A] to react with later for [0].)\n[Reaction]\nDraw 2."});
 const dredge=card("Dredge Up","Spell",{code:"VEN-049",energy:2,domains:["Mind"],
  text:"Draw 1.\n[Flow] [2] (You may play this from your trash for its Flow cost. Then banish it.)"});
 let s=applyCommand(applyCommand(setup(),{type:"next-turn"}),{type:"phase",phase:"Main"});
 s=putHuman(putHuman(s,card("Guard"),"battlefield",0),calm,"runes");
 s=applyCommand(s,{type:"hide",player:"human",battlefield:0});
 const hidden=s.cards.find(c=>c.zone==="hidden");
 assert.equal(hidden.name,"Carte cachée");
 s=applyCommand(applyCommand(applyCommand(s,{type:"next-turn"}),{type:"next-turn"}),{type:"phase",phase:"Main"});
 const announce=planPlayerSequence("Je révèle Consult the Past au Grove.",s,[consult]);
 assert.ok(!announce.error,announce.error);
 const {deckCount,runeCount}=s.players.human;
 s=announce.commands.reduce(applyCommand,s);
 assert.equal(s.cards.find(c=>c.uid===hidden.uid).zone,"chain");
 s=passChain(passChain(s));
 assert.equal(s.cards.find(c=>c.uid===hidden.uid).zone,"trash");
 assert.equal(s.players.human.deckCount,deckCount-2);
 assert.equal(s.players.human.runeCount,runeCount);
 s=putHuman(putHuman(putHuman(s,dredge,"trash"),calm,"runes"),calm,"runes");
 const flow=planPlayerSequence("Je joue Dredge Up par Flux.",s,[dredge]);
 assert.ok(!flow.error,flow.error);
 s=passChain(passChain(flow.commands.reduce(applyCommand,s)));
 assert.equal(s.cards.find(c=>c.name===dredge.name).zone,"banished");
 assert.equal(s.players.human.deckCount,deckCount-3);
});
test("the AI uses Rune Prison when stun saves its defender",()=>{
 const prison=card("Rune Prison","Spell",{code:"OGN-050",energy:2,power:1,domains:["Calm"],
  text:"[Action] (Play on your turn or in showdowns.)\nStun a unit. (It doesn't deal combat damage this turn.)"});
 let s=add(add(setup(),prison),calm,"runes");
 s=add(s,card("Defender","Unit",{might:4}),"base");
 const defender=s.cards.find(c=>c.name==="Defender");
 s=applyCommand(s,{type:"move",uid:defender.uid,zone:"battlefield",battlefield:0});
 s=passShowdown(s);
 s=applyCommand(applyCommand(s,{type:"next-turn"}),{type:"phase",phase:"Main"});
 s=putHuman(s,card("Attacker","Unit",{might:6}),"base");
 const attacker=s.cards.find(c=>c.name==="Attacker");
 s=applyCommand(s,{type:"combat-attack",player:"human",uids:[attacker.uid],battlefield:0});
 s=applyCommand(s,{type:"combat-pass",player:"human"});
 const selected=planAIChainAction(s);
 assert.equal(selected.type,"cast");
 assert.equal(selected.targetUid,attacker.uid);
 s=passChain(passChain(applyCommand(s,selected)));
 assert.equal(s.cards.find(c=>c.uid===attacker.uid).stunned,true);
});
test("incomplete gallery text cannot play official multi-target errata as a single hit",()=>{
 for(const [name,code,damage] of [["Falling Star","ogn-029-298",3],["Icathian Rain, Kai'Sa","ogn-248-298",2]]){
  const oldText=card(name,"Spell",{code,text:"Deal "+damage+" to a unit."});
  const s=add(setup(),oldText);
  assert.equal(spellRule(oldText),null);
  assert.match(compileCardAbilities(oldText).unsupported[0].reason,/Cibles multiples/);
  assert.throws(()=>applyCommand(s,{type:"cast",player:"ai",uid:s.cards.find(c=>c.code===code).uid}),/non pris en charge/);
 }
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
 assert.equal(s.players.ai.score,0);
 assert.equal(s.players.ai.deckCount,before);
 s=passShowdown(s);
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
 assert.equal(s.cards.find(c=>c.name==="Fast Unit").exhausted,true,JSON.stringify(s.cards.find(c=>c.name==="Fast Unit")));
 let b=setup();b=add(b,unit);
 b=play(b,"Fast Unit",{accelerate:true});
 assert.equal(b.cards.find(c=>c.name==="Fast Unit").exhausted,false);
 // The extra Power rune is recycled back under the rune deck, so only one
 // of the two Energy runes remains on the board as exhausted.
 assert.equal(b.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length,1);
 assert.equal(b.cards.filter(c=>c.owner==="ai"&&c.zone==="runes").length,2);
 assert.equal(b.decks.ai.runes.length,s.decks.ai.runes.length+1);
});
test("remaining trigger prevents automatic upkeep from advancing during unresolved phase",()=>{
 let s=setup();s=add(s,card("Unclear","Unit",{
  text:"At the end of your turn, choose a card in your trash. Return it to your hand."}),"base");
 s=applyCommand(s,{type:"phase",phase:"Ending"});
 assert.equal(s.pendingEffects.length,1);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/en attente/);
 assert.equal(advanceMandatoryTurn(s).revision,s.revision);
});

test("unrecognized passive/activated gear text is never silently skipped",()=>{
 let s=setup();
 s=add(s,card("Protective Gear","Gear",{energy:1,
  text:"Friendly buffed units have [Deflect]."}));
 s=play(s,"Protective Gear");
 assert.equal(s.pendingEffects.length,1);
 assert.match(s.pendingEffects[0].text,/Deflect/);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/en attente/);
});
test("a continuous ally play trigger on a different in-play card is recognized",()=>{
 let s=setup();
 s=add(s,card("Watcher","Unit",{
  text:"When you play a unit, draw 1."}),"base");
 s=add(s,card("New Ally","Unit",{energy:1}));
 const before=s.players.ai.deckCount;
 s=play(s,"New Ally");
 assert.equal(s.players.ai.deckCount,before-1);
 assert.match(s.message,/Watcher/);
});

test("card effects fire on real attack and defense, not only on play",()=>{
 let s=setup();
 s=add(s,card("Attacking Scout","Unit",{might:2,
  text:"When I attack, draw 1."}),"base");
 s=applyCommand(s,{type:"add",player:"human",zone:"battlefield",battlefield:0,
  card:card("Defender","Unit",{might:2,text:"When I defend, draw 1."})});
 const beforeAI=s.players.ai.deckCount,beforeHuman=s.players.human.handCount;
 const attacker=s.cards.find(c=>c.name==="Attacking Scout");
 s=applyCommand(s,{type:"combat-attack",player:"ai",uids:[attacker.uid],battlefield:0});
 assert.ok(s.pendingCombat);
 assert.equal(s.players.ai.deckCount,beforeAI-1);
 assert.equal(s.players.human.handCount,beforeHuman+1);
});
