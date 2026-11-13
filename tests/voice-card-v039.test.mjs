import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createState,applyCommand} from "../core.mjs";
import {planHumanAnnouncement} from "../player-actions.mjs";
import {rankSpokenCards,matchSpokenCard,correctSpokenCardPhrase} from "../card-voice.mjs";
import {extractJSON} from "../integrated-ai.mjs";
import {recommendLocalProfile,detectRecommendedLocalProfile,
 ADVANCED_LOCAL_MODEL,DEFAULT_LOCAL_MODEL} from "../local-ai-profiles.mjs";

const card=(name,energy=2)=>({name,code:name.replaceAll(" ","-").toUpperCase(),type:"Unit",energy,power:0});
const cards=[card("Mournful Witness"),card("Disciple of Shen"),card("Loyal Poro",1),
 card("Iron Defender"),card("Spirit of the Grove")];
function prepare(){
 let s=createState();
 s=applyCommand(s,{type:"setup-human",
  legend:card("Shen, Eye of Twilight"),champion:card("Shen, Leader of the Kinkou Order"),
  battlefield:{name:"Grove of the God Willow",code:"GROVE",type:"Battlefield"}});
 s=applyCommand(s,{type:"setup-ai",legend:card("Jinx"),champion:card("Jinx, Loose Cannon"),
  battlefield:{name:"Arena",code:"ARENA",type:"Battlefield"},
  main:Array.from({length:10},(_,i)=>card("AI "+i,1)),
  runes:Array.from({length:12},()=>({name:"Rune",code:"RUNE",type:"Rune"})),
  mainIncludesChampion:false});
 s=applyCommand(s,{type:"start",player:"human"});
 s=applyCommand(s,{type:"phase",phase:"Channel"});
 s=applyCommand(s,{type:"channel",player:"human",count:2});
 s=applyCommand(s,{type:"phase",phase:"Draw"});
 s=applyCommand(s,{type:"draw",player:"human",count:1});
 return s;
}
test("real punctuation at the end of Whisper's card name does not swallow an announced play",()=>{
 let s=prepare();
 const plan=planHumanAnnouncement("Je joue Disciple of Shen.",s,cards);
 assert.equal(plan.error,undefined,plan.error);
 assert.ok(plan.commands.some(c=>c.type==="add"&&c.card.name==="Disciple of Shen"),
  "Announced card must be added to the base, not sent to the JSON model");
 for(const command of plan.commands)s=applyCommand(s,command);
 assert.ok(s.cards.some(c=>c.owner==="human"&&c.zone==="base"&&c.name==="Disciple of Shen"));
 assert.equal(s.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.exhausted).length,2);
});
test("French-accented approximate English card names match full catalog safely",()=>{
 assert.equal(matchSpokenCard(cards,"Moundful Witness").card?.name,"Mournful Witness");
 assert.equal(matchSpokenCard(cards,"world full witness").card?.name,"Mournful Witness");
 const corrected=correctSpokenCardPhrase(cards,"Je joue Moundful Witness.");
 assert.equal(corrected.corrected,true);
 assert.equal(corrected.rawText,"Je joue Moundful Witness.");
 assert.equal(corrected.text,"Je joue Mournful Witness.");
 assert.equal(correctSpokenCardPhrase(cards,"Moundful Witness.",{expectCardName:true}).card,"Mournful Witness");
 assert.equal(matchSpokenCard(cards,"imaginary hero that does not exist").card,null);
 assert.ok(rankSpokenCards(cards,"Disciple of Shen").length>=1);
});
test("ambiguous names are suggested rather than auto-played",()=>{
 const ambiguous=[card("Loyal Poro"),card("Royal Poro")];
 const result=matchSpokenCard(ambiguous,"loyl poro");
 assert.equal(result.card,null);
 assert.ok(result.candidates.length>0);
});
test("local Qwen responses with explanatory wrappers still parse the actual JSON only",()=>{
 assert.deepEqual(extractJSON('<think>Let me reason</think>\n{"reply":"Bien reçu","commands":[]}'),
  {reply:"Bien reçu",commands:[]});
 assert.deepEqual(extractJSON('Here is the result: {"reply":"À toi","commands":[]}'),
  {reply:"À toi",commands:[]});
 assert.throws(()=>extractJSON("This is not valid game JSON"),/structurée/);
});
test("select advanced model only on sufficiently equipped dedicated GPU",()=>{
 const high=recommendLocalProfile({ramGB:32,
  gpus:[{name:"AMD Radeon RX 7900 XT",vramGB:0}]});
 assert.equal(high.model,ADVANCED_LOCAL_MODEL);
 assert.equal(high.backend,"auto");
 assert.ok(high.vramGB>=20);
 assert.equal(recommendLocalProfile({ramGB:8,
  gpus:[{name:"Intel UHD Graphics"}]}).model,DEFAULT_LOCAL_MODEL);
 assert.equal(recommendLocalProfile({ramGB:16,
  gpus:[{name:"NVIDIA GeForce RTX 4060"}]}).model,ADVANCED_LOCAL_MODEL);
 assert.equal(recommendLocalProfile({ramGB:12,
  gpus:[{name:"AMD Radeon RX 7900 XT"}]}).model,DEFAULT_LOCAL_MODEL);
 const detected=detectRecommendedLocalProfile({platform:"win32",exec:()=>JSON.stringify({
  ramBytes:34359738368,gpus:[{Name:"AMD Radeon RX 7900 XT",AdapterRAM:4294967295}]
 })});
 assert.equal(detected.model,ADVANCED_LOCAL_MODEL);
});
test("manager keeps every service visible and displays animated progress and real stall status",()=>{
 const html=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 assert.match(html,/id="activity-monitor"/);
 assert.match(html,/activity-icon/);
 assert.match(html,/@keyframes riftActivitySpin/);
 assert.match(html,/Aucun nouvel avancement depuis/);
 assert.match(html,/data-ai-model="qwen3\.5:9b-q4km"/);
 assert.match(html,/model-recommendation/);
 assert.doesNotMatch(html,/<details\b|<select\b/i);
});
