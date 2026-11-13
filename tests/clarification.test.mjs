import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {planHumanAnnouncement,findAnnouncedCard} from "../player-actions.mjs";
import {makeCardClarification,resolveCardClarification,isPendingValid} from "../clarification.mjs";
const catalog=[
 {code:"UNL-156/219",name:"Loyal Poro",type:"Unit",energy:1},
 {code:"OGN-202/300",name:"Shen, Leader of the Kinkou Order",type:"Unit",energy:3}
];
function setup(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:{name:"Shen Legend",type:"Legend"},
  champion:{name:"Shen chosen",type:"Unit"},battlefield:{name:"Grove",type:"Battlefield"}});
 s=applyCommand(s,{type:"start",player:"human"});
 return s;
}
function execute(state,text){
 const p=planHumanAnnouncement(text,state,catalog);
 if(p.error)return {state,plan:p};
 for(const cmd of p.commands)state=applyCommand(state,cmd);
 return {state,plan:p};
}
test("unknown card prompts a short clarification instead of invoking the model",()=>{
 const s=setup(),speech="je canalise deux runes je pioche une carte j'exhaust une rune et je joue le loyal taureau dans ma base";
 const p=planHumanAnnouncement(speech,s,catalog);
 assert.equal(p.needsClarification?.kind,"card");
 const pending=makeCardClarification({announcement:speech,query:p.needsClarification.query,
  revision:s.revision,catalog,now:1000});
 assert.deepEqual(pending.suggestions.map(x=>x.name),["Loyal Poro"]);
 const unclear=resolveCardClarification(pending,"taureau loyal",catalog,s,{now:1100});
 assert.equal(unclear.status,"waiting");
 assert.match(unclear.message,/Loyal Poro/);
 assert.equal(s.cards.filter(c=>c.zone==="base").length,0);
 const answer=resolveCardClarification(pending,"oui",catalog,s,{now:1200});
 assert.equal(answer.status,"confirmed");
 assert.match(answer.announcement,/Loyal Poro/);
 const done=execute(s,answer.announcement);
 assert.equal(done.plan.error,undefined,done.plan.error);
 assert.equal(done.state.cards.find(c=>c.zone==="base")?.name,"Loyal Poro");
 assert.equal(done.state.cards.filter(c=>c.zone==="runes"&&c.exhausted).length,1);
});
test("clarification cannot conceal an invalid payment; it is applied atomically",()=>{
 const s=setup(),speech="je canalise deux runes je pioche une carte j'en exhaust 3 et je joue loyal taureau dans ma base";
 const p=planHumanAnnouncement(speech,s,[{...catalog[0],energy:3}]);
 assert.equal(p.needsClarification?.kind,"card");
 const cards=[{...catalog[0],energy:3}];
 const pending=makeCardClarification({announcement:speech,query:p.needsClarification.query,revision:s.revision,catalog:cards,now:1000});
 const answer=resolveCardClarification(pending,"Loyal Poro",cards,s,{now:1001});
 assert.equal(answer.status,"confirmed");
 const next=planHumanAnnouncement(answer.announcement,s,cards);
 assert.match(next.error,/Paiement invalide|runes/);
 assert.equal(s.revision,pending.revision);
 assert.equal(s.cards.filter(c=>c.zone==="runes").length,0);
});
test("a pending correction expires after a board change or five minutes",()=>{
 const s=setup(),p=makeCardClarification({announcement:"je joue loyal taureau",query:"loyal taureau",revision:s.revision,catalog,now:1000});
 assert.equal(isPendingValid(p,s,1300),true);
 assert.equal(resolveCardClarification(p,"oui",catalog,s,{now:301002}).status,"stale");
 const altered=applyCommand(s,{type:"note",text:"Manual edit"});
 assert.equal(resolveCardClarification(p,"oui",catalog,altered,{now:1200}).status,"stale");
});
test("correction supports explicit card name, reversed name, cancel and option selection",()=>{
 const s=setup(),p=makeCardClarification({announcement:"je joue loyal taureau dans ma base",query:"loyal taureau",revision:s.revision,catalog,now:1000});
 assert.equal(resolveCardClarification(p,"Loyal Poro",catalog,s,{now:1100}).status,"confirmed");
 assert.equal(resolveCardClarification(p,"Poro Loyal",catalog,s,{now:1100}).status,"confirmed");
 assert.equal(resolveCardClarification(p,"le premier",catalog,s,{now:1100}).status,"confirmed");
 assert.equal(resolveCardClarification(p,"non",catalog,s,{now:1100}).status,"cancel");
 assert.equal(findAnnouncedCard(catalog,"poro loyal")?.name,"Loyal Poro");
});
test("real played units and moved units show exhausted; awaken readies them",()=>{
 let s=setup();
 s=applyCommand(s,{type:"add",player:"human",fromHand:true,card:catalog[0],zone:"base"});
 assert.equal(s.cards.find(c=>c.name==="Loyal Poro").exhausted,true);
 assert.throws(()=>applyCommand(s,{type:"move",uid:s.cards.find(c=>c.name==="Loyal Poro").uid,zone:"battlefield",battlefield:0}),/épuisée/);
 s=applyCommand(s,{type:"next-turn"});
 s=applyCommand(s,{type:"next-turn"});
 assert.equal(s.cards.find(c=>c.name==="Loyal Poro").exhausted,false);
 const uid=s.cards.find(c=>c.name==="Loyal Poro").uid;
 s=applyCommand(s,{type:"phase",phase:"Main"});
 s=applyCommand(s,{type:"move",uid,zone:"battlefield",battlefield:0});
 assert.equal(s.cards.find(c=>c.uid===uid).exhausted,true);
});
test("board ships playmat zones, an uncut card-art wrapper and live transcription",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 for(const owner of ["human","ai"])for(const zone of ["legend","champion","base","decks","runes","hand","trash"])
  assert.ok(html.includes('id="'+owner+"-"+zone+'"'),owner+"-"+zone);
 assert.equal((html.match(/class="playmat"/g)||[]).length,2);
 assert.match(html,/id="voice-heard"/);
 assert.match(css,/\.card-tile\.exhausted \.card-art/);
 assert.match(app,/displayHeard\(text,true\)/);
 assert.match(app,/data-card-state="exhausted"/);
});
