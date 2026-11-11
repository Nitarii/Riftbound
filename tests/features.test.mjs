import test from "node:test";
import assert from "node:assert/strict";
import {PRECONS,canonicalCode,resolvePrecon} from "../precons.mjs";
import {normalizeCard,decodeCards,piltoverImage,searchCards} from "../catalog.mjs";
import {parseNarration} from "../narration.mjs";
import {createState,applyCommand} from "../core.mjs";
const fakeCatalog=()=>{
 const codes=new Set();
 for(const p of PRECONS){
   codes.add(p.legend);codes.add(p.champion);
   for(const b of p.battlefields)codes.add(b);
   for(const [code] of p.main)codes.add(code);
   for(const [code] of p.runes)codes.add(code);
 }
 return [...codes].map(code=>({
   code:code+"-"+(code.startsWith("OGN")?"298":"221"),
   name:code=== "SFD-110"?"Fiora, Peerless":code==="SFD-026"?"Rumble, Hotheaded":code,
   type:["SFD-205","SFD-181"].includes(code)?"Legend":
      ["SFD-213","SFD-221","SFD-218","SFD-212","SFD-215","SFD-220"].includes(code)?"Battlefield":
      ["OGN-214","OGN-126","OGN-089","OGN-007"].includes(code)?"Rune":"Unit",
   image:"https://cmsassets.rgpub.io/sanity/cards/example.png",domains:["Order"],tags:["Fiora"]
 }));
};
test("canonicalize Riot full codes without corrupting short collector IDs",()=>{
 assert.equal(canonicalCode("sfd-110-221"),"SFD-110");
 assert.equal(canonicalCode("OGN-007/298"),"OGN-007");
 assert.equal(canonicalCode("VEN-SP2-006"),"VEN-SP2-006");
 assert.equal(piltoverImage("sfd-110-221"),"https://cdn.piltoverarchive.com/cards/SFD-110.webp");
});
test("normalize Riot-derived gallery fields and corrected text",()=>{
 const c=normalizeCard({card_code:"rad-042-167",full_name:"Orianna, Exquisite",card_type:"Unit",
  ability_effective:"Corrected text",image_url:"https://cmsassets.rgpub.io/sanity/images/test.png",
  domains:["Calm"],set_code:"rad",card_set:"Radiance",tags:["Orianna"]});
 assert.equal(c.name,"Orianna, Exquisite");assert.equal(c.text,"Corrected text");
 assert.equal(c.code,"rad-042-167");assert.equal(c.set,"Radiance");
 assert.equal(c.imageFallback,"https://cdn.piltoverarchive.com/cards/RAD-042.webp");
 const result=decodeCards([c,c]);assert.equal(result.length,1);
 assert.equal(searchCards(result,"Orianna", "Unit").length,1);
});
test("official 40-card precons reconstruct exactly and set aside champion",()=>{
 const cards=fakeCatalog();
 for(const pre of PRECONS){
   const d=resolvePrecon(cards,pre.id,()=>0);
   assert.equal(d.main.length,40,pre.id);
   assert.equal(d.runes.length,12,pre.id);
   assert.equal(d.battlefields.length,3,pre.id);
   const s=applyCommand(createState(),{type:"setup-ai",...d,format:"preconstructed",mainIncludesChampion:true,deckName:d.label});
   assert.equal(s.players.ai.handCount,4);
   assert.equal(s.players.ai.deckCount,35);
   assert.equal(s.decks.ai.main.length,35);
   assert.equal(s.cards.filter(c=>c.zone==="champion"&&c.owner==="ai").length,1);
 }
});
test("all printed preconstructed decks have expected champions and 40 + 12 cards",()=>{
 assert.equal(PRECONS.length,9);
 const ids=new Set(PRECONS.map(p=>p.id));
 for(const id of ["jinx","viktor","lee-sin","fiora","rumble","vi","vex","shen","zed"])assert.ok(ids.has(id));
 for(const p of PRECONS){
  assert.equal(p.main.reduce((n,[,qty])=>n+qty,0),40,p.id);
  assert.equal(p.runes.reduce((n,[,qty])=>n+qty,0),12,p.id);
  assert.equal(p.battlefields.length,3,p.id);
 }
 const jinx=PRECONS.find(p=>p.id==="jinx");
 assert.match(jinx.warning,/interdites/);
});
test("random precon selection is bounded",()=>{
 assert.equal(resolvePrecon(fakeCatalog(),"random",()=>0).id,"jinx");
 assert.equal(resolvePrecon(fakeCatalog(),"random",()=>0.99).id,"rumble");
});
test("French declarations produce safe, explicit bookkeeping commands",()=>{
 const cards=[{code:"SFD-110",name:"Fiora, Peerless",type:"Unit",isVariant:false}];
 assert.deepEqual(parseNarration("je pioche deux cartes",cards).command,{type:"draw",player:"human",count:2});
 assert.deepEqual(parseNarration("l'IA canalise 3 runes",cards).command,{type:"channel",player:"ai",count:3});
 assert.deepEqual(parseNarration("je gagne un point",cards).command,{type:"score",player:"human",value:1});
 assert.equal(parseNarration("je termine mon tour",cards).command.type,"next-turn");
 const p=parseNarration("je pose Fiora, Peerless sur le terrain de l'IA",cards);
 assert.equal(p.command.type,"add");
 assert.equal(p.command.zone,"battlefield");
 assert.equal(p.command.battlefield,1);
 assert.match(parseNarration("je joue une carte inconnue dans ma base",cards).error,/non trouvée/);
 assert.equal(parseNarration("je t'attaque avec tout",cards),null);
});
