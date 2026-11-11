// Outbound AI opponent. All credentials remain in the locally authenticated server.
import fs from "node:fs";
import path from "node:path";
import {applyCommand} from "./core.mjs";

const PROVIDERS={openai:"https://api.openai.com/v1",ollama:"http://127.0.0.1:11434/v1",
 lmstudio:"http://127.0.0.1:1234/v1",free:"http://127.0.0.1:11435/v1"};
const DEFAULT_MODELS={openai:"gpt-4.1-mini",ollama:"gpt-oss:20b",lmstudio:"local-model",free:"qwen3:0.6b"};
const COMMANDS=new Set(["move","add","exhaust","ready","flip","damage","counter","score",
 "draw","channel","mulligan","phase","next-turn","note"]);
function providerURL(source){
 const url=new URL(String(source||""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
   !url.hostname.includes(".")||/^[0-9.]+$/.test(url.hostname)||
   !/^\/(?:[a-z0-9_-]+\/)*v1\/?$/i.test(url.pathname))
   throw Error("Le serveur personnalisé doit avoir une adresse HTTPS se terminant par /v1.");
 return url.origin+url.pathname.replace(/\/$/,"");
}
export function validateAIConfig(input,previous={}){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Configuration IA invalide.");
 const provider=String(input.provider||"");
 if(!Object.hasOwn(PROVIDERS,provider)&&provider!=="compatible")throw Error("Fournisseur non pris en charge.");
 const model=String(input.model||DEFAULT_MODELS[provider]||"").trim();
 if(!model||model.length>100||!/^[\w./:+-]+$/.test(model))throw Error("Identifiant de modèle invalide.");
 const endpoint=provider==="compatible"?providerURL(input.endpoint):PROVIDERS[provider];
 const supplied=typeof input.apiKey==="string"?input.apiKey.trim():"";
 if(supplied.length>512)throw Error("Clé API trop longue.");
 const apiKey=supplied||(provider===previous.provider?previous.apiKey:"")||"";
 if(["openai","compatible"].includes(provider)&&!apiKey)
  throw Error("Clé API requise : un abonnement ChatGPT ne comprend pas les crédits API.");
 return {provider,model,endpoint,apiKey,enabled:input.enabled!==false};
}
export function modelBoardState(state){
 return {
  revision:state.revision,turn:state.turn,phase:state.phase,active:state.active,
  started:state.started,battlefields:state.battlefields,
  players:{
   human:{legend:state.players.human.legend,champion:state.players.human.champion,
    score:state.players.human.score,handCount:state.players.human.handCount},
   ai:{legend:state.players.ai.legend,champion:state.players.ai.champion,
    score:state.players.ai.score,handCount:state.players.ai.handCount,
    deckCount:state.players.ai.deckCount,runeCount:state.players.ai.runeCount}
  },
  cards:state.cards.filter(c=>c.zone!=="deck"&&c.zone!=="rune-deck"&&
   !(c.owner==="human"&&c.zone==="hand")).map(c=>
    c.owner==="human"&&c.faceDown?
      {uid:c.uid,owner:c.owner,zone:c.zone,faceDown:true}:
      {uid:c.uid,owner:c.owner,zone:c.zone,battlefield:c.battlefield,
       code:c.code,name:c.name,type:c.type,text:c.text,
       power:c.power,energy:c.energy,exhausted:c.exhausted,
       damage:c.damage,counters:c.counters})
 };
}
function relevantCards(catalog,text){
 const words=(String(text||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[\p{L}0-9]+/gu)||[])
  .filter(s=>s.length>=4).slice(0,16);
 return (catalog||[]).filter(c=>{
  const label=String(c.name||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  return words.some(w=>label.includes(w));
 }).slice(0,20).map(c=>({code:c.code,name:c.name,type:c.type,
  text:c.text,power:c.power,energy:c.energy}));
}
function extractJSON(raw){
 let value=String(raw||"").trim();
 if(value.startsWith("~~~"))value=value.replace(/^~~~(?:json)?\s*/i,"").replace(/\s*~~~$/,"");
 if(value.startsWith(String.fromCharCode(96).repeat(3))){
  const ticks=String.fromCharCode(96).repeat(3);
  value=value.slice(ticks.length).replace(/^json\s*/i,"");
  if(value.endsWith(ticks))value=value.slice(0,-ticks.length);
 }
 if(value.length>30000)throw Error("Réponse du modèle trop longue.");
 try{return JSON.parse(value);}catch{throw Error("Le modèle n'a pas produit de JSON valide.");}
}
export function validateAgentCommands(actions,state,announcement,catalog=[]){
 if(!Array.isArray(actions)||actions.length>8)throw Error("Maximum huit commandes par réponse.");
 let preview=state;
 const checked=[],heard=String(announcement||"").toLowerCase();
 const zones=new Set(["base","battlefield","trash","banished","runes","hand","champion"]);
 for(const raw of actions){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||!COMMANDS.has(raw.type))
   throw Error("Commande non autorisée.");
  const cmd=JSON.parse(JSON.stringify(raw));
  if(JSON.stringify(cmd).length>3000)throw Error("Commande trop longue.");
  const card=preview.cards.find(c=>c.uid===cmd.uid);
  if(["move","exhaust","ready","flip","damage","counter"].includes(cmd.type)){
   if(!cmd.uid||!card)throw Error("Identifiant de carte inconnu.");
   if(card.owner==="human"&&card.zone==="hand")throw Error("La main physique reste cachée.");
  }
  if(cmd.type==="move"&&!zones.has(cmd.zone))throw Error("Zone interdite.");
  if(cmd.type==="add"){
   if(cmd.player!=="human"||!zones.has(cmd.zone)||cmd.zone==="hand")
    throw Error("L'IA ne peut pas créer de cartes de sa main.");
   const official=catalog.find(c=>c.code&&c.code===cmd.card?.code);
   if(!official)throw Error("Carte absente du catalogue.");
   const name=official.name.toLowerCase(),character=name.split(",")[0].trim();
   if(!heard.includes(name)&&!(character.length>=4&&heard.includes(character)))
    throw Error("Le joueur n'a pas annoncé cette carte.");
   cmd.card=official;
  }
  if(["draw","channel"].includes(cmd.type)&&
   (cmd.player!=="ai"||!Number.isInteger(cmd.count)||cmd.count<1||cmd.count>3))
    throw Error("Pioche/canalisation IA limitées à trois cartes.");
  if(cmd.type==="mulligan"&&cmd.player!=="ai")throw Error("Mulligan IA uniquement.");
  if(cmd.type==="score"&&(!["human","ai"].includes(cmd.player)||!Number.isInteger(cmd.value)||Math.abs(cmd.value)>3))
   throw Error("Score non autorisé.");
  if(["counter","damage"].includes(cmd.type)&&(!Number.isInteger(cmd.value)||Math.abs(cmd.value)>12))
   throw Error("Marqueur non autorisé.");
  if(cmd.type==="note"&&(typeof cmd.text!=="string"||cmd.text.length>300))
   throw Error("Note trop longue.");
  preview=applyCommand(preview,cmd);
  checked.push(cmd);
 }
 return checked;
}
const SYSTEM_PROMPT=[
 "Tu es l'adversaire IA d'une partie PHYSIQUE de Riftbound. Parle en français.",
 "Tu ne connais jamais la main humaine cachée ; seul ton propre jeu t'est visible.",
 "Ne crée aucune carte, effet ou règle. Le plateau n'arbitre pas les règles.",
 "Si la règle ou la carte est incertaine, demande une clarification sans modifier le plateau.",
 "Joue des cartes existantes de ta main en déplaçant leur uid exact.",
 "Tu peux poser une carte humaine avec add seulement si le joueur l'a annoncée explicitement et qu'elle est dans knownCards.",
 "Ne crée jamais une carte IA avec add et ne modifie pas la main physique cachée.",
 "Une fin de tour annoncée par le joueur est déjà exécutée avant ton message : ne la double pas.",
 "Quand ton tour se termine, utilise next-turn une seule fois, pas avant.",
 "Réponds UNIQUEMENT avec du JSON valide sans balise :",
 '{"reply":"Réponse courte en français","commands":[{"type":"move","uid":"...","zone":"base"}]}',
 "commands peut être [] (aucune action). Maximum 8.",
 "Types de commandes possibles : move, add, exhaust, ready, flip, damage, counter, score, draw, channel, mulligan, phase, next-turn, note.",
 "Pour piocher une carte IA : {\"type\":\"draw\",\"player\":\"ai\",\"count\":1}.",
 "Pour ajouter une carte annoncée par l'humain : {\"type\":\"add\",\"player\":\"human\",\"zone\":\"base\",\"card\":{\"code\":\"CODE_CATALOGUE\"}}."
].join("\n");
export function createIntegratedAI({userData,getState,applyBatch,sendMessage,getMessages,getCatalog,
 fetchImpl=fetch,timeoutMs=45000}){
 const file=path.join(userData,".riftbound-ai-settings.json");
 let config=null,processing=false,lastError="",queue=Promise.resolve();
 try{const saved=JSON.parse(fs.readFileSync(file,"utf8"));
  if(saved?.provider)config=validateAIConfig(saved,saved);
 }catch{}
 const status=()=>({configured:!!config,enabled:!!config?.enabled,provider:config?.provider||"",
  model:config?.model||"",endpoint:config?.endpoint||"",hasKey:!!config?.apiKey,
  processing,lastError});
 function configure(input){
  const next=validateAIConfig(input,config||{});
  const temp=file+".tmp";
  try{fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,file);
   if(process.platform!=="win32")fs.chmodSync(file,0o600);
  }finally{try{fs.unlinkSync(temp);}catch{}}
  config=next;lastError="";return status();
 }
 function disable(){
  if(config)configure({...config,enabled:false});
  return status();
 }
 async function respond(message){
  if(!config?.enabled)return;
  const own=config;processing=true;lastError="";
  try{
   const game=getState(),revision=game.revision;
   let catalog=[];
   try{catalog=await getCatalog();}catch{/* Chat still works with previously known cards */}
   const transcript=getMessages(0).messages.slice(-8).map(m=>({role:m.role,text:m.text}));
   const payload={
    model:own.model,temperature:own.provider==="free"?0.1:0.3,max_tokens:1100,
    ...(own.provider==="free"?{response_format:{type:"json_object"}}:{}),
    messages:[
     {role:"system",content:SYSTEM_PROMPT},
     {role:"user",content:JSON.stringify({
      latestHumanMessage:message,conversation:transcript,
      board:modelBoardState(game),knownCards:relevantCards(catalog,message)
     })}
    ]
   };
   const headers={"Content-Type":"application/json"};
   if(own.apiKey)headers.Authorization="Bearer "+own.apiKey;
   const response=await fetchImpl(own.endpoint+"/chat/completions",{
    method:"POST",headers,body:JSON.stringify(payload),
    signal:AbortSignal.timeout(own.provider==="free"?180000:timeoutMs)
   });
   if(!response.ok)throw Error("HTTP "+response.status+" du fournisseur. Vérifie la clé API et le nom du modèle.");
   const packet=await response.json();
   const parsed=extractJSON(packet?.choices?.[0]?.message?.content);
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Réponse IA mal formée.");
   const reply=String(parsed.reply||"").trim().slice(0,1200);
   const commands=validateAgentCommands(parsed.commands||[],game,message,catalog);
   if(commands.length){
    try{await applyBatch(commands,revision);}
    catch(e){sendMessage("⚠️ Plateau non modifié : "+String(e.message||e).slice(0,220)+(reply?"\n"+reply:""));return;}
   }
   sendMessage(reply||"J'ai pris connaissance de ton annonce.");
  }catch(e){
   lastError=e?.name==="TimeoutError"?"Délai de réponse dépassé.":String(e?.message||e).slice(0,250);
   sendMessage("⚠️ Impossible de joindre l'IA intégrée : "+lastError);
  }finally{processing=false;}
 }
 function onHumanMessage(text){
  if(!config?.enabled)return;
  queue=queue.then(()=>respond(text)).catch(e=>{lastError=String(e?.message||e);processing=false;});
 }
 return {configure,disable,status,onHumanMessage};
}
