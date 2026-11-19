import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities,migrateLegacyPassivePendingEffects} from "../effect-engine.mjs";
import {effectiveMight,deflectValue,previewCombat} from "../combat-engine.mjs";

const card=(name,type="Unit",extra={})=>({name,type,energy:0,power:0,might:3,...extra});
// Mosstomper's complete printed text, including the reference to Deflect in its reminder.
const level="[Level 3][>] I have +1 [S] and [Deflect]. (While you have 3+ XP, get the effect. Opponents must pay [A] to choose a [Deflect] unit with a spell or ability.)";
const mosstomper=card("Mosstomper","Unit",{text:"[Hunt 2] (When I conquer or hold, gain 2 XP.)\n"+level});
const stun=card("Solari Shieldbearer","Unit",{text:"When you play me, stun a unit."});
const byName=(s,name)=>s.cards.find(c=>c.name===name);
const add=(s,value,owner="ai",zone="base",battlefield)=>applyCommand(s,{
 type:"add",player:owner,card:value,zone,battlefield
});
const play=(s,name,extra={})=>applyCommand(s,{
 type:"play-paid",uid:byName(s,name).uid,zone:"base",...extra
});
const passChain=s=>[s.spellChain.priority,s.spellChain.priority==="ai"?"human":"ai"]
 .reduce((state,player)=>applyCommand(state,{type:"chain-pass",player}),s);
function table(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),
  champion:card("Shen Chosen"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx","Legend"),
  champion:card("Jinx Chosen"),battlefield:card("Arena","Battlefield"),
  main:Array.from({length:20},(_,i)=>card("Deck "+i)),
  runes:Array.from({length:12},()=>card("Chaos Rune","Rune",{domains:["Chaos"]})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"ai"});
 s=applyCommand(s,{type:"channel",player:"ai",count:2});
 return applyCommand(s,{type:"phase",phase:"Main"});
}

test("Mosstomper gains continuous Might and Deflect at its controller's current Level 3",()=>{
 const parsed=compileCardAbilities(mosstomper);
 assert.deepEqual(parsed.unsupported,[]);
 assert.deepEqual(parsed.continuous,[{kind:"level-stats",minimumXP:3,might:1,deflect:1}]);
 let s=add(table(),mosstomper);
 const unit=byName(s,"Mosstomper");
 for(const [xp,might,deflect] of [[0,3,0],[2,3,0],[3,4,1],[10,4,1],[2,3,0]]){
  s.players.ai.xp=xp;
  assert.equal(effectiveMight(unit,"none",s),might);
  assert.equal(deflectValue(unit,s),deflect);
 }
 s.players.ai.xp=3;
 assert.equal(effectiveMight({...unit,owner:"human"},"none",s),3);
 assert.equal(deflectValue({...unit,owner:"human"},s),0);
 assert.equal(effectiveMight(unit),3,"old saves with no XP use zero");
});

test("combat uses the continuous Level bonus without requiring manual confirmation",()=>{
 let s=add(table(),mosstomper);
 s.players.ai.xp=3;
 s=add(s,card("Defender"),"human","battlefield",0);
 s=applyCommand(s,{type:"combat-attack",player:"ai",uids:[byName(s,"Mosstomper").uid],battlefield:0});
 assert.deepEqual(s.pendingCombat.warnings,[]);
 assert.equal(previewCombat(s,0,"ai").attackingMight,4);
});

test("old passive confirmations migrate without dropping unrelated or triggered effects",()=>{
 const old={...table(),pendingEffects:[
  {id:"old-level",trigger:"other",text:level},
  {id:"unhandled",trigger:"other",text:"[Level 3][>] I have [Shield 3]."},
  {id:"triggered",trigger:"play",text:level}
 ]};
 assert.deepEqual(migrateLegacyPassivePendingEffects(old).pendingEffects.map(e=>e.id),["unhandled","triggered"]);
 assert.equal(old.pendingEffects.length,3);
 const resumed=applyCommand(JSON.parse(JSON.stringify(old)),{type:"note",text:"Reprise"});
 assert.deepEqual(resumed.pendingEffects.map(e=>e.id),["unhandled","triggered"]);
});

