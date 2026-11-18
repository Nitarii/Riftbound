import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities} from "../effect-engine.mjs";
import {planHumanAnnouncement} from "../player-actions.mjs";
import {planAutonomousAITurn} from "../ai-turn.mjs";
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
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
 const tokens=s.cards.filter(x=>x.name==="Recruit"&&x.owner==="ai"&&x.zone==="base");
 assert.equal(tokens.length,3);
 assert.ok(tokens.every(x=>x.might===1&&x.exhausted));
 assert.equal(s.pendingEffects.length,0);
});
test("token generation works for other identities and amounts, not card-name special cases",()=>{
 let s=setup();
 s=add(s,c("Ferrous Forerunner","Unit",{might:1,
  text:"[Deathknell] — Play two 3 [S] Mech unit tokens to your base. (When I die, get the effect.)"
 }),"ai","base");
 const uid=s.cards.find(x=>x.name==="Ferrous Forerunner").uid;
 s=applyCommand(s,{type:"damage",uid,value:1});
 assert.equal(s.cards.filter(x=>x.name==="Mech").length,0);
 s=applyCommand(applyCommand(s,{type:"chain-pass",player:"ai"}),{type:"chain-pass",player:"human"});
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

const byName=(s,name)=>s.cards.find(card=>card.name===name);
const passChain=s=>[s.spellChain.priority,s.spellChain.priority==="human"?"ai":"human"].reduce(
 (next,player)=>applyCommand(next,{type:"chain-pass",player}),s);
const passFocus=s=>[s.pendingCombat.focus,s.pendingCombat.focus==="human"?"ai":"human"].reduce(
 (next,player)=>applyCommand(next,{type:"combat-pass",player}),s);
const main=s=>applyCommand(s,{type:"phase",phase:"Main"});

test("Mister Root gains public XP after reactions only when moving to a battlefield",()=>{
 let s=setup();
 s=add(s,c("Mister Root","Unit",{text:"[Accelerate] (You may pay [1][C] as an additional cost to have me enter ready.)\nWhen I move to a battlefield, gain 2 XP."}),"ai","base");
 const uid=byName(s,"Mister Root").uid;
 delete s.players.ai.xp; // Existing saved table.
 s=applyCommand(s,{type:"move",uid,zone:"battlefield",battlefield:0});
 assert.equal(s.players.ai.xp,undefined);
 assert.equal(s.spellChain.items.at(-1).ability,"gain-xp");
 s=passFocus(passChain(s));
 assert.equal(s.players.ai.xp,2);
 s=applyCommand(s,{type:"move",uid,zone:"base",effect:true});
 assert.equal(s.spellChain,null);
 assert.equal(s.players.ai.xp,2);
});

test("AI reinforcement pauses its turn when Mister Root opens a chain",()=>{
 let s=setup();
 s=add(s,c("Keeper","Unit",{might:6}),"ai","battlefield",0);
 s=add(s,c("Guardian","Unit",{might:9}),"human","battlefield",1);
 s=add(s,c("Mister Root","Unit",{text:"When I move to a battlefield, gain 2 XP."}),"ai","base");
 const plan=planAutonomousAITurn(s);
 assert.equal(plan.error,undefined);
 assert.equal(plan.state.spellChain.items.at(-1).ability,"gain-xp");
 assert.equal(plan.commands.at(-1).type,"move");
 assert.equal(plan.state.phase,"Main");
});

test("Enthusiastic Promoter buffs each unit here once and buff clears on death",()=>{
 let s=setup();
 s=add(s,c("Enthusiastic Promoter","Unit",{text:"[Backline] (I must be assigned combat damage last.)\nWhen I hold, [Buff] all units here. (Give each a +1 [S] buff if it doesn't have one.)"}),"human","battlefield",0);
 s=add(s,c("Already buffed"),"human","battlefield",0);
 s=add(s,c("Elsewhere"),"human","base");
 s=applyCommand(s,{type:"counter",uid:byName(s,"Already buffed").uid,key:"buff",value:1});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.spellChain.items.at(-1).ability,"buff-here");
 assert.equal(byName(s,"Enthusiastic Promoter").counters.buff,undefined);
 s=passChain(s);
 assert.equal(byName(s,"Enthusiastic Promoter").counters.buff,1);
 assert.equal(byName(s,"Already buffed").counters.buff,1);
 assert.equal(byName(s,"Elsewhere").counters.buff,undefined);
 s=applyCommand(s,{type:"damage",uid:byName(s,"Already buffed").uid,value:3});
 assert.equal(byName(s,"Already buffed").zone,"trash");
 assert.equal(byName(s,"Already buffed").counters.buff,undefined);
});

test("Unsung Hero checks its Might before death and draws only on resolution",()=>{
 let s=setup();
 const hero=c("Unsung Hero","Unit",{might:4,text:"[Deathknell] — If I was [Mighty], draw 2. (When I die, get the effect. I'm Mighty while I have 5+ [S].)"});
 s=add(s,hero,"ai","base");
 const uid=byName(s,"Unsung Hero").uid;
 const below=applyCommand(s,{type:"damage",uid,value:4});
 assert.equal(below.spellChain,null);
 s=applyCommand(s,{type:"counter",uid,key:"buff",value:1});
 const initial=s.players.ai.handCount;
 s=applyCommand(s,{type:"damage",uid,value:5});
 assert.equal(s.players.ai.handCount,initial);
 assert.equal(s.spellChain.items.at(-1).ability,"draw");
 assert.equal(passChain(s).players.ai.handCount,initial+2);
});

test("Veiled Temple accepts a named target and offers detachment after reactions",()=>{
 let s=setup();
 s.battlefields[0].card=c("Veiled Temple","Battlefield",{text:"When you conquer here, you may ready a friendly gear. If it's an Equipment, you may detach it."});
 s=main(applyCommand(s,{type:"start",player:"human"}));
 s=add(s,c("Carrier"),"human","base");
 const carrier=byName(s,"Carrier").uid;
 s=add(s,c("Hand Hammer","Gear",{code:"VEN-027"}),"human","base");
 const hammer=byName(s,"Hand Hammer").uid;
 s=add(s,c("Enemy Gear","Gear"),"ai","base");
 s=add(s,c("Calm Rune","Rune",{domains:["Calm"]}),"human","runes");
 s=applyCommand(s,{type:"equip",player:"human",uid:hammer,targetUid:carrier});
 s=applyCommand(s,{type:"exhaust",uid:hammer});
 s=passFocus(applyCommand(s,{type:"move",uid:carrier,zone:"battlefield",battlefield:0}));
 assert.deepEqual(s.pendingEffects[0].targetUids,[hammer]);
 const pick=planHumanAnnouncement("Je redresse Hand Hammer",s,[]).commands[0];
 assert.equal(pick.targetUid,hammer);
 s=applyCommand(JSON.parse(JSON.stringify(s)),pick);
 assert.equal(byName(s,"Hand Hammer").exhausted,true);
 s=passChain(s);
 assert.equal(s.pendingEffects[0].trigger,"gear-detach");
 const detached=planHumanAnnouncement("Je détache",s,[]).commands.reduce(applyCommand,s);
 const gear=byName(detached,"Hand Hammer");
 assert.equal(gear.uid,hammer);
 assert.equal(gear.exhausted,false);
 assert.equal(gear.attachedTo,null);
 assert.equal(gear.zone,"base");
});

test("Amateur Recital pays Deflect before reactions and returns the same target",()=>{
 let s=setup();
 s.battlefields[0].card=c("Amateur Recital","Battlefield",{text:"When you hold here, you may move a unit at a battlefield to its base."});
 s=add(s,c("Holder"),"human","battlefield",0);
 s=add(s,c("Protected","Unit",{text:"[Deflect]"}),"ai","battlefield",1);
 s=add(s,c("Calm Rune","Rune",{domains:["Calm"]}),"human","runes");
 s=applyCommand(s,{type:"next-turn"});
 const uid=byName(s,"Protected").uid;
 s=applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,targetUid:uid});
 assert.equal(s.cards.filter(card=>card.owner==="human"&&card.zone==="runes").length,0);
 assert.equal(byName(s,"Protected").zone,"battlefield");
 s=passChain(s);
 assert.equal(byName(s,"Protected").uid,uid);
 assert.equal(byName(s,"Protected").zone,"base");
});

