// Outbound AI opponent. All credentials remain in the locally authenticated server.
import fs from "node:fs";
import path from "node:path";
import {applyCommand} from "./core.mjs";
import {buildGameKnowledge} from "./game-knowledge.mjs";
import {planSafeAITurn,planAutonomousAITurn,describeAITurn} from "./ai-turn.mjs";
import {detectMessageLanguage,normalizePlayerAnnouncement} from "./player-actions.mjs";

const PROVIDERS={openai:"https://api.openai.com/v1",ollama:"http://127.0.0.1:11434/v1",
 lmstudio:"http://127.0.0.1:1234/v1",free:"http://127.0.0.1:11435/v1"};
const DEFAULT_MODELS={openai:"gpt-4.1-mini",ollama:"gpt-oss:20b",lmstudio:"local-model",free:"qwen3:0.6b"};
const COMMANDS=new Set(["move","add","exhaust","exhaust-runes","ready","flip","damage","counter","score",
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
const shortCard=c=>c?{code:c.code,name:c.name,type:c.type}:null;
export function modelBoardState(state){
 return {
  revision:state.revision,turn:state.turn,phase:state.phase,active:state.active,
  firstPlayer:state.firstPlayer,turnActions:state.turnActions,
  started:state.started,battlefields:state.battlefields.map(b=>({owner:b.owner,card:shortCard(b.card)})),
  players:{
   human:{legend:shortCard(state.players.human.legend),champion:shortCard(state.players.human.champion),
    score:state.players.human.score,handCount:state.players.human.handCount},
   ai:{legend:shortCard(state.players.ai.legend),champion:shortCard(state.players.ai.champion),
    score:state.players.ai.score,handCount:state.players.ai.handCount,
    deckCount:state.players.ai.deckCount,runeCount:state.players.ai.runeCount}
  },
  cards:state.cards.filter(c=>c.zone!=="deck"&&c.zone!=="rune-deck"&&
   !(c.owner==="human"&&c.zone==="hand")).map(c=>
    c.owner==="human"&&c.faceDown?
      {uid:c.uid,owner:c.owner,zone:c.zone,faceDown:true}:
      {uid:c.uid,owner:c.owner,zone:c.zone,battlefield:c.battlefield,
       code:c.code,name:c.name,type:c.type,
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
 // Some small local Qwen models include a reasoning tag even when asked not to.
 // Never display that tag to the player; parse only the final JSON.
 if(value.includes("</think>"))value=value.slice(value.lastIndexOf("</think>")+8).trim();
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
  if(cmd.type==="exhaust-runes"&&
   (!["human","ai"].includes(cmd.player)||!Number.isInteger(cmd.count)||cmd.count<1||cmd.count>3))
    throw Error("Épuisement de runes invalide.");
  if(cmd.type==="exhaust-runes"&&cmd.player==="human")
    throw Error("L'IA ne peut pas épuiser les runes physiques sans confirmation du joueur.");
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
// Prevent tiny local models from copying output-template instructions verbatim.
export function groundedReply(reply,commands=[],board={},english=false){
 const text=String(reply||"").trim().slice(0,1200);
 const placeholder=/^(?:annonce courte(?: en fran[cç]ais)?|announce (?:the )?(?:possible )?actions|annoncer? les actions(?: possibles)?|short (?:french )?(?:reply|announcement)|réponse courte(?: en fran[cç]ais)?|actions possibles|reply|message|je vais annoncer les actions possibles)[.!\s]*$/i;
 if(text&&!placeholder.test(text))return text;
 const labels=[];
 const names=new Map((board.cards||[]).filter(c=>c?.uid).map(c=>[c.uid,c.name]));
 for(const cmd of commands){
  if(cmd.type==="channel")labels.push(english?"channeled "+cmd.count+" rune(s)":"canalisé "+cmd.count+" rune(s)");
  else if(cmd.type==="draw")labels.push(english?"drew "+cmd.count+" card(s)":"pioché "+cmd.count+" carte(s)");
  else if(cmd.type==="move")labels.push((english?"played ":"joué ")+(names.get(cmd.uid)|| (english?"an existing card":"une carte connue")));
  else if(cmd.type==="next-turn")labels.push(english?"ended my turn":"terminé mon tour");
  else if(cmd.type==="score")labels.push(english?"updated the score":"mis à jour le score");
 }
 if(labels.length){
  const unique=[...new Set(labels)];
  return (english?"I ":"J'ai ")+unique.join(", ")+".";
 }
 return english?"I'm listening. Tell me your next move, or ask about a specific card.":
  "Je t'écoute. Indique-moi ton prochain mouvement, ou pose-moi une question sur une carte précise.";
}
// The compact model is preconfigured by the program, without a user prompt.
// Rules and card texts are provided fresh for every message via retrieval.
export const SYSTEM_PROMPT=[
 "You are the opponent in a PHYSICAL Riftbound game and the board operator. Fully understand conversational French, English and FR/EN code-switching, with typos, incorrect grammar, missing accents, casual expressions and imperfect speech transcripts. Reply in preferredReplyLanguage provided with each message, naturally and concisely.",
 "CONNAISSANCES : gameReference contient un mémo des règles Riot, les sources officielles, les commandes du logiciel et les textes exacts des cartes utiles.",
 "Le texte réel d'une carte, puis ses errata officiels, priment sur ton intuition. N'invente jamais une capacité, un coût, une priorité ou une règle.",
 "L'utilisateur manipule ses cartes physiques. Tu ne vois jamais sa main cachée. Tu vois ta propre main IA et les cartes publiques.",
 "latestHumanMessage is the exact utterance; normalizedPlayerAnnouncement is ONLY a tolerant transcription aid, not proof that a card or move is legal. Never require perfect spelling. Infer intent from context but ask a short clarifying question if several card names or game actions could fit.",
 "The server already applied recognized physical player actions to board before invoking you. Never execute the same human action again or claim it failed if it is already visible. Apply ONLY new, legal actions that are missing from the board.",
 "Tu dois lire l'état du plateau, identifier les UID EXACTS présents dans board.cards, évaluer tes cartes disponibles et annoncer tes actions avant de les appliquer. Never invent card UIDs.",
 "Un déplacement ou effet n'est possible que si le texte de carte connu et les règles le permettent; quand un texte est absent ou ambigu, demande au joueur.",
 "Les actions que tu fournis changent vraiment le plateau; ne simule pas le résultat d'un combat incertain.",
 "Joue une carte IA avec move(uid,zone) depuis ta main existante, jamais avec add. Add est réservé à une carte humaine explicitement annoncée et trouvée dans gameReference.cards.",
 "Quand le joueur termine son tour, le serveur a déjà avancé : ne l'avance pas deux fois. Lorsque TU finis ton tour, next-turn une seule fois.",
 "Choisis tes actions parmi move, add, exhaust, exhaust-runes, ready, flip, damage, counter, score, draw, channel, mulligan, phase, next-turn, note. AI must use existing UID from own hand when playing a card, channel its real runes and track payment.",
 "Pour jouer une carte, déplace-la depuis ta main uniquement avec son UID exact présent dans board.cards. Pour piocher, utilise draw(player=ai,count=1). N’invente aucun identifiant et ne paraphrase pas une commande dans reply sans l’émettre dans commands.",
 "Réponds uniquement par un objet JSON avec deux propriétés : reply (une véritable réponse naturelle à la situation du joueur, dans sa langue) et commands (un tableau de commandes autorisées, huit maximum). Si aucune action précise n’est sûre, retourne un tableau vide et explique brièvement pourquoi. Ne copie jamais les instructions, un exemple de format, ni une phrase générique répétitive.",
 "Le logiciel n'est pas un arbitre des règles de compétition. Pour toute incertitude, expliquer la limite et se référer au hub officiel cité dans gameReference."
].join("\n");
// The 0.6B model has a small 4096-token local context: keep its instructions
// bounded, reserving space for actual card information and structured output.
export const FREE_SYSTEM_PROMPT=[
 "You are a physical Riftbound opponent. Understand French, English, mixed language and typos. Never see or ask for the human's hidden hand.",
 "Board and card reference are facts. Never invent a card, UID, ability or payment. Ask only when genuinely unclear.",
 "Human commands were already applied by server. If board.active is ai, play your own turn using only real board.cards UIDs and valid commands. No repeated human actions.",
 "Return only a JSON object with reply (one natural short sentence in preferredReplyLanguage) and commands (array). No surrounding text or examples.",
 "Allowed: phase, channel, draw, move, exhaust-runes, next-turn, note. Do not guess effects. Be concise."
].join("\n");
export function modelHTTPError(status,provider){
 if(provider==="free"){
  if([400,413,422].includes(status))return "IA locale HTTP "+status+" : le moteur a refusé le format ou la taille de la requête, même après une tentative simplifiée.";
  if(status===503)return "IA locale HTTP 503 : modèle occupé ou non prêt. Réessaie dans un instant.";
  return "IA locale HTTP "+status+" : réponse du moteur local indisponible. Vérifie que le compagnon Windows est lancé.";
 }
 return "HTTP "+status+" du fournisseur. Vérifie sa configuration et sa disponibilité.";
}
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
 async function respond(message,session,{actionApplied=false}={}){
  if(!config?.enabled||getMessages(0).session!==session)return;
  const own=config;processing=true;lastError="";
  try{
   const game=getState(),revision=game.revision;
   const stillCurrent=()=>getMessages(0).session===session&&config===own&&!!config.enabled;
   if(game.pendingCombat){
    // The local opponent has already passed priority in the base combat
    // engine. Never call Qwen to fabricate a reaction or to skip the user's.
    if(stillCurrent())sendMessage(
     "Confrontation en cours sur "+game.battlefields[game.pendingCombat.battlefield]?.card?.name+
     ". Je passe ma réaction. Tu peux annoncer un effet puis passer, ou utiliser les boutons Combat."
    );
    return;
   }
   if(actionApplied&&game.started&&game.active==="human")return;
   // The deterministic engine owns the AI's turn. An untrusted 0.6B model
   // must not select imaginary payments, score without a capture, or end its
   // turn before moving ready units onto a battlefield.
   if(game.started&&game.active==="ai"){
    const plan=planAutonomousAITurn(game);
    if(!stillCurrent())return;
    if(!plan.commands.length){
     lastError=plan.error||"Tour IA impossible sans mouvement sûr.";
     sendMessage("⚠️ "+lastError);return;
    }
    await applyBatch(plan.commands,revision);
    if(stillCurrent()){
     const english=detectMessageLanguage(message)==="en";
     sendMessage(describeAITurn(plan,{english}));
    }
    return;
   }
   let catalog=[];
   try{catalog=await getCatalog();}catch{/* Chat still works with previously known cards */}
   const free=own.provider==="free";
   const transcript=getMessages(0).messages.slice(free?-2:-8)
    .map(m=>({role:m.role,text:String(m.text||"").slice(0,free?140:1200)}));
   const payload={
    model:own.model,temperature:free?0.25:0.3,max_tokens:free?380:1100,
    ...(own.provider==="free"?{response_format:{type:"json_object"}}:{}),
    messages:[
     {role:"system",content:free?FREE_SYSTEM_PROMPT:SYSTEM_PROMPT},
     {role:"user",content:(own.provider==="free"?"/no_think\n":"")+JSON.stringify({
      latestHumanMessage:message,
      normalizedPlayerAnnouncement:normalizePlayerAnnouncement(message),
      preferredReplyLanguage:detectMessageLanguage(message),
      conversation:transcript,
      board:modelBoardState(game),
      gameReference:buildGameKnowledge(game,message,catalog,{
       maxCards:free?6:18,maxText:free?180:700,
       ruleCount:free?2:5
      }),
      // Retained for API compatibility with previously supported model prompts.
      knownCards:(free?[]:relevantCards(catalog,message))
       .slice(0,free?0:12)
       .map(c=>({...c,text:String(c.text||"").slice(0,own.provider==="free"?180:1300)}))
     })}
    ]
   };
   const headers={"Content-Type":"application/json"};
   if(own.apiKey)headers.Authorization="Bearer "+own.apiKey;
   const sendRequest=async body=>fetchImpl(own.endpoint+"/chat/completions",{
    method:"POST",headers,body:JSON.stringify(body),
    signal:AbortSignal.timeout(free?180000:timeoutMs)
   });
   let response=await sendRequest(payload);
   if(free&&[400,413,422].includes(response.status)&&!response.ok){
    // Some bundled llama.cpp builds reject JSON grammar / long contexts.
    // Retry without a grammar and with a much shorter, bounded reference.
    const smallContext={
     latestHumanMessage:message.slice(0,180),
     preferredReplyLanguage:detectMessageLanguage(message),
     board:modelBoardState(game),
     gameReference:buildGameKnowledge(game,message,catalog,{
      maxCards:3,maxText:110,ruleCount:1
     })
    };
    response=await sendRequest({
     model:own.model,temperature:0.2,max_tokens:240,
     messages:[{role:"system",content:FREE_SYSTEM_PROMPT},
      {role:"user",content:"/no_think\\n"+JSON.stringify(smallContext)}]
    });
   }
   if(!stillCurrent())return;
   if(!response.ok)throw Error(modelHTTPError(response.status,own.provider));
   const packet=await response.json();
   const parsed=extractJSON(packet?.choices?.[0]?.message?.content);
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Réponse IA mal formée.");
   let reply=String(parsed.reply||"").trim().slice(0,1200);
   const proposed=own.provider==="free"?[]:
    Array.isArray(parsed.commands)?parsed.commands.slice(0,8):[];
   const commands=[],rejected=[];
   let preview=game;
   for(const command of proposed){
    try{
     const checked=validateAgentCommands([command],preview,message,catalog);
     if(checked.length){commands.push(...checked);preview=applyCommand(preview,checked[0]);}
    }catch(e){rejected.push(String(e.message||e));}
   }
   const english=detectMessageLanguage(message)==="en";
   let fallback=false;
   // A valid but incomplete note/phase is not a finished AI turn.
   // Finish only simple, verifiable actions without inventing card effects.
   if(game.active==="ai"&&preview.active==="ai"){
    const safe=planSafeAITurn(preview);
    if(safe.length){commands.push(...safe);fallback=true;}
   }
   if(!stillCurrent())return;
   if(commands.length){
    try{await applyBatch(commands,revision);}
    catch(e){sendMessage((english?"Board unchanged: ":"Plateau inchangé : ")+String(e.message||e).slice(0,200));return;}
   }
   if(fallback)reply=groundedReply("",commands,game,english);
   else if(rejected.length){
    // Never claim an invalid movement happened.
    reply=(english?"Some suggested moves were not executed: ":"Certains déplacements proposés n'ont pas été exécutés : ")+
     [...new Set(rejected)].slice(0,2).join("; ")+(commands.length?"":"");
   }
   if(stillCurrent())sendMessage(groundedReply(reply,commands,game,english));
  }catch(e){
   if(getMessages(0).session!==session||config!==own||!config?.enabled)return;
   lastError=e?.name==="TimeoutError"?"Délai de réponse dépassé.":String(e?.message||e).slice(0,250);
   // Invalid JSON from a small language model must not freeze the AI turn.
   const current=getState();
   if(current?.active==="ai"&&current.started){
    const plan=planAutonomousAITurn(current);
    if(plan.commands.length){
     try{
      await applyBatch(plan.commands,current.revision);
      sendMessage(describeAITurn(plan,{english:detectMessageLanguage(message)==="en"}));
      return;
     }catch{}
    }
   }
   sendMessage((own.provider==="free"?"⚠️ ":"⚠️ Impossible de joindre l'IA intégrée : ")+lastError);
  }finally{processing=false;}
 }
 function onHumanMessage(text,{actionApplied=false}={}){
  if(!config?.enabled)return;
  const session=getMessages(0).session;
  queue=queue.then(()=>respond(text,session,{actionApplied})).catch(e=>{lastError=String(e?.message||e);processing=false;});
 }
 return {configure,disable,status,onHumanMessage};
}
