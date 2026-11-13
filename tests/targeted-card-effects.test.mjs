import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities} from "../effect-engine.mjs";
const c=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:2,...extra});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:c("Shen","Legend"),
  champion:c("Shen Chosen"),battlefield:c("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:c("Jinx","Legend"),
  champion:c("Jinx Chosen"),battlefield:c("Arena","Battlefield"),
  main:Array.from({length:20},(_,i)=>c("Deck "+i)),
  runes:Array.from({length:12},()=>c("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 return applyCommand(s,{type:"phase",phase:"Main"});
}
const add=(s,card,owner="ai",zone="hand",field)=>applyCommand(s,{
 type:"add",player:owner,card,zone,battlefield:field
});
const play=(s,name)=>applyCommand(s,{type:"play-paid",zone:"base",
 uid:s.cards.find(c=>c.owner==="ai"&&c.zone==="hand"&&c.name===name).uid});
test("generic card text stuns enemy using Solari Shieldbearer printed ability",()=>{
 let s=setup();
 s=add(s,c("Defender","Unit",{might:5}),"human","base");
 s=add(s,c("Solari Shieldbearer","Unit",{
  text:"When you play me, stun a unit. (It doesn't deal combat damage this turn.)"
 }));
 const read=compileCardAbilities(s.cards.find(x=>x.name==="Solari Shieldbearer"));
 assert.deepEqual(read.abilities[0].steps,[{kind:"stun-unit",count:1}]);
 s=play(s,"Solari Shieldbearer");
 assert.equal(s.cards.find(x=>x.name==="Defender").stunned,true);
 assert.equal(s.pendingEffects.length,0);
});
test("Legion generic targeting grants the Might buff only when already activated",()=>{
 let s=setup();
 s=add(s,c("Friendly Holder","Unit",{might:4}),"ai","battlefield",0);
 s=add(s,c("Filler","Unit"));s=play(s,"Filler");
 s=add(s,c("Dangerous Duo","Unit",{
  text:"[Legion] — When you play me, give a unit +2 {might} this turn. (Get the effect if you've played another card this turn.)"
 }));
 s=play(s,"Dangerous Duo");
 assert.equal(s.cards.find(x=>x.name==="Friendly Holder").counters.tempMight,2);
 assert.equal(s.pendingEffects.length,0);
});
test("Deathknell creates precisely 3 Recruit tokens after Machine Evangel dies",()=>{
 let s=setup();
 s=add(s,c("Machine Evangel","Unit",{might:1,
  text:"[Deathknell] — Play three 1 {might} Recruit unit tokens into your base. (When I die, get the effect.)"
 }),"ai","base");
 const uid=s.cards.find(x=>x.name==="Machine Evangel").uid;
 s=applyCommand(s,{type:"damage",uid,value:1});
 const tokens=s.cards.filter(x=>x.name==="Recruit"&&x.owner==="ai"&&x.zone==="base");
 assert.equal(tokens.length,3);
 assert.ok(tokens.every(x=>x.might===1&&x.exhausted));
 assert.equal(s.pendingEffects.length,0);
});
test("token generation works for other identities and amounts, not card-name special cases",()=>{
 let s=setup();
 s=add(s,c("Ferrous Forerunner","Unit",{might:1,
  text:"[Deathknell] — Play two 3 {might} Mech unit tokens to your base. (When I die, get the effect.)"
 }),"ai","base");
 const uid=s.cards.find(x=>x.name==="Ferrous Forerunner").uid;
 s=applyCommand(s,{type:"damage",uid,value:1});
 assert.equal(s.cards.filter(x=>x.name==="Mech"&&x.zone==="base"&&x.might===3).length,2);
});
test("unsupported targeting and conditions never invent an automatic effect",()=>{
 const read=compileCardAbilities(c("En Garde","Spell",{
  text:"Give a friendly unit +1 {might} this turn, then an additional +1 {might} this turn if it is the only unit you control."
 }));
 assert.equal(read.unsupported.length,1);
});

test("Deflect targeting pays a real Power rune and never chooses a protected unit for free",()=>{
 let s=setup();
 s=add(s,c("Kato the Arm","Unit",{might:4,
  text:"[Deflect] (Opponents must pay {power:any} to choose me with a spell or ability.)"
 }),"human","base");
 s=add(s,c("Solari Shieldbearer","Unit",{
  text:"When you play me, stun a unit. (It doesn't deal combat damage this turn.)"
 }));
 const prior=s.cards.filter(x=>x.owner==="ai"&&x.zone==="runes").length;
 s=play(s,"Solari Shieldbearer");
 assert.equal(s.cards.find(x=>x.name==="Kato the Arm").stunned,true);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.cards.filter(x=>x.owner==="ai"&&x.zone==="runes").length,prior-1);
 assert.ok(s.message.includes("Deflect"));
});
