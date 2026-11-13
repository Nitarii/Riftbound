import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
const card=(name,type="Unit",extra={})=>({name,type,might:2,energy:0,power:0,...extra});
function board(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
 champion:card("Shen Chosen"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
 champion:card("Jinx Chosen"),battlefield:card("Arena","Battlefield"),
 main:Array.from({length:10},(_,i)=>card("Main "+i)),
 runes:Array.from({length:12},(_,i)=>card("Rune "+i,"Rune")),
 mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 return applyCommand(s,{type:"phase",phase:"Main"});
}
function add(s,name,extra={}){s=applyCommand(s,{type:"add",player:"ai",zone:"base",card:card(name,"Unit",extra)});return s}
test("normal Move requires controlling turn, ready unit and current Main Phase",()=>{
 let s=board();s=add(s,"Scout");
 const uid=s.cards.find(x=>x.name==="Scout").uid;
 s=applyCommand(s,{type:"move",uid,zone:"battlefield",battlefield:0});
 assert.equal(s.cards.find(x=>x.uid===uid).exhausted,true);
 assert.throws(()=>applyCommand(s,{type:"move",uid,zone:"base"}),/épuisée/);
 let t=board();t=add(t,"Other");const id=t.cards.find(x=>x.name==="Other").uid;
 t=applyCommand(t,{type:"phase",phase:"Ending"});
 assert.throws(()=>applyCommand(t,{type:"move",uid:id,zone:"battlefield",battlefield:0}),/Main Phase/);
});
test("a battlefield-to-battlefield standard move requires Ganking and exhausts the mover",()=>{
 let s=board();s=applyCommand(s,{type:"add",player:"ai",zone:"battlefield",battlefield:0,
  card:card("Ordinary")});s=applyCommand(s,{type:"add",player:"ai",zone:"battlefield",battlefield:0,
  card:card("Ganker","Unit",{text:"[Ganking] (I can move from battlefield to battlefield.)"})});
 const a=s.cards.find(x=>x.name==="Ordinary").uid;
 const b=s.cards.find(x=>x.name==="Ganker").uid;
 assert.throws(()=>applyCommand(s,{type:"move",uid:a,zone:"battlefield",battlefield:1}),/Ganking/);
 s=applyCommand(s,{type:"move",uid:b,zone:"battlefield",battlefield:1});
 assert.equal(s.cards.find(x=>x.uid===b).exhausted,true);
 assert.equal(s.cards.find(x=>x.uid===b).battlefield,1);
 assert.throws(()=>applyCommand(s,{type:"move",uid:b,zone:"base"}),/épuisée/);
});
