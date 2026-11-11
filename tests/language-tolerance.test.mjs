import test from "node:test";
import assert from "node:assert/strict";
import {createState,applyCommand} from "../core.mjs";
import {detectMessageLanguage,normalizePlayerAnnouncement,findAnnouncedCard,planHumanAnnouncement} from "../player-actions.mjs";

const card=(name,type="Unit",energy=1)=>({code:name.replaceAll(" ","-"),name,type,energy});
const catalog=[card("Loyal Poro"),card("Shen, Kinkou Apprentice")];
function start(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:card("Shen","Legend"),champion:card("Shen Champion"),battlefield:card("Grove","Battlefield")});
 s=applyCommand(s,{type:"start",player:"human"});
 return s;
}
const execute=(state,message,available=catalog)=>{
 const plan=planHumanAnnouncement(message,state,available);
 if(plan.error)return {state,plan};
 for(const action of plan.commands)state=applyCommand(state,action);
 return {state,plan};
};
test("mixed French/English and common typos apply one atomic real-world announcement",()=>{
 const message="Je canaliz mes deuz runnes, i draww one card, j'exahust une runne to plai Loyl Porro dans ma base, je fini mon turn";
 const before=start();
 const {state,plan}=execute(before,message);
 assert.equal(plan.error,undefined,plan.error);
 assert.equal(state.active,"ai");
 assert.equal(state.cards.filter(c=>c.owner==="human"&&c.zone==="runes").length,2);
 assert.equal(state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,1);
 assert.equal(state.cards.find(c=>c.owner==="human"&&c.zone==="base")?.name,"Loyal Poro");
 assert.equal(state.players.human.handCount,4);
 assert.equal(before.cards.filter(c=>c.zone==="runes").length,0);
 assert.ok(plan.commands.some(c=>c.type==="next-turn"));
});
test("spoken-language variants and accented, mixed syntax work across messages",()=>{
 let s=start();
 for(const message of ["j'ai channel two rune", "I piocche une carte", "j'en epuizer une rune pour play loyal poro in my base"]){
  const result=execute(s,message);
  assert.equal(result.plan.error,undefined,message+" -> "+result.plan.error);
  s=result.state;
 }
 assert.equal(s.cards.find(c=>c.zone==="base")?.name,"Loyal Poro");
 assert.equal(s.cards.filter(c=>c.zone==="runes"&&c.exhausted).length,1);
});
test("finds a unique card with small transposition/spelling errors but never invents one",()=>{
 assert.equal(findAnnouncedCard(catalog,"Loyl Porro")?.name,"Loyal Poro");
 assert.equal(findAnnouncedCard(catalog,"loyal poro")?.name,"Loyal Poro");
 assert.equal(findAnnouncedCard(catalog,"Shen Kinkou Aprentice")?.name,"Shen, Kinkou Apprentice");
 assert.equal(findAnnouncedCard(catalog,"made up no card"),null);
});
test("ambiguous near matches are rejected rather than selecting a different physical card",()=>{
 const ambiguous=[card("Loyal Poro"),card("Royal Poro")];
 assert.equal(findAnnouncedCard(ambiguous,"loyl poro"),null);
 let s=start();
 s=execute(s,"je channel 2 runes").state;
 s=execute(s,"je draw one card").state;
 const result=execute(s,"I exhaust one rune to play loyl poro in my base",ambiguous);
 assert.ok(result.plan.error);
 assert.match(result.plan.errorEN,/confirm|identify/i);
 assert.equal(result.state.revision,s.revision);
 assert.equal(result.state.cards.filter(c=>c.zone==="base").length,0);
});
test("questions, negations, hypotheticals and battlefield shortcuts never move cards",()=>{
 const s=start();
 for(const message of [
  "Can I channel two runes?",
  "Si je joue Loyal Poro dans ma base",
  "Je joue pas Loyal Poro dans ma base",
  "I don't play Loyal Poro in my base"
 ]){
  const plan=planHumanAnnouncement(message,s,catalog);
  assert.equal(plan.commands.length,0,message);
 }
 const direct=planHumanAnnouncement("I play Loyal Poro on battlefield",s,catalog);
 assert.ok(direct.error);
});
test("invalid rune announcements stay rejected even with typo tolerance",()=>{
 const s=start(),result=execute(s,"Je canalize mes trois runnes");
 assert.match(result.plan.error,/2 runes/);
 assert.equal(result.state.revision,s.revision);
});
test("language scoring preserves the dominant user's language while accepting mixed terms",()=>{
 assert.equal(detectMessageLanguage("je draw one card et je joue mon Loyal Poro"),"fr");
 assert.equal(detectMessageLanguage("I pioche one card and play my card"),"en");
 assert.equal(detectMessageLanguage("please channel two runes"),"en");
 assert.equal(detectMessageLanguage("Je chanel mes deux runes"),"fr");
 assert.match(normalizePlayerAnnouncement("j'exahust deuz runnes to plai"),/exhaust deux runes to play/);
});