test("spells pay Level Deflect when choosing the target and never pay again on resolution",()=>{
 for(const xp of [2,3]){
  let s=add(table(),mosstomper,"human");s.players.human.xp=xp;
  s=add(s,card("Reaction Hit","Spell",{text:"[Reaction]\nDeal 1 to a unit."}),"ai","hand");
  const before=s.players.ai.runeCount;
  s=applyCommand(s,{type:"cast",player:"ai",uid:byName(s,"Reaction Hit").uid,targetUid:byName(s,"Mosstomper").uid});
  assert.equal(s.players.ai.runeCount,before+(xp===3?1:0));
  const paid=s.players.ai.runeCount;
  s.players.human.xp=xp===3?2:3;
  s=passChain(JSON.parse(JSON.stringify(s)));
  assert.equal(s.players.ai.runeCount,paid);
  assert.equal(byName(s,"Mosstomper").damage,1);
 }
});

test("a friendly Level Deflect target has no additional cost",()=>{
 let s=add(table(),mosstomper);s.players.ai.xp=3;
 s=add(s,card("Boost","Spell",{text:"[Reaction]\nGive a unit +1 [S] this turn."}),"ai","hand");
 const before=s.players.ai.runeCount;
 s=applyCommand(s,{type:"cast",player:"ai",uid:byName(s,"Boost").uid,targetUid:byName(s,"Mosstomper").uid});
 assert.equal(s.players.ai.runeCount,before);
 s=passChain(s);
 assert.equal(effectiveMight(byName(s,"Mosstomper"),"none",s),5);
});

test("generic targeted abilities pay numeric Deflect using reserve Power and Gold",()=>{
 let s=add(table(),card("Protected","Unit",{text:"[Deflect 2]"}),"human");
 s=add(s,card("Gold","Gear",{code:"TOKEN-GOLD"}));
 s=add(s,stun,"ai","hand");s.powerPool.ai=1;
 const runes=s.players.ai.runeCount;
 s=play(s,"Solari Shieldbearer",{targetUid:byName(s,"Protected").uid});
 assert.equal(Boolean(byName(s,"Protected").stunned),false);
 assert.match(s.message,/Deflect : 2 Power payé/);
 s=passChain(s);
 assert.equal(byName(s,"Protected").stunned,true);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.players.ai.runeCount,runes);
 assert.equal(s.powerPool.ai,0);
 assert.equal(byName(s,"Gold"),undefined);
});

test("generic targeting leaves an unaffordable effect pending and consumes no partial payment",()=>{
 let s=add(table(),card("Protected","Unit",{text:"[Deflect 4]"}),"human");
 s=add(s,stun,"ai","hand");s.powerPool.ai=1;
 const runes=s.players.ai.runeCount;
 s=play(s,"Solari Shieldbearer",{targetUid:byName(s,"Protected").uid});
 assert.equal(Boolean(byName(s,"Protected").stunned),false);
 assert.equal(s.pendingEffects.length,1);
 assert.match(s.pendingEffects[0].reason,/Deflect.*Power insuffisant/);
 assert.equal(s.players.ai.runeCount,runes);
 assert.equal(s.powerPool.ai,1);
});

test("automatic targeting chooses an affordable enemy instead of stalling on higher Might",()=>{
 let s=add(table(),card("Unaffordable","Unit",{might:10,text:"[Deflect 4]"}),"human");
 s=add(s,card("Legal Enemy","Unit",{might:4}),"human");
 s=add(s,stun,"ai","hand");
 s=play(s,"Solari Shieldbearer");
 s=passChain(s);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(byName(s,"Legal Enemy").stunned,true);
 assert.equal(Boolean(byName(s,"Unaffordable").stunned),false);
});

test("multiple targeted instructions cannot spend the same reserve, Gold or rune twice",()=>{
 let s=add(table(),card("Protected","Unit",{text:"[Deflect 3]"}),"human");
 s=add(s,card("Gold","Gear",{code:"TOKEN-GOLD"}));s.powerPool.ai=1;
 s=add(s,card("Double Stun","Unit",{text:"When you play me, stun a unit, then stun a unit."}),"ai","hand");
 const before=s.players.ai.runeCount;
 s=play(s,"Double Stun",{targetUid:byName(s,"Protected").uid});
 assert.equal(s.pendingEffects.length,1);
 assert.match(s.pendingEffects[0].reason,/Deflect.*Power insuffisant/);
 assert.equal(Boolean(byName(s,"Protected").stunned),false);
 assert.equal(s.players.ai.runeCount,before);
 assert.equal(s.powerPool.ai,1);
 assert.ok(byName(s,"Gold"));
});

