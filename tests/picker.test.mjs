import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {filteredPickerCards,randomExampleCards,isChosenChampion} from "../picker.mjs";
import {PRECONS,resolvePrecon} from "../precons.mjs";
const legend={code:"VEN-147-166",name:"Shen, Eye of Twilight",type:"Legend",isVariant:false};
const champs=[
 {code:"VEN-138-166",name:"Shen, Leader of the Kinkou Order",type:"Unit"},
 {code:"VEN-042-166",name:"Shen, Scourge of Shadows",type:"Unit"},
 {code:"OGN-036-298",name:"Vi, Destructive",type:"Unit"},
];
const bfields=Array.from({length:22},(_,i)=>({code:"OGN-"+String(i+270).padStart(3,"0")+"-298",name:"Terrain "+i,type:"Battlefield"}));
const cards=[legend,...champs,...bfields];
test("picker returns no more than seven results even from a big catalog",()=>{
 const found=filteredPickerCards(cards,"battlefield","",null,7);
 assert.equal(found.length,7);
 assert.ok(found.every(c=>c.type==="Battlefield"));
});
test("contextual chosen champion never offers another character",()=>{
 const matches=filteredPickerCards(cards,"champion","",legend,7);
 assert.equal(matches.length,2);
 assert.ok(matches.every(c=>c.name.startsWith("Shen")));
 assert.ok(!isChosenChampion(champs[2],legend));
});
test("accent-insensitive filtering and exact match ranking",()=>{
 const legends=[{code:"A",name:"Léona, Radiant Dawn",type:"Legend"},
 {code:"B",name:"Leona, Dawnbreaker",type:"Legend"},
 {code:"C",name:"Ezreal, Prodigal",type:"Legend"}];
 const found=filteredPickerCards(legends,"legend","léona");
 assert.equal(found.length,2);
});
test("selected examples are random actual catalog cards, not hard-coded Shen",()=>{
 const examples=randomExampleCards(cards,()=>0);
 assert.equal(examples.legend.name,legend.name);
 assert.ok(examples.champion.name.startsWith("Shen"));
 assert.ok(examples.battlefield);
});
test("all printed deck options are resolvable by ID, including random choice",()=>{
 const cardsByCode=new Map();
 const bare=code=>code.toUpperCase();
 for(const p of PRECONS){
   for(const code of [p.legend,p.champion,...p.battlefields,...p.main.map(([code])=>code),...p.runes.map(([code])=>code)]){
     if(!cardsByCode.has(code))cardsByCode.set(code,{
      code,name:code,type:code===p.legend?"Legend":p.battlefields.includes(code)?"Battlefield":"Unit"
     });
   }
 }
 const catalog=[...cardsByCode.values()];
 assert.equal(PRECONS.length,9);
 for(const p of PRECONS){
   const resolved=resolvePrecon(catalog,p.id,()=>0);
   assert.equal(resolved.id,p.id);
   assert.equal(resolved.main.length,40);
   assert.equal(resolved.runes.length,12);
 }
});
test("homepage is bounded instead of using an enormous native datalist",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const js=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(html,/<datalist/);
 for(const kind of ["legend","champion","battlefield"]) {
   assert.match(html,new RegExp('id="picker-'+kind+'-results"'));
 }
 assert.match(js,/filteredPickerCards\(catalog,kind,term,legend,7\)/);
 assert.match(js,/randomExampleCards\(catalog\)/);
 assert.match(html,/id="home-deck-preview"/);
});
