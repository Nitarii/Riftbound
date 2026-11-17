import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {DUEL_RULES,CORE_RULEBOOK,CORE_RULE_ENTRIES,duelOpeningRuneCount,selectCoreRules} from "../rules-compendium.mjs";
import {buildGameKnowledge,publicReference} from "../game-knowledge.mjs";
import {DUEL_WIN_SCORE} from "../battlefield-rules.mjs";

test("the attached French 156-page RUP5 core rules are indexed by rule and page",()=>{
 assert.equal(CORE_RULEBOOK.revision,"2026-10-09");
 assert.equal(CORE_RULEBOOK.pages,156);
 assert.ok(CORE_RULE_ENTRIES.length>=50);
 assert.ok(CORE_RULE_ENTRIES.some(x=>x.id==="gold"&&x.rules.includes("002")&&x.page===1));
 assert.ok(CORE_RULE_ENTRIES.some(x=>x.id==="rune"&&x.rules.includes("164")&&x.page===25));
 assert.ok(CORE_RULE_ENTRIES.some(x=>x.id==="score"&&x.rules.includes("473")&&x.page===115));
 assert.ok(CORE_RULE_ENTRIES.some(x=>x.id==="reaction"&&x.rules.includes("813")&&x.page===144));
});
test("RUP5 reference retrieval changes with the requested topic and board context",()=>{
 const runes=selectCoreRules("Je recycle une rune pour payer les coûts d'essence",{limit:8});
 assert.ok(runes.some(x=>x.topic==="rune"&&x.rule.includes("164")));
 const victory=selectCoreRules("Comment conquérir le dernier point pour gagner ?",{limit:8});
 assert.ok(victory.some(x=>x.topic==="score"&&x.rule.includes("473")));
 const reaction=selectCoreRules("Puis-je faire une Réaction pendant la chaîne ?",{limit:8});
 assert.ok(reaction.some(x=>x.topic==="reaction"&&x.rule.includes("813")));
 const pending=selectCoreRules("",{state:{phase:"Main",pendingCombat:{},pendingEffects:[]},limit:9});
 assert.ok(pending.some(x=>x.topic==="combat"));
});
test("board-based knowledge sends numbered PDF rules to AI without exposing hidden physical cards",()=>{
 let state=createState();
 state=applyCommand(state,{type:"add",player:"human",zone:"hand",card:{
  code:"SECRET-42",name:"Hidden Witness",type:"Unit",text:"Don't leak the hidden text."}});
 const rules=buildGameKnowledge(state,"Puis-je gagner par conquête avec 7 points ?",[],{ruleCount:7});
 assert.equal(rules.rulebook.revision,CORE_RULEBOOK.revision);
 assert.ok(rules.rulebook.relevant.some(x=>x.topic==="score"&&x.page===115));
 assert.ok(!JSON.stringify(rules).includes("Hidden Witness"));
 assert.ok(!JSON.stringify(rules).includes("Don't leak"));
 const reference=publicReference("Je recycle une rune pour de l'essence",[]);
 assert.ok(reference.indexedRules.some(x=>x.topic==="rune"));
 assert.equal(reference.rulebook.pages,156);
});
test("duel victory and second-player opening runes follow RUP5 in both autonomous and normal turn",()=>{
 assert.equal(DUEL_WIN_SCORE,DUEL_RULES.victoryScore);
 assert.equal(DUEL_WIN_SCORE,8);
 assert.equal(DUEL_RULES.initialHand,4);
 assert.equal(DUEL_RULES.runeDeckSize,12);
 assert.equal(duelOpeningRuneCount({turn:1,firstPlayer:"human"},"human"),2);
 assert.equal(duelOpeningRuneCount({turn:1,firstPlayer:"human"},"ai"),3);
 assert.equal(duelOpeningRuneCount({turn:1,firstPlayer:"ai"},"human"),3);
 assert.equal(duelOpeningRuneCount({turn:2,firstPlayer:"human"},"ai"),2);
 const aiSource=fs.readFileSync(new URL("../ai-turn.mjs",import.meta.url),"utf8");
 const turnSource=fs.readFileSync(new URL("../turn-upkeep.mjs",import.meta.url),"utf8");
 assert.match(aiSource,/duelOpeningRuneCount\(view,"ai"\)/);
 assert.match(turnSource,/duelOpeningRuneCount\(state,who\)/);
});
