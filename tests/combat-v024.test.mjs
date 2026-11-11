import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {previewCombat,assignDamage,effectiveMight,combatPriority} from "../combat-engine.mjs";
import {planAutonomousAITurn} from "../ai-turn.mjs";
import {planPlayerSequence} from "../player-sequence.mjs";
const card=(name,might=2,text="")=>({name,type:"Unit",might,energy:1,power:0,text,domains:[]});
const legend=name=>({name,type:"Legend"}),field=name=>({name,type:"Battlefield"});
function setup(active="ai"){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:legend("Shen"),
  champion:card("Chosen Shen"),battlefield:field("Grove")});
 s=applyCommand(s,{type:"setup-ai",legend:legend("Jinx"),
  champion:card("Chosen Jinx"),battlefield:field("Star Spring"),
  main:[],runes:[],mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:active});
 s=applyCommand(s,{type:"phase",phase:"Main"});
 return s;
}
function add(s,name,owner,might,zone="base",battlefield=0,text=""){
 return applyCommand(s,{type:"add",player:owner,card:card(name,might,text),
  zone,battlefield});
}
const uid=(s,name)=>s.cards.find(x=>x.name===name)?.uid;
const attack=(s,player,index,units)=>applyCommand(s,{type:"combat-attack",player,battlefield:index,uids:units.map(n=>uid(s,n))});
const pass=s=>applyCommand(s,{type:"combat-pass",player:"human"});
test("basic attack enters showdown, deals simultaneous damage, kills defender, heals attacker, scores 1",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",3);
 s=add(s,"Defender","human",2,"battlefield",0);
 s=attack(s,"ai",0,["Attacker"]);
 assert.equal(s.players.ai.score,0);
 assert.equal(s.pendingCombat?.passes.ai,true);
 assert.equal(s.pendingCombat?.passes.human,false);
 assert.equal(s.cards.find(c=>c.name==="Attacker").exhausted,true);
 assert.throws(()=>applyCommand(s,{type:"next-turn"}),/Combat en cours/);
 const prediction=previewCombat(s,0,"ai");
 assert.equal(prediction.attackingMight,3);
 assert.equal(prediction.defendingMight,2);
 assert.deepEqual(prediction.dead,[uid(s,"Defender")]);
 s=pass(s);
 assert.equal(s.pendingCombat,null);
 assert.equal(s.cards.find(c=>c.name==="Defender").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Attacker").zone,"battlefield");
 assert.equal(s.cards.find(c=>c.name==="Attacker").damage,0);
 assert.equal(s.players.ai.score,1);
 assert.match(s.message,/Combat Grove/);
});
test("equal-Might units both deal damage simultaneously; both die and no point is awarded",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",2);
 s=add(s,"Defender","human",2,"battlefield",0);
 s=pass(attack(s,"ai",0,["Attacker"]));
 assert.equal(s.cards.find(c=>c.name==="Attacker").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Defender").zone,"trash");
 assert.equal(s.players.ai.score,0);
 assert.equal(s.players.human.score,0);
});
test("failed attack kills attacker and preserves defender, healing all board units",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",2);
 s=add(s,"Defender","human",4,"battlefield",0);
 s=add(s,"Bystander","ai",3);
 s=applyCommand(s,{type:"damage",uid:uid(s,"Bystander"),value:1});
 s=pass(attack(s,"ai",0,["Attacker"]));
 assert.equal(s.cards.find(c=>c.name==="Attacker").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Defender").zone,"battlefield");
 assert.equal(s.cards.find(c=>c.name==="Defender").damage,0);
 assert.equal(s.cards.find(c=>c.name==="Bystander").damage,0);
 assert.equal(s.players.ai.score,0);
});
test("group attack simultaneously deals combined damage, obeying Tank before others",()=>{
 let s=setup();
 s=add(s,"Unit A","ai",3);s=add(s,"Unit B","ai",2);
 s=add(s,"Tank","human",4,"battlefield",1,"Tank");
 s=add(s,"Fragile","human",1,"battlefield",1);
 const fight=attack(s,"ai",1,["Unit A","Unit B"]);
 const result=previewCombat(fight,1,"ai");
 assert.equal(result.attackingMight,5);
 assert.equal(result.damageToDefenders[uid(fight,"Tank")],4);
 assert.equal(result.damageToDefenders[uid(fight,"Fragile")],1);
 assert.equal(result.defendingMight,5);
 s=pass(fight);
 assert.equal(s.cards.find(c=>c.name==="Tank").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Fragile").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Unit A").zone,"trash");
 assert.equal(s.cards.find(c=>c.name==="Unit B").zone,"trash");
 assert.equal(s.players.ai.score,0);
});
test("Assault, Shield and stun change damage dealt but not stunned-unit lethality",()=>{
 assert.equal(effectiveMight(card("Fighter",2,"Assault 2"),"attack"),4);
 assert.equal(effectiveMight(card("Fighter",2,"Assault 2"),"defend"),2);
 assert.equal(effectiveMight(card("Shielded",3,"Shield 2"),"defend"),5);
 let s=setup();s=add(s,"Fighter","ai",2);
 s=add(s,"Shielded","human",3,"battlefield",0,"Shield 2");
 s=attack(s,"ai",0,["Fighter"]);
 s=applyCommand(s,{type:"stun",uid:uid(s,"Shielded")});
 const result=previewCombat(s,0,"ai");
 assert.equal(result.attackingMight,2);
 assert.equal(result.defendingMight,0);
 assert.equal(result.damageToDefenders[uid(s,"Shielded")],2);
 assert.equal(result.dead.length,0);
 s=pass(s);
 assert.equal(s.cards.find(c=>c.name==="Fighter").zone,"base");
 assert.equal(s.cards.find(c=>c.name==="Shielded").zone,"battlefield");
 assert.equal(s.cards.find(c=>c.name==="Fighter").damage,0);
});
test("Backline last, Tank first, player-selectable damage order within matching priority",()=>{
 const tank={...card("Tank",3,"Tank"),uid:"tank"};
 const normal={...card("Normal",2),uid:"normal"};
 const back={...card("Backline",1,"Backline"),uid:"back"};
 assert.equal(combatPriority(tank),0);
 assert.equal(combatPriority(back),2);
 let result=assignDamage(4,[back,normal,tank],"defend",["back","normal","tank"]);
 assert.deepEqual(result.assigned,{tank:3,normal:1});
 result=assignDamage(3,[{...card("First",2),uid:"a"},{...card("Second",2),uid:"b"}],
  "defend",["b","a"]);
 assert.deepEqual(result.assigned,{b:2,a:1});
});
test("when a reaction kills the last defender, combat skips the damage step and attacker conquers",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",3);
 s=add(s,"Defender","human",2,"battlefield",0);
 s=attack(s,"ai",0,["Attacker"]);
 s=applyCommand(s,{type:"damage",uid:uid(s,"Defender"),value:2});
 assert.equal(s.cards.find(c=>c.name==="Defender").zone,"trash");
 s=pass(s);
 assert.equal(s.pendingCombat,null);
 assert.equal(s.cards.find(c=>c.name==="Attacker").zone,"battlefield");
 assert.equal(s.players.ai.score,1);
});
test("complex combat card text requires explicit confirmation of applied effects",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",4, "base",0,"When I attack, give a unit +2 Might.");
 s=add(s,"Defender","human",2,"battlefield",0);
 s=attack(s,"ai",0,["Attacker"]);
 assert.ok(s.pendingCombat.warnings.length);
 s=pass(s);
 assert.ok(s.pendingCombat);
 assert.equal(s.players.ai.score,0);
 assert.throws(()=>applyCommand(s,{type:"combat-resolve"}),/Effets de cartes/);
 s=applyCommand(s,{type:"combat-confirm-effects",confirm:true});
 assert.equal(s.pendingCombat,null);
 assert.equal(s.players.ai.score,1);
});
test("manual damage choices are limited to enemy UIDs; no out-of-order or duplicate assignment",()=>{
 let s=setup();s=add(s,"Attacker","ai",5);
 s=add(s,"D1","human",3,"battlefield",0);
 s=add(s,"D2","human",2,"battlefield",0);
 s=attack(s,"ai",0,["Attacker"]);
 assert.throws(()=>applyCommand(s,{type:"combat-order",player:"ai",uids:[uid(s,"D1")]}),/exactement/);
 assert.throws(()=>applyCommand(s,{type:"combat-order",player:"ai",uids:[uid(s,"D1"),uid(s,"D1")]}),/exactement/);
 s=applyCommand(s,{type:"combat-order",player:"ai",uids:[uid(s,"D1"),uid(s,"D2")]});
 const r=previewCombat(s,0,"ai",s.pendingCombat.orders);
 assert.equal(r.damageToDefenders[uid(s,"D1")],3);
 assert.equal(r.damageToDefenders[uid(s,"D2")],2);
});
test("stun and damage heal at end of turn; temporary Might bonus expires",()=>{
 let s=setup("human");s=add(s,"Defender","human",5);
 s=applyCommand(s,{type:"damage",uid:uid(s,"Defender"),value:2});
 s=applyCommand(s,{type:"stun",uid:uid(s,"Defender")});
 s=applyCommand(s,{type:"counter",uid:uid(s,"Defender"),key:"tempMight",value:2});
 s=applyCommand(s,{type:"next-turn"});
 const d=s.cards.find(c=>c.name==="Defender");
 assert.equal(d.damage,0);assert.equal(d.stunned,false);
 assert.equal(d.counters.tempMight,undefined);
});
test("AI initiates a defended attack and stops for the physical player's reaction window",()=>{
 let s=setup();
 s=add(s,"Attacker","ai",5);
 s=add(s,"Human defender","human",2,"battlefield",0);
 s=add(s,"Human defender two","human",2,"battlefield",1);
 const planned=planAutonomousAITurn(s);
 assert.equal(planned.error,undefined,planned.error);
 assert.ok(planned.commands.some(c=>c.type==="combat-attack"));
 assert.ok(!planned.commands.some(c=>c.type==="next-turn"));
 assert.ok(planned.state.pendingCombat);
 assert.equal(planned.state.players.ai.score,0);
});
test("voice pass ends a safe combat after both parties pass without requiring Enter",()=>{
 let s=setup("human");s=add(s,"Human","human",4);
 s=add(s,"AI guard","ai",2,"battlefield",0);
 s=attack(s,"human",0,["Human"]);
 const plan=planPlayerSequence("je passe",s,[]);
 assert.deepEqual(plan.commands,[{type:"combat-pass",player:"human"}]);
 for(const c of plan.commands)s=applyCommand(s,c);
 assert.equal(s.pendingCombat,null);
 assert.equal(s.players.human.score,1);
});
test("combat controls are embedded on the physical battlefield and bundle can access the engine",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 for(const id of ["combat-panel","combat-attack-button","combat-pass-button",
  "combat-effects-button","combat-order-button","combat-choices"])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/renderCombatPanel\(\)/);
 assert.match(server,/combat-engine\.mjs/);
});
