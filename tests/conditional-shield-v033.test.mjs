import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {compileCardAbilities,conditionalShieldRule,migrateLegacyPassivePendingEffects} from "../effect-engine.mjs";
import {effectiveMight,previewCombat} from "../combat-engine.mjs";
import {planHumanAnnouncement} from "../player-actions.mjs";
import {advanceMandatoryTurn} from "../turn-upkeep.mjs";

const text="[Hidden] (Hide now for {power:any} to react with later for {energy:0}.)\n"+
 "I have [Shield 3] while I'm at a battlefield with exactly one other unit you control. (+3 {might} while I'm a defender.)";
const disciple={code:"VEN-117",name:"Disciple of Shen",type:"Unit",
 energy:2,power:0,might:2,text};
const unit=(name,might=2)=>({name,type:"Unit",might,energy:0,power:0,text:""});
function board(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",legend:{name:"Shen",type:"Legend"},
  champion:unit("Shen Chosen"),battlefield:{name:"Grove",type:"Battlefield"}});
 s=applyCommand(s,{type:"setup-ai",legend:{name:"Jinx",type:"Legend"},
  champion:unit("Jinx Chosen"),battlefield:{name:"Arena",type:"Battlefield"},
  main:Array.from({length:20},(_,i)=>unit("AI main "+i)),
  runes:Array.from({length:12},()=>({name:"Chaos Rune",type:"Rune"})),
  mainIncludesChampion:false});
 return applyCommand(s,{type:"start",player:"human"});
}
test("Disciple of Shen printed Hidden + conditional Shield is a passive, not a pending on-play trigger",()=>{
 const compiled=compileCardAbilities(disciple);
 assert.equal(compiled.unsupported.length,0,JSON.stringify(compiled.unsupported));
 assert.deepEqual(compiled.continuous,[{
  kind:"conditional-shield",shield:3,otherFriendlyUnits:1
 }]);
 const s=applyCommand(board(),{type:"add",player:"human",card:disciple,
  zone:"base",fromHand:true});
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.cards.find(c=>c.name==="Disciple of Shen").exhausted,true);
});
test("normal spoken play of Disciple of Shen for 2 runes changes the board without a prompt",()=>{
 let s=advanceMandatoryTurn(board());
 const plan=planHumanAnnouncement("je vais jouer disciple of shen pour 2 runes",s,[disciple]);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.some(x=>x.type==="add"&&x.fromHand===true));
 for(const action of plan.commands)s=applyCommand(s,action);
 assert.equal(s.pendingEffects.length,0);
 assert.equal(s.cards.find(c=>c.name==="Disciple of Shen").zone,"base");
 assert.equal(s.cards.find(c=>c.name==="Disciple of Shen").exhausted,true);
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,2);
});
test("conditional Shield 3 applies only when defending beside exactly one allied unit",()=>{
 let s=board();
 s=applyCommand(s,{type:"add",player:"ai",card:unit("Attacker",2),
  zone:"battlefield",battlefield:0});
 s=applyCommand(s,{type:"add",player:"human",card:disciple,
  zone:"battlefield",battlefield:0});
 let discipleCard=s.cards.find(c=>c.name==="Disciple of Shen");
 assert.equal(effectiveMight(discipleCard,"defend",s),2,"alone: no Shield");
 s=applyCommand(s,{type:"add",player:"human",card:unit("Friend",1),
  zone:"battlefield",battlefield:0});
 discipleCard=s.cards.find(c=>c.name==="Disciple of Shen");
 assert.equal(effectiveMight(discipleCard,"defend",s),5);
 assert.equal(effectiveMight(discipleCard,"attack",s),2);
 assert.equal(previewCombat(s,0,"ai").defendingMight,6,"includes friend Might and Shield 3");
 s=applyCommand(s,{type:"add",player:"human",card:unit("Extra friend",1),
  zone:"battlefield",battlefield:0});
 discipleCard=s.cards.find(c=>c.name==="Disciple of Shen");
 assert.equal(effectiveMight(discipleCard,"defend",s),2,"two other allies: no Shield");
 assert.equal(previewCombat(s,0,"ai").defendingMight,4);
});
test("continuous Shield is checked from position, never granted in base or without state",()=>{
 const s=applyCommand(board(),{type:"add",player:"human",card:disciple,zone:"base"});
 const c=s.cards.find(x=>x.name==="Disciple of Shen");
 assert.equal(effectiveMight(c,"defend",s),2);
 assert.equal(effectiveMight(c,"defend"),2);
 assert.equal(conditionalShieldRule("I have [Shield 1] while my legend is ready."),null);
});
test("updating an existing save clears ONLY obsolete continuous Shield confirmations",()=>{
 const old={...board(),pendingEffects:[
  {id:"old",trigger:"other",text:text.split("\n")[1],cardName:"Disciple of Shen"},
  {id:"keep",trigger:"other",text:"When I attack, choose 2 effects.",cardName:"Unknown"}
 ]};
 const migrated=migrateLegacyPassivePendingEffects(old);
 assert.deepEqual(migrated.pendingEffects.map(x=>x.id),["keep"]);
 assert.equal(old.pendingEffects.length,2,"saved input is not mutated");
 assert.equal(applyCommand(old,{type:"note",text:"continue"}).pendingEffects.length,1);
});
test("the playmat grid cannot be auto-expanded by the visible pending effect panel",()=>{
 const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(css,/#game-app #pending-effect-panel,\s*#game-app #game-victory\s*\{\s*position:absolute/);
 assert.match(css,/body:not\(\.home-visible\) #game-app\{position:relative\}/);
 assert.match(html,/id="pending-effect-panel"/);
});
