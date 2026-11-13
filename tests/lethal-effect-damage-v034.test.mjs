import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";

const card=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:2,...extra});
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Champion"),battlefield:card("Arena","Battlefield"),
  main:Array.from({length:20},(_,i)=>card("Deck "+i)),
  runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:3});
 return applyCommand(s,{type:"phase",phase:"Main"});
}
function add(s,p,c,zone="base",field=undefined){
 return applyCommand(s,{type:"add",player:p,card:c,zone,battlefield:field});
}
function playDamage(s){
 s=add(s,"ai",card("Arbitrary Blaster","Unit",{
  energy:1,might:2,text:"When you play me, deal 2 damage to an enemy unit."
 }),"hand");
 const uid=s.cards.find(c=>c.name==="Arbitrary Blaster").uid;
 return applyCommand(s,{type:"play-paid",uid,zone:"base"});
}
test("lethal printed damage fires Deathknell and spawns tokens",()=>{
 let s=setup();
 s=add(s,"human",card("Last Recruit","Unit",{
  might:2,text:"[Deathknell] — Play two 1 {might} Recruit unit tokens into your base. (When I die, get the effect.)"
 }));
 s=playDamage(s);
 assert.equal(s.cards.find(c=>c.name==="Last Recruit").zone,"trash");
 const tokens=s.cards.filter(c=>c.owner==="human"&&c.name==="Recruit"&&c.zone==="base");
 assert.equal(tokens.length,2);
 assert.ok(tokens.every(c=>c.exhausted&&c.might===1));
 assert.equal(s.pendingEffects.length,0);
});
test("nonlethal card-effect damage does not fire Deathknell",()=>{
 let s=setup();
 s=add(s,"human",card("Tough Recruit","Unit",{
  might:4,text:"[Deathknell] — Play two 1 {might} Recruit unit tokens into your base. (When I die, get the effect.)"
 }));
 s=playDamage(s);
 assert.equal(s.cards.find(c=>c.name==="Tough Recruit").zone,"base");
 assert.equal(s.cards.find(c=>c.name==="Tough Recruit").damage,2);
 assert.equal(s.cards.filter(c=>c.name==="Recruit").length,0);
});
test("damage command respects conditional Shield only in a valid defending showdown",()=>{
 let s=setup();
 s=add(s,"human",card("Shielded","Unit",{
  might:2,text:"I have [Shield 3] while I'm at a battlefield with exactly one other unit you control. (+3 {might} while I'm a defender.)"
 }),"battlefield",0);
 s=add(s,"human",card("Companion"),"battlefield",0);
 const shielded=s.cards.find(c=>c.name==="Shielded");
 // No live defending role: conditional Shield does not prevent normal damage.
 s=applyCommand(s,{type:"damage",uid:shielded.uid,value:2});
 assert.equal(s.cards.find(c=>c.uid===shielded.uid).zone,"trash");
});
