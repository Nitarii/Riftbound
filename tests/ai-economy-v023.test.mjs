import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {planRunePayment,runeDomain} from "../rune-payment.mjs";
import {planAutonomousAITurn,describeAITurn} from "../ai-turn.mjs";
const card=(name,type="Unit",extra={})=>({name,type,...extra});
const rune=(domain)=>card(domain+" Rune","Rune",{domains:[domain]});
const fury=rune("Fury"),chaos=rune("Chaos");
function game({runes=[fury,chaos,fury,chaos,fury,chaos],main=[],first="ai"}={}){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champion","Unit"),battlefield:card("Star Spring","Battlefield"),
  main,runes,mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:first});
 return s;
}
function afterPlan(state){
 const plan=planAutonomousAITurn(state);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.length);
 let s=state;
 for(const command of plan.commands)s=applyCommand(s,command);
 assert.deepEqual(s.cards,plan.state.cards);
 assert.deepEqual(s.players,plan.state.players);
 return {state:s,plan};
}
test("rune domains are resolved from Riot card name, card domain or precon code",()=>{
 assert.equal(runeDomain(rune("Fury")),"Fury");
 assert.equal(runeDomain({code:"OGN-007",name:"Red resource",domains:[]}),"Fury");
 assert.equal(runeDomain({name:"Calm Rune",domains:[]}),"Calm");
 assert.equal(runeDomain({name:"Rune physique"}),null);
});
test("a single Rune exhausts for Energy and then recycles for Power in one paid play",()=>{
 let s=game();
 // Test exact two runes with known domains, avoiding a random opening deck order.
 s.cards.push({uid:"r1",owner:"ai",...fury,zone:"runes",exhausted:false,battlefield:null});
 s.cards.push({uid:"r2",owner:"ai",...chaos,zone:"runes",exhausted:false,battlefield:null});
 s.cards.push({uid:"unit1",owner:"ai",...card("Fury Soldier","Unit",{energy:2,power:1,
  domains:["Fury"],might:3}),zone:"hand",exhausted:false,battlefield:null});
 s.players.ai.handCount++;
 const expected=planRunePayment(s,"ai",s.cards.at(-1));
 assert.equal(expected.error,undefined);
 assert.equal(expected.energy,2);
 assert.equal(expected.power,1);
 assert.deepEqual(expected.exhaustUids.sort(),["r1","r2"].sort());
 assert.deepEqual(expected.recycleUids,["r1"]);
 s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"play-paid",uid:"unit1",zone:"base"});
 assert.equal(s.cards.find(c=>c.uid==="unit1").zone,"base");
 assert.equal(s.cards.find(c=>c.uid==="unit1").exhausted,true);
 assert.equal(s.cards.some(c=>c.uid==="r1"),false);
 assert.equal(s.cards.find(c=>c.uid==="r2").exhausted,true);
 assert.equal(s.decks.ai.runes.at(-1).name,"Fury Rune");
 assert.equal(s.players.ai.runeCount,s.decks.ai.runes.length);
 assert.match(s.message,/1 Power/);
 assert.match(s.message,/1 rune\(s\) recyclée/);
});
test("Power costs reject missing domain runes despite enough Energy",()=>{
 let s=game({runes:[chaos,chaos,chaos,chaos,chaos,chaos]});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:card("Fury spellcaster","Unit",{
  energy:1,power:1,domains:["Fury"],might:2})});
 const uid=s.cards.find(c=>c.name==="Fury spellcaster").uid;
 s=applyCommand(s,{type:"phase",phase:"Main"});
 assert.match(planRunePayment(s,"ai",s.cards.find(c=>c.uid===uid)).error,/Power insuffisant/);
 assert.throws(()=>applyCommand(s,{type:"play-paid",uid,zone:"base"}),/Power insuffisant/);
 assert.equal(s.cards.filter(c=>c.zone==="hand"&&c.owner==="ai"&&c.name==="Fury spellcaster").length,1);
});
test("a paid card cannot enter an unclaimed battlefield, bypass energy, or be replayed",()=>{
 let s=game({runes:[fury,fury,chaos]});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:card("Fury recruit","Unit",{
  energy:2,power:1,domains:["Fury"],might:2})});
 const uid=s.cards.find(c=>c.name==="Fury recruit").uid;
 s=applyCommand(s,{type:"phase",phase:"Main"});
 assert.throws(()=>applyCommand(s,{type:"play-paid",uid,zone:"battlefield",battlefield:0}),/déjà contrôlé/);
 s=applyCommand(s,{type:"play-paid",uid,zone:"base"});
 assert.throws(()=>applyCommand(s,{type:"play-paid",uid,zone:"base"}),/depuis cette zone/);
});
test("autonomous AI develops units, pays Power and moves ready units to conquer on later turns",()=>{
 let s=game({runes:[fury,fury,fury,fury,fury,fury],main:[
  card("Fury Soldier","Unit",{energy:2,power:1,domains:["Fury"],might:3}),
  card("Other", "Unit",{energy:1,power:0,domains:["Chaos"],might:1})
 ]});
 // Guarantee a deterministic hand card with known costs regardless of shuffle.
 const toPlay=s.cards.filter(c=>c.zone==="hand"&&c.owner==="ai");
 assert.ok(toPlay.length>=1);
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:card("Fury Soldier","Unit",{
  energy:2,power:1,domains:["Fury"],might:3})});
 const one=afterPlan(s);
 assert.equal(one.state.active,"human");
 assert.ok(one.plan.commands.some(c=>c.type==="play-paid"));
 assert.equal(one.state.cards.some(c=>c.name==="Fury Soldier"&&c.zone==="base"),true);
 assert.equal(one.state.decks.ai.runes.length>0,true);
 assert.match(describeAITurn(one.plan),/Power/);
 s=applyCommand(one.state,{type:"next-turn"});
 const two=afterPlan(s);
 assert.ok(two.plan.commands.some(c=>c.type==="move"&&c.zone==="battlefield"));
 assert.ok(two.state.players.ai.score>=1,"AI Conquer should grant victory point");
 assert.equal(two.state.cards.some(c=>c.zone==="battlefield"&&c.owner==="ai"),true);
 assert.match(describeAITurn(two.plan),/PV/);
 // Holding an uncontested field on a later turn scores again.
 const holding=applyCommand(two.state,{type:"next-turn"});
 assert.ok(holding.players.ai.score>=2,"Hold should score on next AI Beginning");
});
test("AI never creates cards or pays unknown Power and does not declare a fake victory",()=>{
 let s=game({runes:[chaos,chaos,chaos],main:[]});
 s=applyCommand(s,{type:"add",player:"ai",zone:"hand",card:card("Fury creature","Unit",{
  energy:1,power:1,domains:["Fury"],might:2})});
 const result=afterPlan(s);
 assert.equal(result.plan.commands.some(c=>c.type==="play-paid"),false);
 assert.equal(result.state.players.ai.score,0);
 assert.equal(result.state.cards.some(c=>c.zone==="hand"&&c.name==="Fury creature"),true);
});
test("AI prefers new unclaimed battlefield over reinforcing an already controlled one",()=>{
 let s=game();
 for(const name of ["One","Two"]){
  s=applyCommand(s,{type:"add",player:"ai",zone:"base",card:card(name,"Unit",{energy:1,power:0})});
 }
 const plan=afterPlan(s);
 const units=plan.state.cards.filter(c=>["One","Two"].includes(c.name));
 assert.deepEqual(units.map(c=>c.battlefield).sort(),[0,1]);
 assert.equal(plan.state.players.ai.score,2);
});
