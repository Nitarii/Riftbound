import test from "node:test";
import assert from "node:assert/strict";
import {allowPhysicalLocalCommand} from "../local-action-gate.mjs";
const board={
 cards:[
  {uid:"human_1",name:"Disciple of Shen",owner:"human",zone:"base"},
  {uid:"human_2",name:"Loyal Poro",owner:"human",zone:"battlefield",battlefield:0},
  {uid:"ai_1",name:"Enemy Scout",owner:"ai",zone:"base"},
  {uid:"secret",name:"Secret Card",owner:"human",zone:"hand"}
 ],
 battlefields:[{card:{name:"Grove of the God Willow"}},{card:{name:"The Arena"}}]
};
test("local speech model can request only explicit physical moves matching named card and field",()=>{
 const move={type:"move",uid:"human_1",zone:"battlefield",battlefield:0};
 assert.equal(allowPhysicalLocalCommand(move,board,
  "Je déplace Disciple of Shen vers Grove of the God Willow"),true);
 assert.equal(allowPhysicalLocalCommand(move,board,
  "Bonjour, j'aime Disciple of Shen"),false);
 assert.equal(allowPhysicalLocalCommand(move,board,
  "Je déplace Disciple of Shen vers The Arena"),false);
 assert.equal(allowPhysicalLocalCommand({...move,uid:"ai_1"},board,
  "Je déplace Enemy Scout vers Grove of the God Willow"),false);
 assert.equal(allowPhysicalLocalCommand({...move,uid:"secret"},board,
  "Je déplace Secret Card vers Grove of the God Willow"),false);
});
test("local speech model cannot invent cards, scores, damage or rune payments",()=>{
 for(const command of [
  {type:"score",player:"human",value:3},
  {type:"damage",uid:"human_1",value:4},
  {type:"add",player:"human",zone:"base",card:{name:"Made up"}},
  {type:"exhaust-runes",player:"human",count:2},
  {type:"play-paid",uid:"human_1",zone:"base"},
  {type:"move",uid:"human_1",zone:"hand",battlefield:0}
 ])assert.equal(allowPhysicalLocalCommand(command,board,
   "Je déplace Disciple of Shen vers Grove of the God Willow"),false);
});
test("ready/exhaust public named physical cards are gated by spoken intent",()=>{
 assert.equal(allowPhysicalLocalCommand({type:"exhaust",uid:"human_2"},board,
  "J'épuise Loyal Poro"),true);
 assert.equal(allowPhysicalLocalCommand({type:"ready",uid:"human_2"},board,
  "Je redresse Loyal Poro"),true);
 assert.equal(allowPhysicalLocalCommand({type:"exhaust",uid:"human_2"},board,
  "Je redresse Loyal Poro"),false);
});
