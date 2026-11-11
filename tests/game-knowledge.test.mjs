import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {buildGameKnowledge,searchRelevantCards,publicReference,
 RULES_SOURCES,selectRules,SITE_GUIDE} from "../game-knowledge.mjs";

const catalog=[
 {code:"VEN-101",name:"Shen, Eye of Twilight",type:"Legend",text:"Legend's printed ability (test)",domains:["Order","Calm"]},
 {code:"VEN-102",name:"Shen, Leader of the Kinkou Order",type:"Unit",
  text:"Chosen Champion ability refreshed from catalogue",energy:5,power:4},
 {code:"VEN-103",name:"Grove of the God-Willow",type:"Battlefield",
  text:"Battlefield ability from the catalogue",energy:null},
 {code:"AI-201",name:"Mindful Guard",type:"Unit",text:"Guard ability printed in the source.",energy:2,power:3},
 {code:"HIDDEN-1",name:"Secret Human Card",type:"Unit",text:"Private effect should never leak."}
];
function makeGame(){
 let game=createState();
 game=applyCommand(game,{type:"setup-human",
  legend:catalog[0],champion:catalog[1],battlefield:catalog[2]});
 game=applyCommand(game,{type:"setup-ai",legend:{name:"Jinx",type:"Legend"},
  champion:{name:"Jinx, Loose Cannon",type:"Unit"},battlefield:{name:"Training Ground",type:"Battlefield"},
  main:[catalog[3],catalog[3],catalog[3],catalog[3],catalog[3]],
  runes:[{name:"Rune",type:"Rune"}],mainIncludesChampion:false});
 game=applyCommand(game,{type:"add",player:"human",zone:"hand",card:catalog[4]});
 game=applyCommand(game,{type:"add",player:"human",zone:"base",card:{name:"Public Human Unit",type:"Unit",text:"Visible"}});
 return game;
}
test("knowledge is present automatically and includes official hub, site commands and gameplay",()=>{
 assert.equal(RULES_SOURCES.coreRevision,"2026-10-09");
 assert.match(RULES_SOURCES.rulesHub,/playriftbound\.com\/fr-fr\/rules-hub/);
 assert.match(SITE_GUIDE.chat,/Entrée/);
 assert.match(SITE_GUIDE.commands,/move/);
 const rules=selectRules("Comment canaliser les runes ?",4);
 assert.ok(rules.some(x=>x.topic==="runes"));
 const combat=selectRules("Assaut et combat sur un champ de bataille",4);
 assert.ok(combat.some(x=>x.topic==="combat"));
 const banned=selectRules("Cette carte est-elle bannie en tournoi ?",4);
 assert.ok(banned.some(x=>x.topic==="legality"));
});
test("retriever prioritizes AI hand, legend, champion, battlefields and announced card",()=>{
 const game=makeGame(),knowledge=buildGameKnowledge(game,"Je déploie Shen, Leader of the Kinkou Order",catalog);
 const cards=knowledge.cards;
 assert.ok(cards.some(c=>c.name==="Mindful Guard"&&c.zone==="hand"&&c.owner==="ai"));
 assert.ok(cards.some(c=>c.name==="Shen, Eye of Twilight"));
 assert.ok(cards.some(c=>c.name==="Grove of the God-Willow"&&c.text.includes("Battlefield ability")));
 assert.ok(cards.some(c=>c.name==="Shen, Leader of the Kinkou Order"&&c.text.includes("refreshed")));
 assert.equal(knowledge.catalog.count,catalog.length);
 assert.ok(knowledge.rules.quickReference.length>0);
});
test("never leaks the human physical hand or its effects",()=>{
 const knowledge=buildGameKnowledge(makeGame(),"Je joue Shen",catalog);
 const text=JSON.stringify(knowledge);
 assert.ok(!text.includes("Secret Human Card"));
 assert.ok(!text.includes("Private effect should never leak"));
});
test("unrecognized card effects are not fabricated",()=>{
 const game=makeGame(),knowledge=buildGameKnowledge(game,"",[],{maxCards:20});
 assert.ok(knowledge.catalog.missingTexts.some(x=>x==="Jinx"));
 assert.ok(knowledge.cards.some(c=>c.name==="Jinx"&&c.text===""));
});
test("public authenticated reference searches catalog cards and returns concise rules",()=>{
 const ref=publicReference("Shen",catalog);
 assert.equal(ref.catalogCount,5);
 assert.ok(ref.matches.some(c=>c.name.includes("Shen")));
 assert.ok(ref.quickRules.length>=1);
 assert.equal(ref.sources.rulesHub,"https://playriftbound.com/fr-fr/rules-hub/");
 assert.ok(searchRelevantCards(catalog,"Je joue ShEn",5).length>=1);
});
test("code keeps the rule guide and card text in each model query",()=>{
 const code=fs.readFileSync(new URL("../integrated-ai.mjs",import.meta.url),"utf8");
 assert.match(code,/buildGameKnowledge\(game,message,catalog/);
 assert.match(code,/gameReference:/);
 assert.match(code,/Riftbound/);
 assert.match(code,/uid/);
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(server,/\/api\/ai\/reference/);
 assert.match(server,/publicReference\(query,cards\)/);
 const view=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(view,/Connaissances Riftbound préconfigurées/);
 assert.match(view,/playriftbound\.com\/fr-fr\/rules-hub/);
});
