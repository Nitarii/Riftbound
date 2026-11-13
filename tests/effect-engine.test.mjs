import test from "node:test";
import assert from "node:assert/strict";
import {compileCardAbilities,onPlayInstructions,inspectCards} from "../effect-engine.mjs";
import {mandatoryPlayEffects} from "../play-effects.mjs";
const c=(name,type,text)=>({code:name,name,type,text});
test("card effects are parsed from printed text, not from hardcoded card IDs",()=>{
 const cards=[
  c("Random Recruit","Unit","When you play me, draw 2."),
  c("Archive Gear","Gear","When you play this, ready 2 friendly runes."),
  c("Lucky Spell","Spell","Draw 2."),
  c("Turn Scribe","Unit","At the start of your Beginning Phase, draw 1."),
  c("Holding Spirit","Unit","When I hold, draw 1."),
  c("Victory Bird","Unit","When I conquer, draw 1."),
  c("Last Word","Unit","When I die, draw 1."),
  c("Battle Boon","Unit","When you play me, I get +2 Might this turn."),
  c("Bloodshot","Unit","When you play me, deal 2 damage to an enemy unit."),
  c("Chemtech Enforcer","Unit","[Assault 2] (+2 while I'm an attacker.)\nWhen you play me, discard 1.")
 ];
 const expected=[
  ["play","draw"],["play","ready-runes"],["play","draw"],["beginning","draw"],
  ["hold","draw"],["conquer","draw"],["die","draw"],["play","self-buff"],
  ["play","damage-enemy"],["play","discard"]];
 cards.forEach((card,i)=>{
  const out=compileCardAbilities(card);
  assert.equal(out.unsupported.length,0,card.name+": "+JSON.stringify(out.unsupported));
  assert.equal(out.abilities[0]?.trigger,expected[i][0],card.name);
  assert.equal(out.abilities[0]?.steps[0]?.kind,expected[i][1],card.name);
 });
 assert.deepEqual(mandatoryPlayEffects(cards.at(-1)),{supported:true,discard:1,reason:""});
 assert.equal(inspectCards(cards).fullySupported,10);
});
test("compound instructions preserve sequence and never discard unknown conditions",()=>{
 const card=c("Compound","Unit","When you play me, discard 1, then draw 2.");
 const result=compileCardAbilities(card);
 assert.equal(result.unsupported.length,0);
 assert.deepEqual(onPlayInstructions(card).steps,[{kind:"discard",count:1},{kind:"draw",count:2}]);
 const unknown=c("Conditional","Unit","At the end of your turn, if I am at a battlefield, ready up to 4 runes.");
 assert.equal(compileCardAbilities(unknown).unsupported.length,1);
 assert.equal(compileCardAbilities(unknown).abilities[0]?.supported,false);
});
test("activated, passive and unknown effects are flagged rather than silently omitted",()=>{
 const card=c("Complex","Gear","[E]: Summon a 1 Might token.\nWhen you play this, choose an enemy unit. Kill it.");
 const audit=compileCardAbilities(card);
 assert.equal(audit.unsupported.length,2);
 assert.equal(inspectCards([card]).unhandled,1);
});
