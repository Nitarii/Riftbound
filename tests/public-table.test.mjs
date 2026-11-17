import test from "node:test";
import assert from "node:assert/strict";
import {applyCommand,createState} from "../core.mjs";
import {publicTableReply} from "../public-table.mjs";

test("R05 displays the public spell and its planned damage without listing either hand",()=>{
 const state=createState();
 state.cards.push(
  {uid:"public-strike",name:"Ruthless Strike",zone:"chain",type:"Spell",owner:"ai"},
  {uid:"visible-witness",name:"Mournful Witness",zone:"battlefield",type:"Unit",owner:"human"},
  {uid:"private-ai",name:"Private Scout",zone:"hand",type:"Unit",owner:"ai"},
  {uid:"private-player",name:"Private Herald",zone:"hand",type:"Unit",owner:"human"},
  {uid:"hidden-card",name:"Hidden Guardian",zone:"hidden",faceDown:true,type:"Unit",owner:"human"}
 );
 state.spellChain={items:[{uid:"public-strike",targetUid:"visible-witness",damage:5}],priority:"human"};
 const reply=publicTableReply("Je vois pas la carte Ruthless Strike.",state);
 assert.deepEqual(reply.view,{kind:"card",uid:"public-strike"});
 assert.match(reply.text,/Ruthless Strike.*chaîne.*Mournful Witness.*5 dégâts prévus/);
 for(const card of ["Private Scout","Private Herald","Hidden Guardian"]){
  const hidden=publicTableReply("Montre-moi la carte "+card+".",state);
  assert.equal(hidden.view,undefined);
  assert.ok(!hidden.text.includes(card));
 }
 assert.equal(publicTableReply("Je joue Ruthless Strike.",state),null);
});

test("R22 uses the current 6–6 encounter, visible units and ready runes",()=>{
 let state=createState();
 const apply=command=>{state=applyCommand(state,command);};
 apply({type:"setup-human",legend:{name:"Shen",type:"Legend"},champion:{name:"Test Shen"},
  battlefield:{name:"Grove of the God-Willow",type:"Battlefield"}});
 apply({type:"start",player:"ai"});
 apply({type:"phase",phase:"Main"});
 for(const player of ["human","ai"])apply({type:"score",player,set:true,value:6});
 for(const domain of ["Order","Order","Calm"])apply({type:"add",player:"human",zone:"runes",
  card:{name:domain+" Rune",domains:[domain],type:"Rune"}});
 apply({type:"add",player:"human",zone:"battlefield",battlefield:0,
  card:{name:"Disciple of Shen",type:"Unit",might:1}});
 for(const [name,might] of [["Blade Twirler",4],["Shadow Assassin",5]])
  apply({type:"add",player:"ai",zone:"base",card:{name,type:"Unit",might}});
 apply({type:"combat-attack",player:"ai",battlefield:0,
  uids:state.cards.filter(c=>c.owner==="ai"&&c.zone==="base").map(c=>c.uid)});
 apply({type:"combat-pass",player:"ai"});
 state.lastCombat={exchanged:true,attackingMight:9,defendingMight:7,battlefield:"Abandoned branch"};
 state.cards.push({uid:"hidden-other",name:"Hidden other",zone:"battlefield",battlefield:0,
  owner:"human",type:"Unit",might:8,faceDown:true});
 const snapshot=structuredClone(state);
 const reply=publicTableReply("Tu peux m’afficher l’état du plateau actuel ?",state);
 assert.deepEqual(reply.view,{kind:"board"});
 assert.match(reply.text,/6–6/);
 assert.match(reply.text,/IA attaque à 9, Joueur défend à 1/);
 assert.match(reply.text,/runes prêtes 2 Order, 1 Calm/);
 assert.match(reply.text,/Disciple of Shen.*Blade Twirler, Shadow Assassin/);
 assert.doesNotMatch(reply.text,/Abandoned branch|Hidden other/);
 assert.deepEqual(state,snapshot);
 assert.match(publicTableReply("Show me the current board",state,{english:true}).text,/AI attacks at 9, Player defends at 1/);
});
