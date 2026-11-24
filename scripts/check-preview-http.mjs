// A real Windows SEA test. The installed client and its saves are never touched.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {CURRENT_VERSION} from "../release-policy.mjs";
import {previewCombat} from "../combat-engine.mjs";

const port=21966,origin="http://127.0.0.1:"+port;
const token=crypto.randomBytes(20).toString("hex");
const dist=path.resolve("dist");
const app=path.join(dist,"RiftboundCompanion.exe");
const root=await fs.mkdtemp(path.join(dist,"test-http-"));
const soulspinner={name:"Soulspinner",type:"Unit",code:"VEN-123",energy:3,might:3};
const discipline={name:"Discipline",type:"Spell",code:"OGN-058",energy:2};
const musicians={name:"Field Musicians",type:"Unit",code:"VEN-026",energy:4,might:3};
const lunar={name:"Lunar Boon",type:"Spell",code:"UNL-125",energy:3,domains:["Chaos"],
 text:"[Reaction] (Play any time, even before spells and abilities resolve.)\nDiscard 1, then draw 2."};
const poro={name:"Loyal Poro",type:"Unit",code:"UNL-156",energy:1,might:2};
// Supply the catalogue locally so the spoken reveal smoke is independent of the CDN.
await fs.writeFile(path.join(root,".riftbound-catalog-cache.json"),JSON.stringify({updatedAt:Date.now(),
 cards:[soulspinner,discipline,musicians,lunar,poro,...Array.from({length:500},(_,i)=>({name:"Test catalogue "+i,type:"Unit",code:"TEST-"+i}))]}));