test("stacked Deflect includes only active Level instances and ignores reminder references",()=>{
 const unit={...mosstomper,owner:"human",text:"[Deflect 2]\n"+mosstomper.text};
 const s=table();s.players.human.xp=2;
 assert.equal(deflectValue(unit,s),2);
 s.players.human.xp=3;
 assert.equal(deflectValue(unit,s),3);
});

test("Field Musicians pays the full enemy Deflect cost before opening its response chain",()=>{
 let s=add(table(),card("Protected","Unit",{text:"[Deflect 2]"}),"human");
 s=add(s,card("Field Musicians","Unit",{code:"VEN-026",text:"When you play me, give a unit +3 [S] this turn."}),"ai","hand");
 const before=s.players.ai.runeCount;
 s=play(s,"Field Musicians",{targetUid:byName(s,"Protected").uid});
 assert.equal(s.players.ai.runeCount,before+2);
 assert.equal(byName(s,"Protected").counters.tempMight,undefined);
 s=passChain(s);
 assert.equal(byName(s,"Protected").counters.tempMight,3);
 assert.equal(s.players.ai.runeCount,before+2);
});

test("losing a continuous Level bonus kills a lethally marked unit on cleanup",()=>{
 let s=add(table(),mosstomper);s.players.ai.xp=3;
 s=applyCommand(s,{type:"damage",uid:byName(s,"Mosstomper").uid,value:3});
 assert.equal(byName(s,"Mosstomper").zone,"base");
 s.players.ai.xp=2;
 s=applyCommand(JSON.parse(JSON.stringify(s)),{type:"note",text:"Reprise après changement d’XP"});
 assert.equal(byName(s,"Mosstomper").zone,"trash");
 assert.equal(byName(s,"Mosstomper").damage,0);
});

test("cleanup after a Might counter change keeps last-known allies for Deathknell",()=>{
 const poro=card("Loyal Poro","Unit",{code:"UNL-156",might:2,
  text:"[Deathknell][>] If I didn't die alone, draw 1. (When I die, get the effect. I wasn't alone if there were other friendly units here.)"});
 let s=add(table(),poro);
 s=add(s,card("Companion","Unit",{might:2}));
 s=applyCommand(s,{type:"counter",uid:byName(s,"Loyal Poro").uid,key:"might",value:1});
 s=applyCommand(s,{type:"damage",uid:byName(s,"Loyal Poro").uid,value:2});
 s=applyCommand(s,{type:"counter",uid:byName(s,"Loyal Poro").uid,key:"might",value:-1});
 assert.equal(byName(s,"Loyal Poro").zone,"trash");
 assert.equal(s.spellChain.items.at(-1).ability,"draw");
 const before=s.players.ai.handCount;
 s=passChain(s);
 assert.equal(s.players.ai.handCount,before+1);
});

test("simultaneous cleanup snapshots both units before either leaves the location",()=>{
 const text="[Deathknell][>] If I didn't die alone, draw 1. (When I die, get the effect. I wasn't alone if there were other friendly units here.)\n"+level;
 let s=table();s.players.ai.xp=3;
 for(const name of ["Learning Poro A","Learning Poro B"]){
  s=add(s,card(name,"Unit",{might:2,text}));
  s=applyCommand(s,{type:"damage",uid:byName(s,name).uid,value:2});
 }
 s.players.ai.xp=2;
 s=applyCommand(JSON.parse(JSON.stringify(s)),{type:"note",text:"Reprise"});
 assert.equal(byName(s,"Learning Poro A").zone,"trash");
 assert.equal(byName(s,"Learning Poro B").zone,"trash");
 assert.equal(s.spellChain.items.filter(i=>i.ability==="draw").length,2);
 const before=s.players.ai.handCount;
 s=passChain(passChain(s));
 assert.equal(s.players.ai.handCount,before+2);
});
