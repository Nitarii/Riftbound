import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {planHumanAnnouncement} from "../player-actions.mjs";
import {planAIChainAction} from "../ai-turn.mjs";
const card=(name,type="Unit",extra={})=>({code:name,name,type,energy:0,power:0,might:3,...extra});
const get=(s,name)=>s.cards.find(c=>c.name===name);
const add=(s,c,owner="ai",zone="base",battlefield)=>applyCommand(s,{type:"add",player:owner,card:c,zone,battlefield});
const play=(s,name,extra={})=>applyCommand(s,{type:"play-paid",uid:get(s,name).uid,zone:"base",...extra});
const pass=s=>applyCommand(s,{type:"chain-pass",player:s.spellChain.priority});
const resolve=s=>pass(pass(s));
function table(){
 let s=createState();
 for(const command of [
  {type:"setup-human",legend:card("Shen","Legend"),champion:card("Shen Chosen"),battlefield:card("Grove","Battlefield")},
  {type:"setup-ai",legend:card("Jinx","Legend"),champion:card("Jinx Chosen"),battlefield:card("Arena","Battlefield"),
   main:Array.from({length:20},(_,i)=>card("Deck "+i)),runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),mainIncludesChampion:false},
  {type:"start",player:"ai"},{type:"channel",player:"ai",count:2},{type:"phase",phase:"Main"}
 ])s=applyCommand(s,command);
 return s;
}
const stunner=card("Solari Shieldbearer","Unit",{text:"When you play me, stun a unit."});

test("generic stun chooses and pays before responses, then survives its source's death",()=>{
 let s=add(table(),card("Protected","Unit",{text:"[Deflect]"}),"human");
 s=add(s,stunner,"ai","hand");
 const before=s.players.ai.runeCount;
 s=play(s,stunner.name,{targetUid:get(s,"Protected").uid});
 assert.equal(s.players.ai.runeCount,before+1);
 assert.equal(Boolean(get(s,"Protected").stunned),false);
 assert.equal(s.spellChain.items.at(-1).ability,"card-text");
 s=pass(s);
 s=applyCommand(s,{type:"cast",player:"human",card:card("Reaction Hit","Spell",{text:"[Reaction]\nDeal 3 to a unit."}),targetUid:get(s,stunner.name).uid});
 s=resolve(s);
 assert.equal(get(s,stunner.name).zone,"trash");
 assert.equal(Boolean(get(s,"Protected").stunned),false);
 s=resolve(JSON.parse(JSON.stringify(s)));
 assert.equal(get(s,"Protected").stunned,true);
 assert.equal(s.players.ai.runeCount,before+1);
});

test("an invalidated target is skipped while the subsequent draw still resolves",()=>{
 let s=add(table(),card("Enemy"),"human");
 s=add(s,card("Stun and Study","Unit",{text:"When you play me, stun an enemy unit, then draw 1."}),"ai","hand");
 s=play(s,"Stun and Study");
 const before=s.players.ai.handCount;
 s=pass(s);
 s=applyCommand(s,{type:"cast",player:"human",card:card("Reaction Hit","Spell",{text:"[Reaction]\nDeal 3 to a unit."}),targetUid:get(s,"Enemy").uid});
 s=resolve(s);
 s=resolve(s);
 assert.equal(get(s,"Enemy").zone,"trash");
 assert.equal(Boolean(get(s,"Enemy").stunned),false);
 assert.equal(s.players.ai.handCount,before+1);
});

test("physical targeting is chosen before reactions and mandatory effects cannot be declined",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=add(s,card("Protected","Unit",{text:"[Deflect 2]"}));
 for(let i=0;i<2;i++)s=add(s,card("Calm Rune","Rune",{domains:["Calm"]}),"human","runes");
 s=applyCommand(s,{type:"play-physical",card:stunner});
 assert.equal(s.pendingEffects[0].trigger,"ability-target");
 assert.equal(s.spellChain,null);
 const pending=s.pendingEffects[0];
 assert.throws(()=>applyCommand(s,{type:"effect-confirm",id:pending.id,confirm:true,decline:true}),/obligatoire/);
 const plan=planHumanAnnouncement("Je cible Protected",s,[]);
 assert.equal(plan.commands[0].targetUid,get(s,"Protected").uid);
 s=plan.commands.reduce(applyCommand,s);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,0);
 assert.equal(Boolean(get(s,"Protected").stunned),false);
 s=resolve(s);
 assert.equal(get(s,"Protected").stunned,true);
});