let child,closed;
function launch(){
 child=spawn(app,["--no-browser"],{cwd:root,windowsHide:true,stdio:"ignore",env:{
  ...process.env,PORT:String(port),RIFTBOUND_TOKEN:token,RIFTBOUND_PORTABLE_TEST:"1",
  RIFTBOUND_DATA_DIR:root,RIFTBOUND_NO_BROWSER:"1",RIFTBOUND_TEST_NO_MIGRATION:"1"
 }});
 closed=once(child,"close");
 void closed.catch(()=>{});
}
async function request(route,body,authenticated=true){
 const response=await fetch(origin+route,{
  signal:AbortSignal.timeout(2500),
  method:body?"POST":"GET",
  headers:{...(authenticated?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const type=response.headers.get("content-type");
 return {status:response.status,value:type?.includes("json")?await response.json():await response.text()};
}
const cmd=(command,ifRevision)=>request("/api/command",{
 commandId:crypto.randomUUID(),...command,ifRevision
});
async function waitForAnnouncement(id){
 for(let i=0;i<30;i++){
  const {value:thread}=await request("/api/messages");
  const message=thread.messages.find(m=>m.id===id);
  if(message?.table?.status&&message.table.status!=="pending")return message;
  await delay(50);
 }
 throw Error("Announcement did not reach a final status");
}
async function ready(){
 for(let i=0;i<40;i++){
  try{const health=(await request("/api/health")).value;if(health.ok)return health;}catch{}
  await delay(150);
 }
 throw Error("Windows companion did not start");
}
async function stop(){
 const stopped=await request("/api/manager/stop",{confirm:"STOP_RIFTBOUND"});
 assert.equal(stopped.value.ok,true);
 await Promise.race([closed,delay(6000,null,{ref:false}).then(()=>{throw Error("Windows companion did not exit");})]);
}
launch();
try{
 const health=await ready();
 assert.equal(health?.version,CURRENT_VERSION);
 assert.equal(health.packaged,true);
 assert.equal((await request("/api/state",null,false)).status,401);
 assert.equal((await request("/api/speech/synthesis",{text:"test"},false)).status,401);
 assert.match((await request("/verified-cards.mjs")).value,/verifiedSpell/);
 assert.match((await request("/public-table.mjs")).value,/publicTableReply/);
 assert.match((await request("/card-voice.mjs")).value,/matchSpokenCard/);
 assert.match((await request("/manager.html")).value,/ai-rules-only/);
 const initial=(await request("/api/state")).value.state;
 const input={type:"note",ifRevision:initial.revision,commandId:crypto.randomUUID(),text:"test unique"};
 const first=await request("/api/command",input);
 const duplicate=await request("/api/command",input);
 assert.equal(first.value.receipt.status,"applied");
 assert.equal(duplicate.value.receipt.status,"duplicate");
 assert.equal(first.value.state.revision,duplicate.value.state.revision);
 const revision=first.value.state.revision;
 const race=await Promise.all([cmd({type:"note",text:"A"},revision),cmd({type:"note",text:"B"},revision)]);
 assert.deepEqual(race.map(x=>x.status).sort(),[200,400]);
 const rolled=await cmd({type:"undo"},revision+1);
 assert.equal(rolled.value.state.revision,revision+2);
 assert.equal(rolled.value.state.history[1].text,"test unique");
 const card=(name,type="Unit")=>({name,type,energy:2,power:0,might:3});
 const zedDeck={type:"setup-ai",legend:card("Zed","Legend"),champion:card("Zed Champion"),
  battlefield:card("Zaun","Battlefield"),main:Array.from({length:12},(_,i)=>card("Secret "+i)),
  runes:Array.from({length:12},()=>card("Fury Rune","Rune")),mainIncludesChampion:false};
 let response=await cmd(zedDeck,rolled.value.state.revision);
 const hidden=response.value.state;
 assert.equal(hidden.players.ai.handCount,4);
 assert.ok(hidden.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").every(c=>!c.name&&c.faceDown));
 assert.equal(hidden.decks,undefined);
 assert.equal(hidden.rng,undefined);
 assert.ok(!(JSON.stringify(hidden).includes("Secret")));
 const shenDeck={type:"setup-human",legend:card("Shen","Legend"),champion:card("Shen Champion"),
  battlefield:card("Grove","Battlefield")};
 response=await cmd(shenDeck,hidden.revision);
 assert.equal((await request("/api/ai/rules/activate",{})).value.rulesOnly,true);
 response=await cmd({type:"start",player:"ai"},response.value.state.revision);
 assert.equal(response.status,200);
 let state;
 for(let i=0;i<40;i++){
  state=(await request("/api/state")).value.state;
  if(state.active==="human")break;
  await delay(75);
 }
 assert.equal(state.active,"human","the AI finishes its turn on a fresh install without model files");
 const added=await cmd({type:"add",player:"human",card:card("Test Scout"),zone:"base"},state.revision);
 const scout=added.value.state.cards.find(c=>c.name==="Test Scout");
 const move=await cmd({type:"move",uid:scout.uid,zone:"battlefield",battlefield:0},added.value.state.revision);
 assert.equal(move.value.state.players.human.score,0);
 assert.equal(move.value.state.pendingCombat.focus,"human");
 await cmd({type:"combat-pass",player:"human"},move.value.state.revision);
 for(let i=0;i<40;i++){
  state=(await request("/api/state")).value.state;
  if(state.players.human.score===1)break;
  await delay(75);
 }
 assert.equal(state.players.human.score,1);
 assert.equal(state.pendingCombat,null);
 assert.equal((await request("/api/ai/disable",{})).status,200);
 async function apply(action){
  const result=await cmd(action,state.revision);
  assert.equal(result.status,200,result.value.error);
  state=result.value.state;
  return state;
 }
 const put=(player,value,zone,battlefield)=>apply({type:"add",player,card:value,zone,battlefield});
 await apply({type:"reset"});
 await apply(shenDeck);
 await apply(zedDeck);
 await apply({type:"start",player:"ai"});
 await apply({type:"phase",phase:"Main"});
 for(const player of ["human","ai"])await apply({type:"score",player,set:true,value:6});
 const disciple={...card("Disciple of Shen"),code:"VEN-117",might:1,
  text:"I have [Shield 3] while I'm at a battlefield with exactly one other unit you control."};
 await put("human",disciple,"battlefield",0);
 for(const domain of ["Order","Order","Calm"])
  await put("human",{...card(domain+" Rune","Rune"),domains:[domain]},"runes");
 await put("ai",{...card("Blade Twirler"),code:"VEN-002",might:4},"base");
 await put("ai",{...card("Shadow Assassin"),code:"VEN-013",might:5},"base");
 const blade=state.cards.find(c=>c.code==="VEN-002");
 const assassin=state.cards.find(c=>c.code==="VEN-013");
 await apply({type:"combat-attack",player:"ai",uids:[blade.uid,assassin.uid],battlefield:0,burnPlayer:"ai"});
 const opening=await apply({type:"combat-pass",player:"ai"});
 const burned=opening.cards.find(c=>c.owner==="ai"&&c.zone==="trash");
 assert.ok(burned,"Blade Twirler milled a card face up");
 assert.equal(opening.pendingCombat.focus,"human");
 assert.equal((await request("/api/ai/rules/activate",{})).value.rulesOnly,true);
 const totals=await request("/api/messages",{text:"Quelle est la force provisoire en attaque et en défense ?"});
 await waitForAnnouncement(totals.value.message.id);
 const replies=(await request("/api/messages?after="+totals.value.message.id)).value.messages;
 assert.ok(replies.some(message=>message.role==="ai"&&/9.*1.*avant les réactions/.test(message.text)));
 assert.equal((await request("/api/state")).value.state.revision,opening.revision);
 assert.equal((await request("/api/ai/disable",{})).status,200);
 await apply({type:"play-physical",ambush:true,card:soulspinner,battlefield:0});
 assert.equal(previewCombat(state,0,"ai").defendingMight,7);
 await apply({type:"combat-order",player:"human",uids:[assassin.uid,blade.uid]});
 await apply({type:"combat-pass",player:"ai"});
 await apply({type:"combat-pass",player:"human"});
 assert.equal(state.pendingCombat,null);
 assert.equal(state.players.ai.score,7);
 assert.deepEqual(state.scoredFields.ai,[0]);
 const abandonedRevision=state.revision;
 await stop();
 launch();
 await ready();
 assert.equal((await request("/api/state")).value.state.revision,abandonedRevision);
 assert.equal((await cmd({type:"rewind-combat"},opening.revision)).status,400);
 const announcement={text:"Non, on annulait ça. Reviens au moment où tu m’attaques.",requestId:crypto.randomUUID()};
 const rewind=await request("/api/messages",announcement);
 assert.equal(rewind.status,200);
 assert.equal((await request("/api/messages",announcement)).value.message.id,rewind.value.message.id);
 const message=await waitForAnnouncement(rewind.value.message.id);
 assert.equal(message?.table?.status,"applied");
 state=(await request("/api/state")).value.state;
 assert.equal(state.revision,abandonedRevision+1);
 assert.equal(message.table.revision,state.revision);
 assert.equal(state.history[0].rewoundTo,opening.revision);
 assert.equal(state.combatRewindId,undefined);
 assert.equal(state.decks,undefined);
 assert.deepEqual(state.pendingCombat,opening.pendingCombat);
 assert.deepEqual(state.players,opening.players);
 assert.deepEqual(state.scoredFields,opening.scoredFields);
 assert.deepEqual(state.cards,opening.cards);
 assert.equal(state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length,3);
 assert.equal(state.cards.filter(c=>c.owner==="ai"&&c.zone==="trash")[0].uid,burned.uid);
 assert.equal(previewCombat(state,0,"ai").attackingMight,9);
 assert.equal(previewCombat(state,0,"ai").defendingMight,1);
 const board=await request("/api/messages",{text:"Tu peux m’afficher l’état du plateau actuel ?"});
 const boardHandled=await waitForAnnouncement(board.value.message.id);
 assert.deepEqual(boardHandled.table,{status:"unchanged",revision:state.revision});
 const boardReply=(await request("/api/messages?after="+board.value.message.id)).value.messages.at(-1);
 assert.deepEqual(boardReply.view,{kind:"board"});
 assert.match(boardReply.text,/6–6.*\n.*IA attaque à 9, Joueur défend à 1/);
 assert.match(boardReply.text,/runes prêtes 2 Order, 1 Calm/);
 assert.doesNotMatch(boardReply.text,/Soulspinner|Secret \d/);
 await stop();
 launch();
 await ready();
 assert.equal((await request("/api/messages",announcement)).value.message.id,rewind.value.message.id);
 assert.equal((await request("/api/state")).value.state.revision,state.revision);
 assert.equal((await request("/api/messages",{...announcement,text:"Je passe."})).status,400);
 await apply({type:"combat-pass",player:"human"});
 await apply({type:"next-turn"});
 assert.equal((await cmd({type:"rewind-combat"},state.revision)).status,400);
 await apply({type:"reset"});
 await apply({...shenDeck,battlefield:{...card("Targon's Peak","Battlefield"),code:"OGN-289",
  text:"When you conquer here, ready up to 2 runes at the end of this turn."}});
 await apply(zedDeck);
 await apply({type:"start",player:"human"});
 await put("human",disciple,"base");
 for(const domain of ["Calm","Order"])await put("human",{...card(domain+" Rune","Rune"),domains:[domain]},"runes");
 const selected=state.cards.filter(c=>c.zone==="runes"&&c.owner==="human"&&c.domains.length).map(c=>c.uid);
 assert.equal(selected.length,2);
 for(const uid of selected)await apply({type:"exhaust",uid});
 await apply({type:"move",uid:state.cards.find(c=>c.code==="VEN-117").uid,zone:"battlefield",battlefield:0});
 await apply({type:"combat-pass",player:"human"});
 await apply({type:"combat-pass",player:"ai"});
 assert.equal(state.spellChain.items.at(-1).ability,"card-text");
 assert.equal(state.delayedEnding,undefined);
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.delayedEnding?.length,1);
 assert.deepEqual(state.pendingEffects,[]);
 const end=await request("/api/messages",{text:"Je termine mon tour."});
 assert.equal((await waitForAnnouncement(end.value.message.id)).table.status,"applied");
 state=(await request("/api/state")).value.state;
 const endingChoice=state.pendingEffects[0];
 assert.equal(endingChoice.trigger,"ending-ready-runes");
 await stop();
 launch();
 await ready();
 assert.deepEqual((await request("/api/state")).value.state.pendingEffects[0],endingChoice);
 const readyRunes=await request("/api/messages",{text:"Je redresse une Calm et une Order."});
 assert.equal((await waitForAnnouncement(readyRunes.value.message.id)).table.status,"applied");
 state=(await request("/api/state")).value.state;
 assert.deepEqual(state.spellChain.items[0].runeUids,selected);
 assert.ok(state.cards.filter(c=>selected.includes(c.uid)).every(c=>c.exhausted));
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.active,"ai");
 assert.equal(state.phase,"Main");
 assert.equal(state.spellChain,null);
 assert.ok(state.cards.filter(c=>selected.includes(c.uid)).every(c=>!c.exhausted));
 await apply({type:"reset"});
 await apply({...shenDeck,legend:{...card("Shen, Eye of Twilight","Legend"),code:"VEN-147"}});
 await apply(zedDeck);
 await apply({type:"start",player:"human"});
 await put("human",{...card("Shen, Scourge of Shadows"),code:"VEN-042",might:6},"base");
 await put("human",{...card("Pakaa Protector"),code:"VEN-033",might:4},"base");
 await put("human",{...card("Hand Hammer","Gear"),code:"VEN-027",might:1},"base");
 await put("human",{...card("Calm Rune","Rune"),domains:["Calm"]},"runes");
 await put("ai",{...card("Chemtech Enforcer"),code:"OGN-003",might:2},"battlefield",0);
 await apply({type:"equip",player:"human",uid:state.cards.find(c=>c.code==="VEN-027").uid,
  targetUid:state.cards.find(c=>c.code==="VEN-042").uid});
 const group=await request("/api/messages",{text:"J’attaque le Grove avec Shen et Paka Protector."});
 assert.equal((await waitForAnnouncement(group.value.message.id)).table.status,"applied");
 state=(await request("/api/state")).value.state;
 assert.equal(state.spellChain.items[0].ability,"pakaa-reveal");
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.pendingEffects[0].trigger,"pakaa-reveal");
 const counts=state.players.human;
 await stop();
 launch();
 await ready();
 const revealed={text:"Je révèle Soul Spinner.",requestId:crypto.randomUUID()};
 const reel=await request("/api/messages",revealed);
 assert.equal((await waitForAnnouncement(reel.value.message.id)).table.status,"applied");
 assert.equal((await request("/api/messages",revealed)).value.message.id,reel.value.message.id);
 state=(await request("/api/state")).value.state;
 assert.equal(state.spellChain,null);
 assert.equal(state.players.human.handCount,counts.handCount+1);
 assert.equal(state.players.human.deckCount,counts.deckCount-1);
 assert.ok(!state.cards.some(c=>c.code==="VEN-123"));
 const shen=await request("/api/messages",{text:"J’active ma légende Shen sur Pakaa Protector."});
 assert.equal((await waitForAnnouncement(shen.value.message.id)).table.status,"applied");
 state=(await request("/api/state")).value.state;
 assert.equal(state.spellChain.items[0].ability,"shen-tank");
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.cards.find(c=>c.code==="VEN-033").counters.tempTank,true);
 await apply({type:"combat-pass",player:"ai"});
 await apply({type:"combat-pass",player:"human"});
 assert.equal(state.history[0].combat.attackingMight,13);
 assert.equal(state.history[0].combat.defendingMight,2);
 const announce=async (text,status="applied")=>{
  const posted=await request("/api/messages",{text,requestId:crypto.randomUUID()});
  assert.equal(posted.status,200,posted.value.error);
  assert.equal((await waitForAnnouncement(posted.value.message.id)).table.status,status);
  state=(await request("/api/state")).value.state;
  return state;
 };
 const witness={...card("Mournful Witness"),code:"VEN-028",might:2};
 const reveler={...card("Twilight Reveler"),code:"VEN-096",might:3};
 const r02="Je joue Discipline sur Mournful Witness et avec Witness j’attaque le Grove.";
 async function prepareFollowUp(attacker,spoken){
  await apply({type:"reset"});
  await apply(shenDeck);
  await apply(zedDeck);
  await apply({type:"start",player:"human"});
  await put("human",attacker,"base");
  await put("ai",reveler,"battlefield",0);
  if(attacker===disciple){
   for(let i=0;i<2;i++)await put("human",card("Calm Test Rune","Rune"),"runes");
  }
  const uid=state.cards.find(c=>c.code===attacker.code).uid;
  await announce(spoken);
  assert.deepEqual(state.queuedAttack,{battlefield:0,uids:[uid]});
  assert.equal(state.pendingFollowUp,undefined);
  return uid;
 }
 const witnessUid=await prepareFollowUp(witness,r02);
 const deckBefore=state.players.human.deckCount,handBefore=state.players.human.handCount;
 await apply({type:"chain-pass",player:"human"});
 await stop();
 launch();
 await ready();
 assert.deepEqual((await request("/api/state")).value.state.queuedAttack,{battlefield:0,uids:[witnessUid]});
 const finalPass={type:"chain-pass",player:"ai",ifRevision:state.revision,commandId:crypto.randomUUID()};
 const finished=await request("/api/command",finalPass);
 assert.equal(finished.status,200,finished.value.error);
 assert.deepEqual(finished.value.receipt.actions,["chain-pass","combat-attack"]);
 state=finished.value.state;
 assert.equal(state.queuedAttack,undefined);
 assert.equal(state.spellChain,null);
 assert.equal(state.players.human.deckCount,deckBefore-1);
 assert.equal(state.players.human.handCount,handBefore+1);
 assert.equal(previewCombat(state,0,"human").attackingMight,4);
 assert.equal(previewCombat(state,0,"human").defendingMight,3);
 const retry=await request("/api/command",finalPass);
 assert.equal(retry.value.receipt.status,"duplicate");
 assert.equal(retry.value.state.revision,state.revision);
 const discipleUid=await prepareFollowUp(disciple,"Le bonus de Field Musicians sur Disciple, puis j’attaque le Grove.");
 const savedChain=state.spellChain;
 await announce("Attends.");
 assert.deepEqual(state.spellChain,savedChain);
 assert.equal(state.queuedAttack,undefined);
 await stop();
 launch();
 await ready();
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.pendingCombat,null);
 assert.equal(state.cards.find(c=>c.uid===discipleUid).counters.tempMight,3);
 const blockedWitness=await prepareFollowUp(witness,r02);
 await apply({type:"exhaust",uid:blockedWitness});
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.pendingCombat,null);
 assert.equal(state.spellChain,null);
 assert.equal(state.queuedAttack,undefined);
 assert.equal(state.cards.find(c=>c.uid===blockedWitness).counters.tempMight,2);
 assert.match(state.message,/Attaque annoncée non appliquée/);
 await apply({type:"reset"});
 await apply(shenDeck);
 await apply(zedDeck);
 await apply({type:"start",player:"ai"});
 await put("ai",card("Fury Rune","Rune"),"runes");
 await put("ai",{...card("Ruthless Strike","Spell"),code:"VEN-008",energy:3,
  image:"https://example.test/ruthless-strike.png"},"hand");
 await put("ai",{...card("Public Discard"),code:"TEST-DISCARD"},"hand");
 await put("ai",{...card("Confidential Preview Unit"),code:"TEST-PRIVATE"},"hand");
 await put("human",witness,"battlefield",0);
 const strikeUid=state.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").at(-3).uid;
 const discardUid=state.cards.filter(c=>c.owner==="ai"&&c.zone==="hand").at(-2).uid;
 await apply({type:"cast",player:"ai",uid:strikeUid,targetUid:state.cards.find(c=>c.code==="VEN-028").uid,discardUid});
 const inspect=await request("/api/messages",{text:"Je vois pas la carte Ruthless Strike."});
 assert.deepEqual((await waitForAnnouncement(inspect.value.message.id)).table,{status:"unchanged",revision:state.revision});
 const cardReply=(await request("/api/messages?after="+inspect.value.message.id)).value.messages.at(-1);
 assert.deepEqual(cardReply.view,{kind:"card",uid:strikeUid});
 assert.match(cardReply.text,/Ruthless Strike.*Mournful Witness.*5 dégâts prévus/);
 assert.equal(state.cards.find(c=>c.uid===strikeUid).image,"https://example.test/ruthless-strike.png");
 const hiddenInspect=await request("/api/messages",{text:"Montre-moi la carte Confidential Preview Unit."});
 await waitForAnnouncement(hiddenInspect.value.message.id);
 const hiddenReply=(await request("/api/messages?after="+hiddenInspect.value.message.id)).value.messages.at(-1);
 assert.equal(hiddenReply.view,undefined);
 assert.doesNotMatch(hiddenReply.text,/Confidential Preview Unit/);
 await apply({type:"reset"});
 const leader={...card("Shen, Leader of the Kinkou Order"),code:"VEN-138",energy:6,power:2,might:7,domains:["Order"]};
 await apply({...shenDeck,champion:leader});
 await apply(zedDeck);
 await apply({type:"start",player:"human"});
 await announce("Je canalise deux Order.");
 const openingRunes=state.cards.filter(c=>c.owner==="human"&&c.zone==="runes").map(c=>c.uid);
 for(const domain of ["Calm","Calm","Calm","Order"])
  await put("human",{...card(domain+" Rune","Rune"),domains:[domain]},"runes");
 await put("ai",{...card("Raging Soul"),might:5},"battlefield",1);
 for(const player of ["human","ai"])await apply({type:"score",player,value:5,set:true});
 const championUid=state.cards.find(c=>c.code===leader.code).uid;
 const paymentRevision=state.revision;
 const payment="Je joue mon champion choisi, six runes épuisées, je recycle deux Order.";
 await announce(payment.replace("six","cinq"),"rejected");
 assert.equal(state.revision,paymentRevision);
 const humanBefore=state.players.human;
 const namedPayment=payment.replace("mon champion choisi",leader.name);
 await announce(namedPayment,"clarification");
 assert.equal(state.revision,paymentRevision);
 assert.equal(state.cards.find(c=>c.uid===championUid).zone,"champion");
 await stop();
 launch();
 await ready();
 const placeChampion=await request("/api/messages",{text:"En base.",requestId:crypto.randomUUID()});
 assert.equal((await waitForAnnouncement(placeChampion.value.message.id)).table.status,"applied");
 assert.match((await request("/api/messages?after="+placeChampion.value.message.id)).value.messages.at(-1).text,/Shen.*jouée en base/);
 state=(await request("/api/state")).value.state;
 assert.equal(state.cards.find(c=>c.uid===championUid).zone,"base");
 assert.equal(state.players.human.handCount,humanBefore.handCount);
 assert.equal(state.players.human.runeCount,humanBefore.runeCount+2);
 assert.ok(openingRunes.every(uid=>!state.cards.some(c=>c.uid===uid)));
 await stop();
 launch();
 await ready();
 const channelRevision=state.revision;
 await announce("Je te l’ai dit, j’ai canalisé deux Ordre.","unchanged");
 assert.equal(state.revision,channelRevision);
 await announce(namedPayment,"rejected");
 assert.equal(state.revision,channelRevision);
 await announce("Je passe.");
 assert.equal(state.active,"ai");
 assert.equal(state.players.ai.score,6);
 assert.equal(state.players.human.score,5);
 await apply({type:"reset"});
 await apply(shenDeck);
 await apply(zedDeck);
 await apply({type:"start",player:"ai"});
 const shenHold={...card("Shen, Scourge of Shadows"),code:"VEN-042",might:6,
  text:"When I hold, if there is exactly one other unit you control here, draw 1."};
 await put("human",shenHold,"battlefield",1);
 await put("human",witness,"battlefield",1);
 const beforeHold=state.players.human;
 await apply({type:"next-turn"});
 assert.equal(state.spellChain.items.at(-1).cardName,shenHold.name);
 assert.equal(state.players.human.handCount,beforeHold.handCount);
 await apply({type:"chain-pass",player:"human"});
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.players.human.handCount,beforeHold.handCount+2);
 assert.equal(state.players.human.deckCount,beforeHold.deckCount-2);
 const holdRevision=state.revision;
 const recap=await request("/api/messages",{text:"J’ai Hold avec Shen, je pioche pour Shen et pour mon tour."});
 assert.deepEqual((await waitForAnnouncement(recap.value.message.id)).table,{status:"unchanged",revision:holdRevision});
 assert.match((await request("/api/messages?after="+recap.value.message.id)).value.messages.at(-1).text,
  /deux pioches.*Shen, Scourge of Shadows/);
 const beforeLunar=state.players.human;
 await announce("Je lance Lunar Boon.");
 const lunarUid=state.cards.find(c=>c.code===lunar.code).uid;
 assert.equal(state.cards.find(c=>c.uid===lunarUid).zone,"chain");
 assert.equal(state.players.human.deckCount,beforeLunar.deckCount);
 await apply({type:"chain-pass",player:"human"});
 await stop();
 launch();
 await ready();
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.pendingEffects[0].trigger,"spell-discard");
 assert.equal(state.cards.find(c=>c.uid===lunarUid).zone,"chain");
 await announce("Je défausse Loyal Poro et je pioche.");
 assert.equal(state.spellChain,null);
 assert.equal(state.cards.find(c=>c.uid===lunarUid).zone,"trash");
 assert.equal(state.cards.find(c=>c.code===poro.code).zone,"trash");
 assert.equal(state.players.human.handCount,beforeLunar.handCount);
 assert.equal(state.players.human.deckCount,beforeLunar.deckCount-2);
 await apply({type:"reset"});
 await apply(shenDeck);
 await apply(zedDeck);
 await apply({type:"start",player:"human"});
 await put("human",{...card("Plundering Poro"),code:"SFD-069",
  text:"When I conquer, play a Gold gear token exhausted."},"base");
 await apply({type:"move",uid:state.cards.find(c=>c.code==="SFD-069").uid,zone:"battlefield",battlefield:0});
 await apply({type:"combat-pass",player:"human"});
 await apply({type:"combat-pass",player:"ai"});
 assert.equal(state.spellChain.items[0].ability,"create-gold");
 assert.ok(!state.cards.some(c=>c.code==="TOKEN-GOLD"));
 const beforeQuestion=state.revision;
 const priority=await request("/api/messages",{text:"Comment fonctionne la priorité quand un sort est sur la chaîne ?"});
 assert.deepEqual((await waitForAnnouncement(priority.value.message.id)).table,{status:"unchanged",revision:beforeQuestion});
 assert.match((await request("/api/messages?after="+priority.value.message.id)).value.messages.at(-1).text,
  /seul l’objet au sommet.*reste un objet.*contrôleur reçoit la priorité/);
 await apply({type:"chain-pass",player:"human"});
 await stop();
 launch();
 await ready();
 await apply({type:"chain-pass",player:"ai"});
 assert.equal(state.cards.find(c=>c.code==="TOKEN-GOLD").exhausted,true);
 await announce("J’utilise un jeton d’Or.","rejected");
 await apply({type:"next-turn"});
 await apply({type:"next-turn"});
 await announce("J’utilise un jeton d’Or.");
 assert.equal(state.powerPool.human,1);
 assert.ok(!state.cards.some(c=>c.code==="TOKEN-GOLD"));
 const beforePayment=state.players.human.runeCount;
 await apply({type:"play-physical",card:{...card("Order test unit"),energy:1,power:1,domains:["Order"]}});
 assert.equal(state.players.human.runeCount,beforePayment);
 assert.equal(state.powerPool.human,0);
 await stop();
 console.log("PASS: packaged Windows, persisted chains, physical plays and payments, Hold, Lunar Boon and Gold.");
}finally{
 if(child.exitCode===null)child.kill();
 await closed.catch(()=>{});
}