test("Iascylla remembers the Hold field, then the moved enemy receives combat focus",()=>{
 let s=setup();
 s=add(s,c("Iascylla","Unit",{text:"When I hold, at the start of your next Main Phase, you may move an enemy unit to this battlefield."}),"human","battlefield",0);
 s=add(s,c("Holder","Unit",{might:5}),"human","battlefield",0);
 s=add(s,c("Enemy"),"ai","base");
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.spellChain.items.at(-1).ability,"schedule-enemy-move");
 s=passChain(s);
 assert.equal(s.delayedMain[0].field,0);
 assert.equal(s.pendingEffects.length,0);
 s=applyCommand(s,{type:"damage",uid:byName(s,"Iascylla").uid,value:2});
 s=main(JSON.parse(JSON.stringify(s)));
 assert.equal(s.pendingEffects[0].item.ability,"move-enemy-here");
 const uid=byName(s,"Enemy").uid;
 s=applyCommand(s,{type:"effect-confirm",id:s.pendingEffects[0].id,confirm:true,targetUid:uid});
 assert.equal(byName(s,"Enemy").zone,"base");
 s=passChain(s);
 assert.equal(byName(s,"Enemy").battlefield,0);
 assert.equal(byName(s,"Enemy").exhausted,false);
 assert.equal(s.pendingCombat.attacker,"ai");
 assert.equal(s.pendingCombat.focus,"ai");
 assert.equal(s.active,"human");
 assert.equal(s.delayedMain.length,0);
});
