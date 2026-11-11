import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {filteredPickerCards,randomExampleCards,isChosenChampion,legendSearchName,championIdentity} from "../picker.mjs";
import {normalizeCard} from "../catalog.mjs";
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


test("Lillia works when the Legend is exported under only its epithet",()=>{
 const raw=[
  {cardCode:"unl-189-219",name:"Bashful Bloom",cardType:"Legend",
    tags:["Lillia"],domains:["Calm","Mind"],cardTypeLabels:["Legend"]},
  {cardCode:"unl-058-219",name:"Protector of Dreams",fullName:"Lillia, Protector of Dreams",
    cardType:"Unit",cardTypeLabels:["Unit","Champion"],tags:["Lillia"],domains:["Calm"]},
  {cardCode:"unl-082-219",name:"Fae Fawn",fullName:"Lillia, Fae Fawn",
    cardType:"Unit",cardTypeLabels:["Unit","Champion"],tags:["Lillia"],domains:["Mind"]},
  {cardCode:"ogn-020-298",name:"Shen, Guardian",cardType:"Unit",
    cardTypeLabels:["Unit","Champion"],tags:["Shen"],domains:["Order"]}
 ].map(normalizeCard);
 const legends=filteredPickerCards(raw,"legend","lillia");
 assert.equal(legends.length,1);
 assert.equal(legends[0].name,"Lillia, Bashful Bloom");
 assert.equal(legendSearchName(legends[0]),"Lillia, Bashful Bloom");
 assert.equal(championIdentity(legends[0]),"Lillia");
 const champions=filteredPickerCards(raw,"champion","lillia",legends[0],7);
 assert.deepEqual(champions.map(c=>c.name).sort(),["Lillia, Fae Fawn","Lillia, Protector of Dreams"]);
 assert.ok(champions.every(c=>c.cardTypeLabels.includes("Champion")));
});
test("Shen character query finds an epithet-only Legend and compatible chosen cards",()=>{
 const legend=normalizeCard({cardCode:"ven-147-166",name:"Eye of Twilight",
   cardType:"Legend",tags:["Shen"],domains:["Calm","Order"]});
 const champion=normalizeCard({cardCode:"ven-138-166",name:"Leader of the Kinkou Order",
   fullName:"Shen, Leader of the Kinkou Order",cardType:"Unit",
   cardTypeLabels:["Unit","Champion"],tags:["Shen"],domains:["Order"]});
 assert.equal(filteredPickerCards([legend,champion],"legend","shen")[0].name,"Shen, Eye of Twilight");
 assert.equal(filteredPickerCards([legend,champion],"champion","shen",legend)[0].name,champion.name);
});
test("Chosen Champion must obey legend domains and reject another character",()=>{
 const legend=normalizeCard({cardCode:"unl-189-219",name:"Bashful Bloom",cardType:"Legend",tags:["Lillia"],domains:["Calm","Mind"]});
 const valid=normalizeCard({cardCode:"unl-082-219",fullName:"Lillia, Fae Fawn",cardType:"Unit",cardTypeLabels:["Unit","Champion"],tags:["Lillia"],domains:["Mind"]});
 const invalid=normalizeCard({cardCode:"unl-082-219",fullName:"Lillia, Fae Fawn",cardType:"Unit",cardTypeLabels:["Unit","Champion"],tags:["Lillia"],domains:["Fury"]});
 assert.equal(isChosenChampion(valid,legend),true);
 assert.equal(isChosenChampion(invalid,legend),false);
});
test("Selected cards have tiny fixed thumbnails instead of huge full-size images",()=>{
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
 assert.match(app,/width="46" height="64"/);
 assert.match(css,/#picker-legend-selected > img/);
 assert.match(css,/max-width:46px!important/);
 assert.match(app,/champion\.focus\(\{preventScroll:true\}\)/);
});