test("an optional physical draw is accepted or declined before its response window",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-physical",card:card("Optional Scribe","Unit",{text:"When you play me, you may draw 1."})});
 const pending=s.pendingEffects[0],before=s.players.human.handCount;
 const declined=applyCommand(s,{type:"effect-confirm",id:pending.id,confirm:true,decline:true});
 assert.equal(declined.spellChain,null);assert.equal(declined.players.human.handCount,before);
 s=applyCommand(s,{type:"effect-confirm",id:pending.id,confirm:true});
 assert.equal(s.players.human.handCount,before);
 s=resolve(s);assert.equal(s.players.human.handCount,before+1);
});

test("AI discards from its hand at resolution, and an empty hand does not prohibit playing",()=>{
 let s=table();s.cards=s.cards.filter(c=>c.zone!=="hand");s.players.ai.handCount=0;
 s=add(s,card("Chemtech Enforcer","Unit",{text:"When you play me, discard 1."}),"ai","hand");
 s=play(s,"Chemtech Enforcer");
 assert.equal(s.players.ai.handCount,0);
 s=pass(s);
 s=applyCommand(s,{type:"cast",player:"human",card:card("Draw Response","Spell",{text:"[Reaction]\nDraw 1."})});
 s=resolve(s); // The human draw cannot become an AI discard.
 s=resolve(s);
 assert.equal(s.players.ai.handCount,0);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(get(s,"Chemtech Enforcer").zone,"base");
});

test("a compound physical resolution resumes after each public discard without replaying its draw",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-physical",card:card("Student","Unit",{text:"When you play me, draw 1, then discard 2, then draw 1."})});
 const before=s.players.human.handCount;
 s=resolve(s);
 assert.equal(s.players.human.handCount,before+1);
 assert.equal(s.pendingEffects[0].trigger,"card-text-discard");
 assert.equal(s.spellChain.items.at(-1).cursor,1);
 const publicCard=card("Revealed Discard");
 const announce=planHumanAnnouncement("Je défausse Revealed Discard",s,[publicCard]);
 assert.equal(announce.commands[0]?.type,"effect-confirm",JSON.stringify(announce));
 s=announce.commands.reduce(applyCommand,s);
 assert.equal(s.players.human.handCount,before);
 assert.equal(s.pendingEffects[0].trigger,"card-text-discard");
 s=JSON.parse(JSON.stringify(s));
 assert.throws(()=>applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,card:card("Bad","Legend")}),/physique/);
 s=applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,card:card("Second Discard")});
 assert.equal(s.players.human.handCount,before);
 assert.equal(s.spellChain,null);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="trash").length,2);
});

test("physical Vision asks only keep or recycle after both passes, and resumes after saving",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-physical",card:card("Seer","Unit",{text:"[Vision] (When you play me, look at the top card of your deck. You may recycle it.)"})});
 assert.equal(s.pendingEffects.length,0);
 s=resolve(s);
 assert.equal(s.pendingEffects[0].trigger,"card-text-predict");
 s=JSON.parse(JSON.stringify(s));
 const before=s.players.human.deckCount;
 const plan=planHumanAnnouncement("Je la recycle",s,[]);
 assert.equal(plan.commands[0].recycle,true);
 s=plan.commands.reduce(applyCommand,s);
 assert.equal(s.players.human.deckCount,before);
 assert.equal(s.spellChain,null);
 assert.match(s.message,/Vision : carte recyclée/);
});

test("physical Burn completes its reveal before a later draw and never burns twice",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-physical",card:card("Burning Scribe","Unit",{text:"When you play me, [Burn 1], then draw 1."})});
 const before=s.players.human.handCount,deck=s.players.human.deckCount;
 s=resolve(s);
 assert.equal(s.pendingEffects[0].trigger,"burn");
 assert.equal(s.players.human.handCount,before);
 s=applyCommand(JSON.parse(JSON.stringify(s)),{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,card:card("Burned Card")});
 assert.equal(s.players.human.handCount,before+1);
 assert.equal(s.players.human.deckCount,deck-2);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.spellChain,null);
});

