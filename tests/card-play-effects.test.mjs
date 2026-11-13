import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {mandatoryPlayEffects,chooseRequiredDiscards} from "../play-effects.mjs";
import {planAutonomousAITurn} from "../ai-turn.mjs";
import {effectiveMight} from "../combat-engine.mjs";
const card=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:1,...extra});
const chem=card("Chemtech Enforcer","Unit",{energy:2,might:2,text:"[Assault 2] (+2 while I'm an attacker.)\nWhen you play me, discard 1."});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champion"),battlefield:card("Arena","Battlefield"),
  main:[],runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:chem});
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:card("Spare unit","Unit",{energy:5,might:1})});
 return s;
}
test("Chemtech Enforcer requires an exact one-card discard on play",()=>{
 assert.deepEqual(mandatoryPlayEffects(chem),{supported:true,discard:1,reason:""});
 const state=setup();
 const uid=state.cards.find(c=>c.name==="Chemtech Enforcer").uid;
 const spare=state.cards.find(c=>c.name==="Spare unit").uid;
 assert.throws(()=>applyCommand(state,{type:"play-paid",uid,zone:"base"}),/défausse obligatoire/);
 const played=applyCommand(state,{type:"play-paid",uid,zone:"base",discardUids:[spare]});
 assert.equal(played.cards.find(c=>c.uid===uid).zone,"base");
 assert.equal(played.cards.find(c=>c.uid===spare).zone,"trash");
 assert.equal(played.cards.filter(c=>c.owner==="ai"&&c.zone==="runes"&&c.exhausted).length,2);
 assert.match(played.message,/effet : défaussé Spare unit/);
 assert.equal(played.players.ai.handCount,state.players.ai.handCount-2);
 assert.equal(state.cards.find(c=>c.uid===spare).zone,"hand","original state remains unchanged");
});
test("autonomous AI selects a discard from its own remaining hand in the same atomic command",()=>{
 const state=setup(),plan=planAutonomousAITurn(state);
 assert.equal(plan.error,undefined,plan.error);
 const play=plan.commands.find(x=>x.type==="play-paid"&&
  state.cards.find(c=>c.uid===x.uid)?.name==="Chemtech Enforcer");
 assert.ok(play,"AI must choose the playable Chemtech Enforcer");
 assert.equal(play.discardUids.length,1);
 assert.equal(state.cards.find(c=>c.uid===play.discardUids[0]).name,"Spare unit");
 let actual=state;
 for(const command of plan.commands)actual=applyCommand(actual,command);
 assert.equal(actual.cards.find(c=>c.uid===play.discardUids[0]).zone,"trash");
 assert.match(plan.enacted.join(" "),/défaussé Spare unit/);
});
test("unhandled on-play effects fail closed; AI never plays the card by ignoring them",()=>{
 const unknown=card("Mystery","Unit",{energy:1,text:"When you play me, deal 3 damage to an enemy."});
 assert.equal(mandatoryPlayEffects(unknown).supported,true);
 let state=setup();
 state=applyCommand(state,{type:"add",player:"ai",zone:"hand",card:unknown});
 const uid=state.cards.find(c=>c.name==="Mystery").uid;
 const next=applyCommand(state,{type:"play-paid",uid,zone:"base"});
 assert.equal(next.cards.find(c=>c.uid===uid).zone,"base");
 assert.equal(next.pendingEffects.length,1,"the missing enemy target must be visible to the player");
 assert.match(next.pendingEffects[0].reason,/Cible ennemie absente/);
 assert.throws(()=>applyCommand(next,{type:"next-turn"}),/Effet de carte en attente/);
 assert.equal(chooseRequiredDiscards(state,uid,99),null);
});
test("discard UID must belong to AI hand and cannot discard another player's hidden card",()=>{
 const state=setup(),uid=state.cards.find(c=>c.name==="Chemtech Enforcer").uid;
 assert.throws(()=>applyCommand(state,{type:"play-paid",uid,discardUids:["invalid"]}),/Carte absente/);
 const sameUid=[uid];
 assert.throws(()=>applyCommand(state,{type:"play-paid",uid,discardUids:sameUid}),/main de l'IA/);
});
test("no spare hand card means the AI refuses the mandatory-discard unit",()=>{
 let state=setup();
 state.cards=state.cards.filter(c=>c.name!=="Spare unit");
 state.players.ai.handCount--;
 const plan=planAutonomousAITurn(state);
 assert.equal(plan.commands.some(x=>x.type==="play-paid"&&
  state.cards.find(c=>c.uid===x.uid)?.name==="Chemtech Enforcer"),false);
});

test("bracketed Assault 2 gives Chemtech Enforcer +2 Might when attacking only",()=>{
 assert.equal(effectiveMight(chem,"attack"),4);
 assert.equal(effectiveMight(chem,"defend"),2);
 assert.equal(effectiveMight(card("Wall","Unit",{might:3,text:"[Shield 1]"}),"defend"),4);
});
