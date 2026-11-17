// Local companion relay. Run with Node.js >=20: node server.mjs
// Never expose this HTTP server on a public host without TLS, firewalling,
// authentication and an explicit review of your security configuration.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import os from "node:os";
import * as sea from "node:sea";
import {execFile} from "node:child_process";
import {createState,applyCommand,COMMANDS} from "./core.mjs";
import {inspectCards,migrateLegacyPassivePendingEffects} from "./effect-engine.mjs";
import {CARD_SOURCE,CARD_SOURCE_BACKUP,decodeCards,searchCards} from "./catalog.mjs";
import {PRECONS,resolvePrecon} from "./precons.mjs";
import {createRemoteAccess,verifyEmbeddedTunnel} from "./remote.mjs";
import {createConversation} from "./conversation.mjs";
import {createIntegratedAI} from "./integrated-ai.mjs";
import {planHumanAnnouncement,detectMessageLanguage} from "./player-actions.mjs";
import {planPlayerSequence} from "./player-sequence.mjs";
import {correctSpokenCardPhrase} from "./card-voice.mjs";
import {advanceMandatoryTurn} from "./turn-upkeep.mjs";
import {captureCombatOpening,matchesCombatOpening,requestsCombatRewind,rewindCombat} from "./combat-rewind.mjs";
import {makeCardClarification,resolveCardClarification} from "./clarification.mjs";
import {createFreeLocalAI,LOCAL_AI_MODEL} from "./free-ai.mjs";
import {createLocalWhisper,WHISPER_MODEL} from "./whisper-local.mjs";
import {createLocalPiper} from "./piper-local.mjs";
import {createPortableManager,CURRENT_VERSION} from "./portable-manager.mjs";
import {createProcessDashboard} from "./process-dashboard.mjs";
import {initializePortableInstall,portableEnvironment,moveLegacyFiles,legacyDataFolder} from "./portable.mjs";
import {publicReference,RULES_SOURCES} from "./game-knowledge.mjs";
import {runUpdateHelper} from "./update-helper.mjs";
import {runUninstallHelper} from "./uninstall-helper.mjs";
if(process.argv.includes("--riftbound-update-helper")){
 // Run the downloaded EXE as a dedicated updater WITHOUT opening the board,
 // creating a second HTTP server, or prompting for another installation path.
 runUpdateHelper().then(result=>{process.exitCode=result.ok?0:1;},
  error=>{console.error("Riftbound update helper:",error.message);process.exitCode=1;});
}else if(process.argv.includes("--riftbound-uninstall-helper")){
 // A temporary copy of this SEA binary runs OUTSIDE the install directory,
 // so Windows can unlock and remove the installed executable.
 runUninstallHelper().then(result=>{process.exitCode=result.ok?0:1;},
  error=>{console.error("Riftbound uninstall helper:",error.message);process.exitCode=1;});
}else{
const packaged=sea.isSea();
const root=packaged?path.dirname(process.execPath):path.dirname(fileURLToPath(import.meta.url));
const installation=initializePortableInstall({packaged,exePath:process.execPath,sourceRoot:root});
if(installation.launched)process.exit(0);
const userData=installation.root;
const portable=Boolean(installation.portable&&!installation.verify);
if(portable){
 Object.assign(process.env,portableEnvironment(userData));
 // Existing v0.19 users: move only recognized companion files from old AppData
 // to the explicitly selected location, without overriding newer files.
 try{if(process.env.RIFTBOUND_PORTABLE_TEST!=="1"&&process.env.RIFTBOUND_TEST_NO_MIGRATION!=="1")
  moveLegacyFiles(legacyDataFolder(),userData);
 }catch(error){
  console.warn("Anciennes données non migrées :",error.message);
 }
}
const port=Number(process.env.PORT||8787);
const host="127.0.0.1";
const token=process.env.RIFTBOUND_TOKEN||crypto.randomBytes(24).toString("hex");
const stateFile=path.join(userData,".riftbound-local-state.json");
const combatCheckpointFile=path.join(userData,".riftbound-combat-checkpoint.json");
const conversation=createConversation({file:path.join(userData,".riftbound-conversation.json")});
const allowedOrigin=(process.env.RIFTBOUND_ORIGIN||"https://nitarii.github.io").replace(/\/$/,"");
const clients=new Set(),tickets=new Map();
let browserHandoff=false;
const isTrustedSiteOrigin=origin=>origin===allowedOrigin;
const isAllowedLocalOrigin=origin=>/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin||"");