test("a response can prevent generic ability damage and the AI sees its threatened target",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 s=add(s,card("Defender","Unit",{might:2}));
 s=add(s,card("Order Rune","Rune",{domains:["Order"]}),"ai","runes");
 s=add(s,card("Ki Barrier","Spell",{code:"VEN-126",energy:2,power:1,domains:["Order"]}),"ai","hand");
 s=applyCommand(s,{type:"play-physical",card:card("Blaster","Unit",{text:"When you play me, deal 2 damage to an enemy unit."}),targetUid:get(s,"Defender").uid});
 s=pass(s);
 const reaction=planAIChainAction(s);
 assert.equal(reaction.type,"cast");
 assert.equal(reaction.uid,get(s,"Ki Barrier").uid);
 s=resolve(applyCommand(s,reaction));
 s=resolve(s);
 assert.equal(get(s,"Defender").zone,"base");
 assert.equal(get(s,"Defender").damage,0);
 assert.equal(get(s,"Defender").counters.preventDamage,5);
});

test("generic damage uses the defending Shield bonus during the response chain",()=>{
 let s=add(table(),card("Attacker"));
 s=add(s,card("Defender","Unit",{might:2,text:"[Shield 3]"}),"human","battlefield",0);
 // A watcher on attack opens a generic damage ability while Shield is active.
 s=applyCommand(s,{type:"remove",uid:get(s,"Attacker").uid});
 s=add(s,card("Attacker","Unit",{text:"When I attack, deal 3 damage to an enemy unit."}));
 s=applyCommand(s,{type:"combat-attack",player:"ai",uids:[get(s,"Attacker").uid],battlefield:0});
 s=resolve(s);
 assert.equal(get(s,"Defender").zone,"battlefield");
 assert.equal(get(s,"Defender").damage,3);
 assert.ok(s.pendingCombat);
});

test("next-turn resolves ordinary Ending triggers before changing the active player",()=>{
 let s=add(table(),card("End Scribe","Unit",{text:"At the end of your turn, draw 1."}));
 const before=s.players.ai.handCount;
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.active,"ai");assert.equal(s.phase,"Ending");
 assert.equal(s.players.ai.handCount,before);
 s=resolve(JSON.parse(JSON.stringify(s)));
 assert.equal(s.players.ai.handCount,before+1);
 assert.equal(s.active,"human");
 assert.equal(s.phase,"Beginning");
 assert.equal(s.spellChain,null);
});

test("a generic token creation triggers an allied watcher after the current ability resolves",()=>{
 let s=add(table(),card("Watcher","Unit",{text:"When you play a unit, draw 1."}));
 s=add(s,card("Maker","Unit",{text:"When I die, play a 1 [S] Recruit unit token here."}));
 const before=s.players.ai.handCount;
 s=applyCommand(s,{type:"damage",uid:get(s,"Maker").uid,value:3});
 assert.equal(get(s,"Recruit"),undefined);
 s=resolve(s);
 assert.equal(get(s,"Recruit").zone,"base");
 assert.equal(s.players.ai.handCount,before);
 assert.equal(s.spellChain.items.at(-1).cardName,"Watcher");
 s=resolve(s);
 assert.equal(s.players.ai.handCount,before+1);
});

test("two generic physical targets are finalized and paid together before any effect",()=>{
 let s=applyCommand(table(),{type:"next-turn"});s=applyCommand(s,{type:"phase",phase:"Main"});
 for(const name of ["First Enemy","Second Enemy"])s=add(s,card(name,"Unit",{text:"[Deflect]"}));
 for(let i=0;i<2;i++)s=add(s,card("Chaos Rune","Rune",{domains:["Chaos"]}),"human","runes");
 s=applyCommand(s,{type:"play-physical",card:card("Twin Stunner","Unit",{text:"When you play me, stun an enemy unit, then stun an enemy unit."})});
 s=applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,targetUid:get(s,"First Enemy").uid});
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,2);
 assert.equal(s.pendingEffects[0].trigger,"ability-target");
 s=applyCommand(JSON.parse(JSON.stringify(s)),{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,targetUid:get(s,"Second Enemy").uid});
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,0);
 assert.equal(Boolean(get(s,"First Enemy").stunned),false);
 s=resolve(s);
 assert.equal(get(s,"First Enemy").stunned,true);
 assert.equal(get(s,"Second Enemy").stunned,true);
});