const catalogFile=path.join(userData,".riftbound-catalog-cache.json");
let catalogCache=null,catalogTime=0,catalogPending=null;
try{
 const saved=JSON.parse(fs.readFileSync(catalogFile,"utf8"));
 if(Array.isArray(saved?.cards)&&saved.cards.length>500){catalogCache=saved.cards;catalogTime=saved.updatedAt||0;}
}catch{}
async function loadServerCatalog(force=false) {
  if(!force&&catalogCache&&Date.now()-catalogTime<24*3600*1000)return catalogCache;
  if(catalogPending)return catalogPending;
  catalogPending=(async()=>{
    for(const source of [CARD_SOURCE,CARD_SOURCE_BACKUP]){
      try{
        const response=await fetch(source,{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error("Catalogue HTTP "+response.status);
        const cards=decodeCards(await response.json());
        if(cards.length<500)throw Error("Catalogue incomplet");
        catalogCache=cards;catalogTime=Date.now();
        try{fs.writeFileSync(catalogFile,JSON.stringify({cards,updatedAt:catalogTime}));}catch{}
        return cards;
      }catch(e){console.warn("Chargement cartes :",e.message);}
    }
    if(catalogCache)return catalogCache;
    throw Error("Catalogue indisponible : vérifie la connexion puis réessaie");
  })().finally(()=>{catalogPending=null;});
  return catalogPending;
}
let state=createState();
const backupStateFile=stateFile+".bak";
let primaryStateHealthy=false;
const validSavedState=s=>Boolean(s&&typeof s==="object"&&!Array.isArray(s)&&
 Number.isInteger(s.revision)&&Array.isArray(s.cards)&&Array.isArray(s.history)&&
 Array.isArray(s.battlefields)&&s.players?.human&&s.players?.ai&&s.decks?.ai);
for(const filename of [stateFile,backupStateFile]){
 try{
  const candidate=JSON.parse(fs.readFileSync(filename,"utf8"));
  if(validSavedState(candidate)){state=migrateLegacyPassivePendingEffects(candidate);primaryStateHealthy=filename===stateFile;break;}
 }catch{}
}
let savedCombatOpenings=[];
try{
 const saved=JSON.parse(fs.readFileSync(combatCheckpointFile,"utf8"));
 if(Array.isArray(saved))savedCombatOpenings=saved.slice(0,2);
}catch{}
function saveAtomic(file,value,{backup=false}={}){
 const temp=file+"."+crypto.randomBytes(6).toString("hex")+".tmp";
 try{
  fs.writeFileSync(temp,JSON.stringify(value),{flag:"wx",mode:0o600});
  if(backup&&primaryStateHealthy&&fs.existsSync(stateFile))try{fs.copyFileSync(stateFile,backupStateFile);}catch{}
  fs.renameSync(temp,file);
 }finally{try{fs.rmSync(temp,{force:true});}catch{}}
}
function json(res,status,obj,req){
  headers(res,req);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
function headers(res,req){
  const origin=req.headers.origin;
  if(origin&&(isTrustedSiteOrigin(origin)||isAllowedLocalOrigin(origin))){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Authorization,Content-Type,X-Riftbound-Pair");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    if(req.headers["access-control-request-private-network"]==="true")res.setHeader("Access-Control-Allow-Private-Network","true");
  }
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
}
function authorized(req){
  const h=req.headers.authorization||"";
  const candidate=h.startsWith("Bearer ")?h.slice(7):"";
  const a=Buffer.from(candidate),b=Buffer.from(token);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function msg(res,status,text,req){json(res,status,{error:text},req);}
function sharedState(view=state,{agent=false}={}){
 const {rng,cardSerial,decks,combatRewindId,...publicView}=view;
 const cards=view.cards.flatMap(c=>{
  if(c.zone==="deck"||c.zone==="rune-deck"||c.owner==="human"&&c.zone==="hand")return [];
  if(c.owner==="ai"&&c.zone==="hand"&&!agent||c.faceDown&&(!agent||c.owner==="human"))
   return [{uid:c.uid,owner:c.owner,zone:c.zone,battlefield:c.battlefield,faceDown:true}];
  return [c];
 });
 return {...publicView,cards};
}
function broadcast(){
 const payload="data: "+JSON.stringify({state:sharedState()})+"\n\n";
  for(const c of clients){try{c.write(payload);}catch{clients.delete(c);}}
}
function body(req){
  return new Promise((resolve,reject)=>{
    let text="";
    req.on("data",chunk=>{text+=chunk;if(text.length>750000){reject(Error("Payload trop volumineux"));req.destroy();}});
    req.on("end",()=>{try{resolve(JSON.parse(text))}catch{reject(Error("JSON invalide"))}});
    req.on("error",reject);
  });
}
const guide={
 name:"Riftbound Table Companion",version:CURRENT_VERSION,
 officialRules:RULES_SOURCES,
 warning:"A human-supervised physical tabletop companion. This is not a competitive rules engine or an autonomous validated game simulator. Verify all rules and card effects against Riot's official documentation.",
 connect:"Provide Authorization: Bearer <TOKEN>. Never place the TOKEN in GitHub commits, prompts shared publicly, or publicly accessible URLs.",
 endpoints:{"GET /api/state":"State JSON, authenticated","GET /api/guide":"This guide, authenticated",
 "GET /api/catalog?q=...&type=...&limit=100":"Search or read cards (up to 2000), authenticated",
 "GET /api/decks":"Printed preconstructed deck recipes, authenticated",
  "GET /api/effects/audit":"Whole-catalog effect coverage and unresolved card abilities, authenticated",
 "GET /api/messages?after=0":"Poll announcements and replies. In remote mode, table.status and table.revision report local handling.",
 "POST /api/messages":"Human chat message; JSON {text}, authenticated",
 "GET /api/ai/status":"Integrated model status, no credentials returned, LOCAL only",
 "GET /api/ai/reference?q=...":"Riot rule references, site operating guide and matching card effects, LOCAL only",
 "POST /api/ai/config":"Configure outbound OpenAI-compatible model; LOCAL only",
 "POST /api/ai/disable":"Stop generating model responses; LOCAL only",
 "GET /api/ai/free/status":"Free local CPU model installation progress; LOCAL only",
 "POST /api/ai/free/install":"One-click local Qwen3 4B + Whisper Small installer; LOCAL only",
 "POST /api/command":"One JSON command with optional ifRevision and commandId. Returns a state and receipt.",
 "POST /api/events-ticket":"Short-lived one-use event ticket, authenticated",
 "GET /api/events?ticket=...":"SSE updates for an authorized browser session"},
 commands:{
 "select-precon":{type:"select-precon",id:"random",note:"Valid ids are in GET /api/decks. The server separates chosen champion before drawing."},
 "setup-human|setup-ai":{legend:{name:"Shen, Eye of Twilight",type:"Legend"},champion:{name:"Shen",type:"Unit"},battlefield:{name:"Grove of the God-Willow",type:"Battlefield"},main:"required array for setup-ai",runes:"required array for setup-ai"},
 start:{type:"start",player:"human"},
 "next-turn":{type:"next-turn"},
 "play-paid":{type:"play-paid",uid:"AI hand or champion UID",battlefield:"optional controlled battlefield index"},
 cast:{type:"cast",player:"ai",uid:"AI spell UID",targetUid:"unit UID",flow:"true for a supported spell in your trash",
  hidden:"true for a supported spell in your hidden zone"},
 hide:{type:"hide",player:"ai",uid:"AI card with Hidden",battlefield:0,runeUid:"optional rune UID to recycle"},
 "play-hidden":{type:"play-hidden",player:"ai",uid:"ready hidden unit UID"},
 "chain-pass":{type:"chain-pass",player:"ai"},
 "combat-attack":{type:"combat-attack",player:"ai",battlefield:0,uids:["ready unit UID"]},
 "combat-pass":{type:"combat-pass",player:"ai"},
 "rewind-combat":{type:"rewind-combat",ifRevision:"current revision (local physical player only)"},
 phase:{type:"phase",phase:"Main"},
 add:{type:"add",player:"ai",zone:"base",card:{name:"Card Name",type:"Unit",image:"optional HTTPS image URL"}},
 move:{type:"move",uid:"read from state.cards",zone:"battlefield",battlefield:0},
 exhaust:{type:"exhaust",uid:"read from state.cards"},
 ready:{type:"ready",uid:"read from state.cards"},
 damage:{type:"damage",uid:"read from state.cards",value:1},
 counter:{type:"counter",uid:"read from state.cards",key:"power",value:1},
 score:{type:"score",player:"human",value:1},
 draw:{type:"draw",player:"ai",count:1},
 channel:{type:"channel",player:"ai",count:1},
 "hand-count":{type:"hand-count",player:"human",value:4},
 note:{type:"note",text:"Human declared an action; verify and update the board."},
 remove:{type:"remove",uid:"read from state.cards"},
 reset:{type:"reset"}
 },
 allCommandTypes:COMMANDS
};
const deckDescriptions=()=>PRECONS.map(p=>({id:p.id,label:p.label,source:p.source,
 mainSize:p.main.reduce((sum,[,n])=>sum+n,0),runeSize:p.runes.reduce((sum,[,n])=>sum+n,0),
 battlefields:p.battlefields}));
const recentCommands=new Map();
const checkpoints=[];
let pendingCompound=null;
function ensureRevision(revision){
 if(Number.isInteger(revision)&&revision!==state.revision)
  throw Error("Version obsolète; recharge /api/state");
}
function commitGame(next,{commands=[],id=crypto.randomUUID(),origin="local",remember=true,opening=null}={}){
 const previous=state;
 const receipt={id,status:"applied",origin,before:previous.revision,after:next.revision,
  actions:commands.map(c=>c.type),result:next.message};
 next.history=(next.history||[]).map((event,index)=>index===0?{...event,commandId:id,origin}:event);
 opening=captureCombatOpening(next)||opening;
 if(opening&&matchesCombatOpening(opening,next)){
  // Keep the checkpoint matching the previous save until the board commits.
  const previousOpening=savedCombatOpenings.find(candidate=>matchesCombatOpening(candidate,previous));
  const records=previousOpening?[opening,previousOpening]:[opening];
  saveAtomic(combatCheckpointFile,records);
  savedCombatOpenings=records;
 }
 saveAtomic(stateFile,next,{backup:true});
 primaryStateHealthy=true;
 if(remember){
  checkpoints.push({state:previous,receipt});
  if(checkpoints.length>30)checkpoints.shift();
 }
 state=next;broadcast();
 if(previous.spellChain&&!next.spellChain&&pendingCompound){
  const {action,session}=pendingCompound;
  pendingCompound=null;
  if(next.active==="human"&&!next.pendingCombat&&!next.pendingEffects.length&&!next.finished&&
     conversation.list(0).session===session){
   const revision=next.revision;
   queueMicrotask(()=>{
    try{applyAgentBatch([action],revision,"voice-follow-up");receiveAgentMessage(state.message);}
    catch(error){receiveAgentMessage("Suite de l'annonce non appliquée : "+error.message);}
   });
  }else receiveAgentMessage("La suite de l’annonce n’a pas été exécutée. Annonce de nouveau le déplacement quand la fenêtre le permet.");
 }
 return receipt;
}
async function executeGameCommand(input,{origin="local",withReceipt=false,english=false}={}){
 // Shared between local authenticated server and restricted remote agent gateway.
 if(!manager.status().canLaunch)throw Error("Mets à jour ou vérifie le compagnon avant de modifier la partie.");
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Commande JSON invalide.");
 const requestId=typeof input.commandId==="string"?input.commandId:null;
 if(requestId&&!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))throw Error("Identifiant de commande invalide.");
 const commandKey=requestId&&origin+":"+requestId;
 const signature=JSON.stringify(input);
 function replay(){
  const stored=commandKey&&recentCommands.get(commandKey);
  if(!stored)return null;
  if(stored.signature!==signature)throw Error("Identifiant déjà utilisé pour une autre commande.");
  return withReceipt?{state,receipt:{...stored.receipt,status:"duplicate"}}:state;
 }
 const duplicate=replay();
 if(duplicate)return duplicate;
 const revision=state.revision;
 ensureRevision(input.ifRevision);
 let command=input;
 if(input.type==="select-precon"){
   const cards=await loadServerCatalog();
   const deck=resolvePrecon(cards,input.id||"random");
   command={type:"setup-ai",legend:deck.legend,champion:deck.champion,
    battlefield:deck.battlefield,battlefields:deck.battlefields,
    main:deck.main,runes:deck.runes,mainIncludesChampion:true,
    format:"preconstructed",deckName:deck.label};
   const retry=replay();
   if(retry)return retry;
   ensureRevision(revision);
 }
 let next,receipt;
 if(command.type==="rewind-combat"){
  if(origin!=="local"||!Number.isInteger(input.ifRevision))throw Error("Retour à l’attaque réservé à la table locale avec révision.");
  const opening=savedCombatOpenings.find(candidate=>matchesCombatOpening(candidate,state));
  const restored=rewindCombat(opening,state,{english});
  pendingCompound=null;
  receipt=commitGame(restored,{commands:[command],id:requestId||undefined,origin,remember:false});
  pendingHumanAction=null;pendingSpokenPlay=null;
  while(checkpoints.at(-1)?.receipt.after>opening.revision)checkpoints.pop();
 }else if(command.type==="undo"){
  if(origin!=="local"||!Number.isInteger(input.ifRevision))throw Error("Annulation réservée à la table locale avec révision.");
  const checkpoint=checkpoints.at(-1);
  if(!checkpoint)throw Error("Aucune transaction de cette session à annuler.");
  const restored=structuredClone(checkpoint.state);
  restored.revision=state.revision+1;
  restored.message="Transaction annulée : "+checkpoint.receipt.result;
  restored.history=[{revision:restored.revision,at:new Date().toISOString(),
   text:restored.message,undoOf:checkpoint.receipt.id},...restored.history].slice(0,120);
  pendingCompound=null;
  receipt=commitGame(restored,{commands:[command],id:requestId||undefined,origin,remember:false});
  checkpoints.pop();
 }else{
  next=applyCommand(state,command);
  if(["start","next-turn","effect-confirm"].includes(command.type))next=advanceMandatoryTurn(next);
  if(input.type==="reset")pendingCompound=null;
  receipt=commitGame(next,{commands:[command],id:requestId||undefined,origin});
  if(input.type==="reset"){conversation.clear();pendingHumanAction=null;checkpoints.length=0;}
 }
 if(commandKey){
  recentCommands.set(commandKey,{receipt,signature});
  if(recentCommands.size>256)recentCommands.delete(recentCommands.keys().next().value);
 }
 // Every transition into AI control starts the deterministic turn immediately,
 // including toolbar "Tour suivant", reactions and effect confirmations.
 // The runner coalesces requests by state revision.
 if(!["undo","rewind-combat"].includes(command.type))integratedAI.advanceTurnIfAI();
 return withReceipt?{state,receipt}:state;
}
const readMessages=after=>conversation.list(after);
const receiveAgentMessage=text=>conversation.post("ai",text);
function applyAgentBatch(actions,revision,origin="ai"){
 if(!manager.status().canLaunch)throw Error("Compagnon non vérifié : actions IA suspendues.");
 if(state.revision!==revision)throw Error("L'état de la partie a changé entre-temps.");
 let next=state,opening=null;
 for(const cmd of actions){
  next=applyCommand(next,cmd);
  if(["start","next-turn","effect-confirm"].includes(cmd.type))next=advanceMandatoryTurn(next);
  opening=captureCombatOpening(next)||opening;
 }
 commitGame(next,{commands:actions,origin,opening});
 // Some AI actions finish an effect or advance into another playable state.
 // Re-evaluate only after the current batch has been committed.
 queueMicrotask(()=>integratedAI.advanceTurnIfAI());
 return state;
}
const integratedAI=createIntegratedAI({
 userData,getState:()=>state,applyBatch:applyAgentBatch,
 sendMessage:receiveAgentMessage,getMessages:readMessages,getCatalog:async()=>catalogCache||[]
});
// This release defaults to a strictly free local opponent. Old paid-provider
// profiles are left on disk for migration but never auto-start after upgrade.
if(integratedAI.status().enabled&&integratedAI.status().provider!=="free")
 integratedAI.disable();
// The physical player can correct the previous card name without a separate model request.
// Pending actions are never executed until a real catalog card and all costs are verified.
let pendingHumanAction=null;
let pendingSpokenPlay=null; // two utterances, e.g. "Je joue." then "Mournful Witness."
let humanAnnouncements=Promise.resolve();
const receiveHumanMessage=(text,requestId)=>{
 const previous=conversation.findHumanRequest(requestId,text);
 if(previous)return previous;
 const entry=conversation.post("human",text,{trackTable:true,requestId});
 const receivedRevision=state.revision;
 const receivedSession=conversation.list(0).session;
 let outcome="delegated";
 const mark=()=>{
  try{conversation.markTable(entry.id,receivedSession,{status:outcome,revision:state.revision});}
  catch(error){console.warn("Suivi du message non sauvegardé :",error.message);}
 };
 if(/^(?:reprends|reprendre|resume)[.! ]*$/i.test(entry.text)){
  outcome="unchanged";mark();
  receiveAgentMessage("Partie à la révision "+state.revision+". "+state.message);
  integratedAI.advanceTurnIfAI();
  return entry;
 }
 if(/^(?:attends|stop|pause|non[, ]+attends)\b/i.test(entry.text)&&pendingCompound){
  pendingCompound=null;
  outcome="unchanged";mark();
  receiveAgentMessage("Suite de l'annonce mise en pause. La chaîne reste au même état.");
  return entry;
 }
 humanAnnouncements=humanAnnouncements.catch(()=>{}).then(async()=>{
  if(conversation.list(0).session!==receivedSession)return;
  let announcement=entry.text;
  const english=detectMessageLanguage(entry.text)==="en";
  const normalized=entry.text.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
   .toLowerCase().replace(/[.!?]+$/g,"").trim();
  if(requestsCombatRewind(normalized)){
   await executeGameCommand({type:"rewind-combat",ifRevision:receivedRevision},{english});
   outcome="applied";
   receiveAgentMessage(state.message);
   return;
  }
  const barePlay=/^(?:(?:et|and)\s+)?(?:(?:je|j'|i)\s+)?(?:joue|jouer|pose|play|playing|place|mets)\s*(?:une?\s+carte|a\s+card)?$/i.test(normalized);
  if(barePlay){
   outcome="clarification";
   pendingSpokenPlay={revision:state.revision,time:Date.now(),prefix:english?"I play ":"Je joue "};
   receiveAgentMessage(english?"I heard 'I play'. Which card?":
    "J'ai entendu « je joue ». Dis simplement le nom de la carte.");
   return;
  }
  // Passing priority and other public board commands must remain responsive
  // even when the remote catalog is unavailable or expired.
  let catalog=catalogCache||[];
  if(!catalog.length&&(pendingSpokenPlay||pendingHumanAction||
     /\b(?:joue|jouer|lance|revele|reveal|defausse|pose|play|place|resonating strike)\b/i.test(normalized))){
   try{catalog=await loadServerCatalog();}catch{}
   if(conversation.list(0).session!==receivedSession)return;
  }
  if(pendingSpokenPlay){
   const previous=pendingSpokenPlay;pendingSpokenPlay=null;
   if(!pendingHumanAction&&previous.revision===state.revision&&Date.now()-previous.time<30000&&
     !/\b(?:joue|pose|play|place|mets|pioche|draw|termine|finis|end|channel|canalise)\b/i.test(normalized)&&
     normalized.length>=4&&normalized.length<=90&&!/[?]/.test(entry.text)){
    announcement=previous.prefix+entry.text;
   }
  }
  if(pendingHumanAction){
   const answer=resolveCardClarification(pendingHumanAction,entry.text,catalog,state,{english});
   if(answer.status==="waiting"){
    outcome="clarification";
    receiveAgentMessage(answer.message);
    return;
   }
   if(answer.status==="cancel"){
    outcome="unchanged";
    pendingHumanAction=null;
    receiveAgentMessage(answer.message);
    return;
   }
   if(answer.status==="confirmed"){
    announcement=answer.announcement;
    pendingHumanAction=null;
   }else pendingHumanAction=null; // new action or expired request
  }
  const plan=planPlayerSequence(announcement,state,catalog);
  if(plan.needsClarification){
   outcome="clarification";
   pendingHumanAction=makeCardClarification({
    announcement,query:plan.needsClarification.query,
    revision:state.revision,catalog
   });
   const prompt=resolveCardClarification(pendingHumanAction,"",catalog,state,{english});
   receiveAgentMessage(prompt.message);
   return;
  }
  if(plan.error){
   outcome="rejected";
   receiveAgentMessage(english?plan.errorEN:plan.error);
   return;
  }
  if(plan.prompt){
   outcome="clarification";
   receiveAgentMessage(english?plan.promptEN:plan.prompt);
   return;
  }
  if(plan.recognized&&!plan.commands?.length){
   outcome="unchanged";
   receiveAgentMessage(english?"Already reflected on the board.":"Cette action est déjà prise en compte sur le plateau.");
   return;
  }
  if(!plan.recognized&&!remoteAccess.status().active&&
     /\b(?:joue|jouer|pose|mets|play|place|invoque)\b/i.test(normalized)){
   outcome="clarification";
   receiveAgentMessage(english?"I heard a card play, but the name or target is incomplete. Repeat the card name. No change was made.":
    "J'ai entendu une annonce de carte, mais je n'ai pas pu identifier une action complète. Répète le nom de la carte. Le plateau n'a pas changé.");
   return;
  }
  if(plan.commands?.length){
   if(receivedRevision!==state.revision){
    outcome="rejected";
    receiveAgentMessage(english?"The board changed before I could apply that announcement. Repeat it in the current window; no action was applied.":
     "Le plateau a changé depuis ton annonce. Répète-la dans la fenêtre actuelle ; aucune action n’a été appliquée.");
    return;
   }
   const revision=state.revision;
   try{
    if(plan.afterChain)pendingCompound={action:plan.afterChain,session:conversation.list(0).session};
    applyAgentBatch(plan.commands,revision,"announcement");
    outcome="applied";
    receiveAgentMessage(state.message+(plan.afterChain?" · L’attaque suivra la résolution de la chaîne.":""));
   }
   catch(e){
    outcome="rejected";
    if(plan.afterChain)pendingCompound=null;
    receiveAgentMessage((english?"Action not applied: ":"Action non appliquée : ")+String(e.message||e).slice(0,180));
    return;
   }
  }
  integratedAI.onHumanMessage(announcement,{actionApplied:Boolean(plan.recognized||plan.commands?.length)});
 }).catch(e=>{
  outcome="review";
  receiveAgentMessage("Action interrompue : "+String(e.message||e).slice(0,180));
 }).finally(mark);
 return entry;
};
const localFreeAI=createFreeLocalAI({
 userData,
 onReady:async model=>{
  if(remoteOpponentSelected())throw Error("Coupe l'accès agent distant avant d'activer l'IA locale.");
  integratedAI.configure({provider:"free",model,enabled:true});
  integratedAI.advanceTurnIfAI();
 }
});
const speech=createLocalWhisper({userData});
const piper=createLocalPiper({userData});
let serverClosing=false;
function shutdownAll(){
 piper.stop();
 if(serverClosing)return;
 serverClosing=true;
 try{remoteAccess.stop();}catch{}
 try{localFreeAI.stop();}catch{}
 try{speech.stop();}catch{}
 for(const connection of clients){
  try{connection.write("data: "+JSON.stringify({shutdown:true})+"\n\n");connection.end();}catch{}
 }
 clients.clear();
 try{
  server.close(()=>process.exit(0));
  server.closeAllConnections?.();
 }catch{process.exitCode=0;}
 setTimeout(()=>process.exit(0),2200).unref();
}
const manager=createPortableManager({
 root:userData,exePath:process.execPath,portable,sessionToken:token,port,
 skipStartupCheck:process.env.RIFTBOUND_PORTABLE_TEST==="1"||
  process.env.RIFTBOUND_SKIP_UPDATE_CHECK==="1",
 onOutdated:()=>{
  try{localFreeAI.stop();}catch{}
  try{remoteAccess.stop();}catch{}
  try{speech.stop();}catch{}
 },
 shutdown:shutdownAll
});
const remoteAccess=createRemoteAccess({
 userData,
 getState:()=>sharedState(state,{agent:true}),
 performCommand:async input=>{
  const result=await executeGameCommand(input,{origin:"remote",withReceipt:true});
  return {...result,state:sharedState(result.state,{agent:true})};
 },
 getCatalog:loadServerCatalog,
 getDecks:deckDescriptions,
 getGuide:()=>guide,
 getMessages:after=>conversation.list(after,{agent:true}),
 sendMessage:receiveAgentMessage,
 markAgentPoll:()=>conversation.markAgentPoll()
});
let remoteStart=null;
function remoteOpponentSelected(){
 return Boolean(remoteStart||remoteAccess.status().active);
}
function startRemoteOpponent(){
 if(remoteStart)return remoteStart;
 if(remoteAccess.status().active)return Promise.resolve(remoteAccess.status(true));
 const wasLocal=integratedAI.status().enabled;
 if(wasLocal)integratedAI.disable();
 remoteStart=remoteAccess.start().then(session=>{
  localFreeAI.stop();
  return session;
 },error=>{
  if(wasLocal){
   integratedAI.enable();
   resumeLocalOpponent();
  }
  throw error;
 }).finally(()=>{remoteStart=null;});
 return remoteStart;
}
const processDashboard=createProcessDashboard({integratedAI,localFreeAI,speech,remoteAccess});
// Closing the companion also terminates any optional public tunnel.
process.once("exit",()=>{remoteAccess.stop();localFreeAI.stop();speech.stop();});
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,shutdownAll);
const packagedAssetCache=new Map();
const WEB_ASSETS=new Set(["index.html","manager.html","release-policy.mjs","local-voice.mjs","app.mjs","core.mjs","combat-engine.mjs","combat-voice.mjs","battlefield-rules.mjs","rune-payment.mjs","play-effects.mjs","effect-engine.mjs","effect-runtime.mjs","draw-rules.mjs","priority-chain.mjs","chat-scrolling.mjs","player-sequence.mjs","catalog.mjs","precons.mjs","narration.mjs","picker.mjs","manual-bridge.mjs","conversation.mjs","integrated-ai.mjs","free-ai.mjs","game-knowledge.mjs","rules-compendium.mjs","player-actions.mjs","card-voice.mjs","clarification.mjs","ai-turn.mjs","turn-upkeep.mjs","verified-cards.mjs","voice-session.mjs","style.css","assets/companion-icon.svg","licenses/cloudflared-APACHE-2.0.txt"]);
function serveFile(req,res,url){
 const requested=url.pathname==="/"?"/index.html":url.pathname;
 if(!/^\/[a-z0-9._/-]+$/i.test(requested)||requested.includes("..")||requested.startsWith("/.")){
  msg(res,404,"Not found",req);return;
 }
 const name=requested.slice(1);
 if(!WEB_ASSETS.has(name)){msg(res,404,"Not found",req);return;}
 const ext=path.extname(name);
 const mime=ext===".css"?"text/css":ext===".html"?"text/html":ext===".mjs"?"text/javascript":ext===".svg"?"image/svg+xml":"text/plain";
 try{
  let bytes;
  if(packaged){
   bytes=packagedAssetCache.get(name);
   if(!bytes){bytes=Buffer.from(sea.getAsset(name));packagedAssetCache.set(name,bytes);}
  }else bytes=fs.readFileSync(path.join(root,name));
  headers(res,req);
  res.writeHead(200,{"Content-Type":mime+"; charset=utf-8","Cache-Control":"no-cache"});
  res.end(bytes);
 }catch(e){console.error("Static file:",name,e.message);msg(res,404,"Not found",req);}
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://127.0.0.1");
  if(req.method==="OPTIONS"){headers(res,req);res.writeHead(204);res.end();return;}
  if(!url.pathname.startsWith("/api/")){if(req.method!=="GET"){msg(res,405,"Method not allowed",req);return;}serveFile(req,res,url);return;}
  if(url.pathname==="/api/events"){
    const ticket=url.searchParams.get("ticket");
    const expiry=tickets.get(ticket);
    if(!expiry||expiry<Date.now()){msg(res,401,"Ticket expiré",req);return;}
    tickets.delete(ticket);
    headers(res,req);
    res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store","Connection":"keep-alive"});
    res.write("data: "+JSON.stringify({state:sharedState()})+"\n\n");clients.add(res);
    const heart=setInterval(()=>{try{res.write(":keepalive\n\n");}catch{}},15000);
    req.on("close",()=>{clients.delete(res);clearInterval(heart);});return;
  }
  if(req.method==="GET"&&url.pathname==="/api/health"){
    json(res,200,{ok:true,name:"Riftbound Companion",version:CURRENT_VERSION,packaged,portable},req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/pair"){
    // Local browser handoff: only the exact hosted companion origin may request a token.
    // This API is NOT a substitute for authenticating external agents. Never expose it
    // to the public Internet; the HTTP server remains bound to 127.0.0.1.
    const origin=req.headers.origin||"";
    if(!isTrustedSiteOrigin(origin)||req.headers["x-riftbound-pair"]!=="1"||
       !String(req.headers["content-type"]||"").startsWith("application/json")){
      msg(res,403,"Association réservée au site officiel ouvert localement",req);return;
    }
    // A successful handoff tells the launcher that the user already has a tab open.
    browserHandoff=true;
    json(res,200,{ok:true,token,baseUrl:"http://127.0.0.1:"+port},req);
    return;
  }
  if(!authorized(req)){msg(res,401,"Jeton manquant ou incorrect",req);return;}
  // Allow reading and maintenance during updates, but never start or mutate a
  // physical game from an unverified or confirmed outdated Windows executable.
  if(req.method==="POST"&&["/api/messages","/api/command",
      "/api/ai/config","/api/speech/install","/api/speech/warm","/api/speech/transcribe","/api/speech/synthesis",
      "/api/remote/start"].includes(url.pathname)&&
     !manager.status().canLaunch){
   msg(res,409,"Vérifie ou mets à jour Riftbound depuis le gestionnaire avant de jouer.",req);
   return;
  }
  if(req.method==="GET"&&url.pathname==="/api/messages"){
    try{json(res,200,readMessages(url.searchParams.get("after")||"0"),req);}
    catch(e){msg(res,400,e.message,req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/messages"){
    try{
      const message=await body(req);
      const entry=receiveHumanMessage(message.text,message.requestId);
      json(res,200,{ok:true,message:entry},req);
    }catch(e){msg(res,400,e.message,req);}return;
  }
  if(req.method==="GET"&&url.pathname==="/api/state"){json(res,200,{state:sharedState()},req);return;}
  if(req.method==="GET"&&url.pathname==="/api/guide"){json(res,200,guide,req);return;}
  if(req.method==="GET"&&url.pathname==="/api/decks"){
    json(res,200,{decks:deckDescriptions()},req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/effects/audit"){
    try{
     const cards=await loadServerCatalog();
     json(res,200,{...inspectCards(cards),pending:state.pendingEffects||[],
      warning:"Seuls les effets réellement interprétés et vérifiés sont exécutés automatiquement."},req);
    }catch(e){msg(res,503,String(e.message||e),req);}
    return;
  }
  // The local authenticated UI controls the only public-facing gateway.
  // This control endpoint is NOT exposed by the restricted gateway.
  if(req.method==="GET"&&url.pathname==="/api/ai/reference"){
    const query=(url.searchParams.get("q")||"").slice(0,150);
    let cards=[],notice="";
    try{cards=await loadServerCatalog();}catch(e){notice="Catalogue de cartes non chargé : "+e.message;}
    json(res,200,{...publicReference(query,cards),notice},req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/ai/status"){
    json(res,200,integratedAI.status(),req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/ai/free/status"){
    json(res,200,{...localFreeAI.status(),rulesOnly:integratedAI.status().rulesOnly},req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/ai/rules/activate"){
   if(!manager.status().canLaunch||remoteOpponentSelected()){
    msg(res,409,"Vérifie le compagnon et coupe le relais distant avant d’activer l’adversaire local.",req);return;
   }
   try{
    localFreeAI.stop();
    const active=integratedAI.configure({provider:"free",model:LOCAL_AI_MODEL,enabled:true,rulesOnly:true});
    integratedAI.advanceTurnIfAI();
    json(res,200,active,req);
   }catch(error){msg(res,400,error.message,req);}
   return;
  }
  if(req.method==="POST"&&url.pathname==="/api/ai/free/install"){
    if(remoteOpponentSelected()){
      msg(res,409,"Coupe d'abord l'accès IA distant.",req);return;
    }
    const existing=integratedAI.status();
    if(existing.enabled&&existing.provider!=="free"){
      msg(res,409,"Désactive d'abord l'autre fournisseur IA.",req);return;
    }
    try{
      if(!manager.status().canLaunch)throw Error("Termine la mise à jour ou la vérification avant de démarrer l'IA.");
      const input=await body(req);
      if(input?.confirmFolder!==userData)throw Error("Choisis et confirme le dossier d'installation dans le gestionnaire Windows.");
      const opponent=localFreeAI.start(input.model||LOCAL_AI_MODEL,{backend:input.backend||"auto"});
      const voice=speech.begin(WHISPER_MODEL);
      json(res,202,{...opponent,speech:voice},req);
    }catch(e){msg(res,400,e.message,req);}return;
  }

  if(req.method==="GET"&&url.pathname==="/api/manager/status"){
    json(res,200,manager.status(),req);return;
  }
  // Process inventory includes ONLY children owned by this companion instance.
  // No global Windows process enumeration and no stopping unrelated programs.
  if(req.method==="GET"&&url.pathname==="/api/manager/processes"){
    json(res,200,processDashboard.status(),req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/processes/stop"){
    try{
      const input=await body(req);
      json(res,200,processDashboard.stop(input.target),req);
    }catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/processes/whisper/enable"){
    try{
      if(!manager.status().canLaunch)throw Error("Termine la vérification ou la mise à jour avant d'activer Whisper.");
      json(res,200,processDashboard.enableWhisper(),req);
    }catch(e){msg(res,409,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/stop"){
    try{json(res,200,manager.requestStop(await body(req)),req);}
    catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/offline/continue"){
    try{
      const status=manager.continueOffline();
      json(res,200,status,req);
      // A player explicitly opted to launch despite a failed network check.
      resumeLocalOpponent();
    }catch(e){msg(res,409,String(e.message||e),req);}return;
  }
  if(req.method==="GET"&&url.pathname==="/api/manager/update/log"){
    try{
      const updates=path.join(userData,"updates");
      const report=["update.log","maintenance-output.log"].map(name=>{
       const file=path.join(updates,name);
       return fs.existsSync(file)?name+"\n"+fs.readFileSync(file,"utf8").slice(-10000):"";
      }).filter(Boolean);
      json(res,200,{log:report.length?report.join("\n\n"):"Aucun journal de mise à jour."},req);
    }catch(e){msg(res,500,String(e.message||e),req);}
    return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/update/check"){
    try{json(res,200,await manager.checkUpdate(),req);}
    catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/update/apply"){
    try{json(res,200,await manager.applyUpdate(),req);}
    catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/manager/uninstall"){
    try{json(res,200,await manager.uninstall(await body(req)),req);}
    catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="GET"&&url.pathname==="/api/speech/status"){
    json(res,200,{...speech.status(),synthesis:piper.status(),folder:userData},req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/speech/install"){
    try{
     const input=await body(req);
     if(input?.confirmFolder!==userData)throw Error("Confirme le dossier choisi avant l'installation de Whisper.");
     json(res,202,speech.begin(WHISPER_MODEL),req);
    }catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/speech/warm"){
   try{json(res,202,speech.warm(),req);}
   catch(e){msg(res,400,String(e.message||e),req);}
   return;
  }
  if(req.method==="GET"&&url.pathname==="/api/speech/synthesis"){
   json(res,200,piper.status(),req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/speech/synthesis"){
   if(!piper.status().installed){msg(res,404,"Voix Piper indisponible.",req);return;}
   try{
    const input=await body(req);
    if(typeof input?.text!=="string")throw Error("Texte de synthèse requis.");
    const wav=await piper.synthesize(input.text);
    headers(res,req);
    res.writeHead(200,{"Content-Type":"audio/wav","Cache-Control":"no-store"});
    res.end(wav);
   }catch(error){msg(res,400,error.message,req);}
   return;
  }
  if(req.method==="POST"&&url.pathname==="/api/speech/transcribe"){
    try{
     if(!String(req.headers["content-type"]||"").startsWith("audio/wav"))
      throw Error("La transcription nécessite un enregistrement WAV.");
     const chunks=[];let size=0;
     for await(const part of req){
      size+=part.length;
      if(size>4_000_000)throw Error("Audio trop long (limite 4 Mo).");
      chunks.push(part);
     }
     // Speech must never wait on a remote card-catalog refresh. Use the
     // current table and the already cached catalogue, entirely offline.
     const visible=state.cards.filter(c=>!c.faceDown&&!["hand","deck","rune-deck"].includes(c.zone));
     const known=Array.isArray(catalogCache)?catalogCache:[];
     const seen=new Set(),cards=[];
     for(const card of [...visible,...known]){
      const key=String(card.name||"").trim().toLowerCase();
      if(!key||seen.has(key))continue;
      seen.add(key);cards.push(card);
      if(cards.length>=28)break;
     }
     const result=await speech.transcribe(Buffer.concat(chunks),{
      language:"auto",cards
     });
     // The recognizer prompt is intentionally short; resolve the *entire*
     // locally cached catalogue afterwards, including names not in the prompt.
     // Report the original heard phrase whenever a safe correction was made.
     const correction=correctSpokenCardPhrase(known.length?known:cards,result.text,{
      expectCardName:Boolean(pendingSpokenPlay&&Date.now()-pendingSpokenPlay.time<30000)
     });
     json(res,200,{...result,...correction,
      rawText:correction.corrected?correction.rawText:result.text},req);
    }catch(e){msg(res,400,String(e.message||e),req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/ai/config"){
    if(remoteOpponentSelected()){msg(res,409,"Coupe d'abord l'accès IA distant pour éviter deux adversaires simultanés.",req);return;}
    try{const settings=await body(req);json(res,200,integratedAI.configure(settings),req);}
    catch(e){msg(res,400,e.message,req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/ai/disable"){
    const result=integratedAI.disable();
    localFreeAI.stop();
    json(res,200,result,req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/remote/status"){
    json(res,200,remoteAccess.status(true),req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/remote/start"){
    try{json(res,200,await startRemoteOpponent(),req);}
    catch(e){msg(res,503,e.message,req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/remote/stop"){
    remoteAccess.stop();json(res,200,{active:false},req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/catalog"){
    try{
      const cards=await loadServerCatalog(url.searchParams.get("refresh")==="1");
      const q=url.searchParams.get("q")||"",type=url.searchParams.get("type")||"";
      const limit=Math.min(2000,Math.max(1,Number(url.searchParams.get("limit")||100)||100));
      const result=searchCards(cards,q,type,limit);
      json(res,200,{count:cards.length,returned:result.length,cards:result,source:CARD_SOURCE},req);
    }catch(e){msg(res,503,e.message,req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/events-ticket"){
    const ticket=crypto.randomBytes(28).toString("hex");tickets.set(ticket,Date.now()+30000);
    if(tickets.size>200){for(const [k,v] of tickets)if(v<Date.now())tickets.delete(k);}
    json(res,200,{ticket},req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/command"){
    try{
      const input=await body(req);
      const updated=await executeGameCommand(input,{withReceipt:true});
      json(res,200,{ok:true,...updated,state:sharedState(updated.state)},req);
    }catch(e){json(res,400,{ok:false,error:e.message,receipt:{status:"rejected",revision:state.revision}},req);}return;
  }
  msg(res,404,"Endpoint inconnu",req);
});
if(process.argv.includes("--verify-bundle")){
 try{
  const result=verifyEmbeddedTunnel();
  console.log("Embedded cloudflared verified:",result.sha256,result.bytes,"bytes");
 }catch(e){
  console.error("Embedded cloudflared verification failed:",e.message);
  process.exitCode=1;
 }
}else{
server.on("error",err=>{
 console.error("Démarrage impossible :",err.code==="EADDRINUSE"?"Le port "+port+" est déjà utilisé. Ferme l'autre instance du module.":err.message);
 process.exitCode=1;
});
function resumeLocalOpponent(){
 if(manager.status().canLaunch&&integratedAI.status().provider==="free"&&
    integratedAI.status().enabled){
  // Reuse installed weights; a confirmed outdated build must not run the model.
  integratedAI.advanceTurnIfAI();
  if(!integratedAI.status().rulesOnly)localFreeAI.resume(integratedAI.status().model);
 }
}
server.listen(port,host,()=>{
  // Background network verification only. The manager shows a startup screen
  // until verification is complete and does not launch the game early.
  manager.startupCheck().then(result=>{
   if(result.canLaunch)resumeLocalOpponent();
  }).catch(e=>console.warn("Vérification de version :",e.message));
  console.log("\nRIFTBOUND TABLE COMPANION");
  console.log("Site local : http://"+host+":"+port);
  console.log("Jeton local : "+token);
  console.log("L'API principale est réservée à 127.0.0.1. Ne publie pas le jeton.");
  console.log("L'accès distant à une IA est DÉSACTIVÉ par défaut, et doit être démarré depuis le site.\n");
  if(packaged&&process.platform==="win32"){
    console.log("Le gestionnaire ouvre le plateau local en un clic, sans connexion manuelle.");
    console.log("Le programme n'ouvre plus un nouvel onglet automatiquement.");
    // The packaged executable opens the local management interface, where
    // the user can activate/disable AI, launch the site, update or uninstall.
    if(portable&&!process.argv.includes("--no-browser")&&
       process.env.RIFTBOUND_NO_BROWSER!=="1"){
      const managerURL="http://"+host+":"+port+"/manager.html#access="+encodeURIComponent(token);
      execFile("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden",
       "-Command","Start-Process '"+managerURL+"'"],
       {windowsHide:true,env:process.env},()=>{});
    }
    // Explicit escape hatch for users without access to the hosted site.
    if(process.argv.includes("--open-browser")){
      const target="http://"+host+":"+port+"/#companion="+encodeURIComponent(token);
      execFile("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command",
        "Start-Process '"+target+"'"],{windowsHide:true},err=>{
          if(err)console.log("Page locale : http://"+host+":"+port);
        });
    }
  }
});

}

}
