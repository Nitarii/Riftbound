// Outbound AI opponent. All credentials remain in the locally authenticated server.
import fs from "node:fs";
import path from "node:path";
import {applyCommand} from "./core.mjs";
import {LOCAL_AI_MODEL,freeModelID} from "./free-ai.mjs";
import {buildGameKnowledge} from "./game-knowledge.mjs";
import {planSafeAITurn,planAutonomousAITurn,describeAITurn,enumerateAIAssaults,planAIChainAction} from "./ai-turn.mjs";
import {ADVANCED_LOCAL_MODEL} from "./local-ai-profiles.mjs";
import {detectMessageLanguage,normalizePlayerAnnouncement} from "./player-actions.mjs";
import {allowPhysicalLocalCommand} from "./local-action-gate.mjs";
import {previewCombat} from "./combat-engine.mjs";

const PROVIDERS={openai:"https://api.openai.com/v1",ollama:"http://127.0.0.1:11434/v1",
 lmstudio:"http://127.0.0.1:1234/v1",free:"http://127.0.0.1:11435/v1"};
const DEFAULT_MODELS={openai:"gpt-4.1-mini",ollama:"gpt-oss:20b",lmstudio:"local-model",free:LOCAL_AI_MODEL};
const COMMANDS=new Set(["move","add","exhaust","exhaust-runes","ready","flip","damage","counter","score",
 "draw","channel","mulligan","phase","next-turn","note"]);
const aiHasPriority=game=>Boolean(game?.started&&!game.finished&&
 (game.spellChain?.priority??(game.pendingCombat?game.pendingCombat.focus??"human":game.active))==="ai");
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
 const model=provider==="free"?freeModelID(input.model||LOCAL_AI_MODEL):String(input.model||DEFAULT_MODELS[provider]||"").trim();
 if(!model||model.length>100||!/^[\w./:+-]+$/.test(model))throw Error("Identifiant de modèle invalide.");
 const endpoint=provider==="compatible"?providerURL(input.endpoint):PROVIDERS[provider];
 const supplied=typeof input.apiKey==="string"?input.apiKey.trim():"";
 if(supplied.length>512)throw Error("Clé API trop longue.");
 const apiKey=supplied||(provider===previous.provider?previous.apiKey:"")||"";
 if(["openai","compatible"].includes(provider)&&!apiKey)
  throw Error("Clé API requise : un abonnement ChatGPT ne comprend pas les crédits API.");
 return {provider,model,endpoint,apiKey,enabled:input.enabled!==false,
  ...(provider==="free"&&input.rulesOnly===true?{rulesOnly:true}:{})};
}
const shortCard=c=>c?{code:c.code,name:c.name,type:c.type}:null;
function currentConfrontation(state){
 const fight=state.pendingCombat;
 if(!fight)return null;
 const preview=fight?.kind==="combat"?previewCombat(state,fight.battlefield,fight.attacker,fight.orders):null;
 return {battlefield:state.battlefields[fight.battlefield]?.card?.name,
  kind:fight.kind,attacker:fight.attacker,focus:fight.focus,passes:fight.passes,
  ...(preview?.ready&&preview.attackers.length&&preview.defenders.length?
   {attackMight:preview.attackingMight,defenseMight:preview.defendingMight}:{})};
}
function combatTotalsReply(text,state){
 if(!/^(?:quel(?:le)?s?\b|combien\b|what\b|how much\b|can you (?:tell|give)\b|(?:tu peux|peux-tu) (?:dire|donner|me dire|me donner)\b)/.test(text)||
    !/\b(?:force|forces|might|total|totaux|totals|strength|puissance)\b/.test(text)||
    !/\b(?:attaque|defense|combat|confrontation|attack|showdown|defence|fight)\b/.test(text)||
    /\b(?:si|if|apres que|after i)\b/.test(text))return "";
 const asksBoth=/\b(?:attaque|attack)\b/.test(text)&&/\b(?:defense|defence)\b/.test(text);
 if(!asksBoth&&!/\b(?:total|totaux|totals)\b|\b(?:force|forces|might|strength) (?:du|de la|of the|in the) (?:combat|confrontation|fight|showdown)\b/.test(text))
  return "";
 const past=/\b(?:dernier combat|combat precedent|combat resolu|etai(?:en)?t|avaient|last (?:fight|combat)|previous (?:fight|combat)|were)\b/.test(text);
 const english=/^(?:what|how much|can you)\b/.test(text);
 const current=past?null:currentConfrontation(state);
 if(current){
  if(!Number.isFinite(current.attackMight)||!Number.isFinite(current.defenseMight))
   return english?"There is no combat damage total yet at "+current.battlefield+".":
    "Il n’y a pas encore de total de combat sur "+current.battlefield+".";
  return english?"At "+current.battlefield+", the attack is at "+current.attackMight+
   " and the defense is at "+current.defenseMight+" before reactions.":
   "Sur "+current.battlefield+", l’attaque est à "+current.attackMight+
   " et la défense à "+current.defenseMight+" avant les réactions.";
 }
 const last=state.lastCombat;
 if(!last)return english?"The board has no recorded combat.":"Le plateau ne contient aucun combat résolu.";
 if(!last.exchanged)return english?"The last combat at "+last.battlefield+" had no combat damage step.":
  "Le dernier combat sur "+last.battlefield+" s’est terminé sans échange de dégâts.";
 return english?"In the last combat at "+last.battlefield+", the attack was "+last.attackingMight+
  " and the defense was "+last.defendingMight+".":
  "Au dernier combat sur "+last.battlefield+", l’attaque était à "+last.attackingMight+
  " et la défense à "+last.defendingMight+".";
}
export function modelBoardState(state){
 return {
  revision:state.revision,turn:state.turn,phase:state.phase,active:state.active,
  firstPlayer:state.firstPlayer,turnActions:state.turnActions,pendingEffects:(state.pendingEffects||[]).slice(0,5),
  spellChain:state.spellChain||null,
  delayedEnding:state.delayedEnding||[],
  confrontation:currentConfrontation(state),
  lastResolvedCombat:state.lastCombat||null,
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
       power:c.power,energy:c.energy,might:c.might,exhausted:c.exhausted,attachedTo:c.attachedTo,
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
export function extractJSON(raw){
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
 try{return JSON.parse(value);}catch{}
 // Some local models add non-JSON explanations before or after a valid object.
 // Extract only a fully parseable JSON object; never turn prose into commands.
 const start=value.indexOf("{"),end=value.lastIndexOf("}");
 if(start>=0&&end>start){
  try{return JSON.parse(value.slice(start,end+1));}catch{}
 }
 throw Error("Le modèle local n'a pas retourné de réponse structurée.");
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
  // Never allow the conversation model to bypass actual card play or payment.
  if(cmd.type==="move"&&card?.owner==="ai"&&["hand","champion"].includes(card.zone))
   throw Error("L'IA doit utiliser le moteur de paiement pour jouer cette carte.");


  if(cmd.type==="damage"&&card?.owner==="human"&&
    !/\b(?:d[ée]g[aâ]t|blesse|inflige|touche|damage|deal|hit)\b/i.test(heard))
   throw Error("Le joueur n'a annoncé aucun dégât sur cette carte.");
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
  if(cmd.type==="score"&&cmd.player==="ai")
   throw Error("Les points de l'IA proviennent uniquement des règles vérifiées.");
  if(cmd.type==="score"&&!/\b(?:point|pv|score|marqu|gagn[ée]|victory|scored)\b/i.test(heard))
   throw Error("Le joueur n'a annoncé aucun changement de score.");
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
 "CONNAISSANCES : gameReference.rulebook.relevant contient les règles du RUP5 FR du 09/10/2026 avec numéros et pages; gameReference.rules est un mémo. Vérifie les textes des cartes présents dans gameReference.cards.",
 "Règles 002, 054 et 055 : le texte de carte prime, les interdictions priment, et seules les instructions possibles sont exécutées. Quand tu expliques une décision de jeu, cite le numéro de la règle correspondante. Ne simule jamais un effet inconnu.",
 "L'utilisateur manipule ses cartes physiques. Tu ne vois jamais sa main cachée. Tu vois ta propre main IA et les cartes publiques.",
 "latestHumanMessage is the exact utterance; normalizedPlayerAnnouncement is ONLY a tolerant transcription aid, not proof that a card or move is legal. Never require perfect spelling. Infer intent from context but ask a short clarifying question if several card names or game actions could fit.",
 "The server already applied recognized physical player actions to board before invoking you. Never execute the same human action again or claim it failed if it is already visible. Apply ONLY new, legal actions that are missing from the board.",
 "Tu dois lire l'état du plateau, identifier les UID EXACTS présents dans board.cards, évaluer tes cartes disponibles et annoncer tes actions avant de les appliquer. Never invent card UIDs.",
 "Un déplacement ou effet n'est possible que si le texte de carte connu et les règles le permettent; quand un texte est absent ou ambigu, demande au joueur.",
 "Les actions que tu fournis changent vraiment le plateau; ne simule pas le résultat d'un combat incertain.",
 "L'IA ne joue JAMAIS une carte depuis sa main via move : seul le moteur déterministe utilise play-paid, paie les runes et vérifie les capacités. Add sert aux cartes physiques confirmées.",
 "Quand le joueur termine son tour, le serveur a déjà avancé : ne l'avance pas deux fois. Lorsque TU finis ton tour, next-turn une seule fois.",
 "Ne fabrique jamais de points de victoire, de dégâts ou de paiements. Le modèle conversationnel ne pilote pas directement sa main : le moteur déterministe sélectionne les cartes et vérifie les coûts.",
 "Les cartes doivent être jouées avec leurs coûts et capacités imprimés. Le moteur valide play-paid, les déclenchements et leurs choix ; n’affirme jamais qu’un effet non supporté a été résolu.",
 "Réponds uniquement par un objet JSON avec deux propriétés : reply (une véritable réponse naturelle à la situation du joueur, dans sa langue) et commands (un tableau de commandes autorisées, huit maximum). Si aucune action précise n’est sûre, retourne un tableau vide et explique brièvement pourquoi. Ne copie jamais les instructions, un exemple de format, ni une phrase générique répétitive.",
 "Le logiciel n'est pas un arbitre des règles de compétition. Pour toute incertitude, expliquer la limite et se référer au hub officiel cité dans gameReference."
].join("\n");
// The 4B Instruct model uses an 8192-token context: keep its instructions
// bounded, reserving space for actual card information and structured output.
export const FREE_SYSTEM_PROMPT=[
 "You are a physical Riftbound opponent. Understand French, English, mixed language and typos. Never see or ask for the human's hidden hand.",
 "Board and card reference are facts. gameReference.rulebook.relevant gives relevant numbered rules from RUP5 FR (9 Oct 2026). Apply card-text priority and prohibitions. Never invent a card, UID, ability, payment or resolution. Cite a rule number for any rules explanation and ask if uncertain.",
 "Only the deterministic engine plays the AI turn. Report completed moves from confirmed board facts. A pending spell, confrontation, or announced intention is not a completed result. board.confrontation totals are provisional; board.lastResolvedCombat contains actual damage assignments. Never claim a new move has been applied.",
 "Return only a JSON object with reply (one natural short sentence in preferredReplyLanguage) and commands (array). No surrounding text or examples.",
 "Most actions are already handled by deterministic rules. Only if the human explicitly says to move, ready or exhaust a PUBLIC human card, you may propose one matching command with an existing UID. The message must name that card and a move must name the battlefield. Do not suggest scores, draws, resource payments or new cards. Be concise."
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
 fetchImpl=fetch,timeoutMs=45000,tacticalBudgetMs=Number(process.env.RIFTBOUND_TACTICAL_MS??3000)}){
 const file=path.join(userData,".riftbound-ai-settings.json");
 let config=null,processing=false,lastError="",queue=Promise.resolve(),lastEffectPrompt="";
 // Game turns are deterministic and MUST NOT be queued behind a slow model.
 let autonomousRunning=false,lastAutonomousRevision="",liveChatAbort=null;
 try{const saved=JSON.parse(fs.readFileSync(file,"utf8"));
  if(saved?.provider)config=validateAIConfig(saved,saved);
 }catch{}
 const status=()=>({configured:!!config,enabled:!!config?.enabled,provider:config?.provider||"",
  model:config?.model||"",endpoint:config?.endpoint||"",hasKey:!!config?.apiKey,
  rulesOnly:!!config?.rulesOnly,processing:processing||autonomousRunning,lastError});
 function configure(input){
  const next=validateAIConfig(input,config||{});
  const temp=file+".tmp";
  try{fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,file);
   if(process.platform!=="win32")fs.chmodSync(file,0o600);
  }finally{try{fs.unlinkSync(temp);}catch{}}
  liveChatAbort?.abort();
  config=next;lastError="";return status();
 }
 function disable(){
  if(config)configure({...config,enabled:false});
  return status();
 }
 function enable(){
  if(config)configure({...config,enabled:true});
  return status();
 }
 async function chooseAssault(game,own){
  const budget=Number.isFinite(tacticalBudgetMs)?Math.max(0,Math.min(4000,tacticalBudgetMs)):0;
  if(!budget||own.rulesOnly||own.provider!=="free"||own.model!==ADVANCED_LOCAL_MODEL)return null;
  const ranked=enumerateAIAssaults(game,{limit:4});
  if(ranked.length<2||ranked[0].projectedWin)return null;
  // Qwen can choose among close, already simulated alternatives; it cannot
  // produce arbitrary commands or sacrifice an available immediate win.
  const choices=ranked.filter(x=>x.value>=ranked[0].value-6&&x.deniesHold===ranked[0].deniesHold);
  if(choices.length<2)return null;
  const signal=AbortSignal.timeout(budget);
  try{
   const result=await fetchImpl(own.endpoint+"/chat/completions",{method:"POST",
    headers:{"Content-Type":"application/json"},signal,body:JSON.stringify({
     model:own.model,temperature:0,max_tokens:40,chat_template_kwargs:{enable_thinking:false},
     response_format:{type:"json_object"},messages:[
      {role:"system",content:"Choisis le meilleur assaut légal de Riftbound. Les dégâts indiqués supposent aucune réaction. Priorité à la victoire, au maintien et aux échanges favorables. Réponds uniquement par {\"choice\": un entier de la liste}."},
      {role:"user",content:JSON.stringify({score:{ai:game.players.ai.score,human:game.players.human.score},
       choices:choices.map(({command,value,...option},i)=>({id:i,...option}))})}
     ]})});
   if(!result.ok)return null;
   const json=await result.json();
   const index=extractJSON(json.choices?.[0]?.message?.content).choice;
   return Number.isInteger(index)?choices[index]?.command??null:null;
  }catch{return null;}
 }
 // Execute a real AI turn independently of any queued Qwen conversation.
 // This is deliberately not a language-model request: the legal move planner
 // checks payment, printed effects and combat before committing a batch.
 async function runAutonomousTurn(){
  if(autonomousRunning||!config?.enabled)return;
  const game=getState();
  if(!aiHasPriority(game))return;
  const session=getMessages(0).session;
  const key=session+":"+game.revision;
  if(lastAutonomousRevision===key)return;
  lastAutonomousRevision=key;
  const own=config;
  autonomousRunning=true;
  let committed=false;
  try{
   if(game.pendingEffects?.length){
    const pending=game.pendingEffects[0];
    if(lastEffectPrompt!==key){
     lastEffectPrompt=key;
     sendMessage("Effet de "+pending.cardName+" à résoudre : "+pending.text+
      ". Le plateau attend la résolution de cet effet.");
    }
    return;
   }
   if(game.spellChain||game.pendingCombat?.focus==="ai"){
    const action=planAIChainAction(game);
    if(action){
     const updated=await applyBatch([action],game.revision);
     committed=true;
     if(config===own&&getMessages(0).session===session)sendMessage(updated?.message??getState().message);
    }
    return;
   }
   const preferredAssault=await chooseAssault(game,own);
   if(config!==own||getState().revision!==game.revision||getMessages(0).session!==session)return;
   const plan=planAutonomousAITurn(game,{preferredAssault});
   if(!plan.commands.length){
    lastError=plan.error||plan.summary||"Tour IA bloqué par une règle ou un effet à résoudre.";
    sendMessage("⚠️ "+lastError+" Aucun coup n'a été simulé.");
    return;
   }
   await applyBatch(plan.commands,game.revision);
   committed=true;
   if(config===own&&getMessages(0).session===session)
    sendMessage(describeAITurn(plan,{english:false}));
   lastError="";
  }catch(error){
   lastError=String(error?.message||error).slice(0,250);
   if(config===own&&getMessages(0).session===session)
    sendMessage("⚠️ Tour automatique non appliqué : "+lastError+
     ". Les actions restent sous contrôle des règles.");
  }finally{
   autonomousRunning=false;
   // applyBatch can schedule its notification while this runner is still
   // awaiting its promise, so that notification gets coalesced and lost.
   // Recheck after releasing the lock when a legal partial turn was committed.
   if(config===own&&(committed||getState().revision!==game.revision))queueMicrotask(()=>advanceTurnIfAI());
  }
 }
 function advanceTurnIfAI(){
  const game=getState();
  if(!config?.enabled||!aiHasPriority(game))return false;
  // Stop a conversational response from holding up the turn and from
  // publishing obsolete information after the board has advanced.
  liveChatAbort?.abort();
  queueMicrotask(()=>{void runAutonomousTurn();});
  return true;
 }
 async function respond(message,session,{actionApplied=false}={}){
  if(!config?.enabled||getMessages(0).session!==session)return;
  const own=config;processing=true;lastError="";
  try{
   const game=getState(),revision=game.revision;
   const stillCurrent=()=>getMessages(0).session===session&&config===own&&!!config.enabled;
   const normalized=normalizePlayerAnnouncement(message);
   const question=!actionApplied&&(/\?/.test(message)||
    /^(?:pourquoi|combien|quelle? (?:est|force|regle)|quels? (?:sont|degats|effets)|comment|why|what|how)\b/.test(normalized));
   if(game.pendingEffects?.length){
    const pending=game.pendingEffects[0];
    const key=pending.id+":"+game.revision;
    if(stillCurrent()&&lastEffectPrompt!==key){
     lastEffectPrompt=key;
     sendMessage("Effet de carte à résoudre — "+pending.cardName+" : "+pending.text+
      ". "+pending.reason+
      ". Le plateau est en attente pour éviter d'ignorer cette capacité.");
    }
    return;
   }
   if(game.spellChain&&!question){
    if(stillCurrent()&&!actionApplied)sendMessage("La chaîne attend une Réaction ou un passage de priorité.");
    return;
   }
   if(game.pendingCombat&&!question){
    if(stillCurrent()&&!actionApplied)sendMessage(
     "Confrontation en cours sur "+game.battlefields[game.pendingCombat.battlefield]?.card?.name+
     ". Utilise la priorité affichée pour annoncer une réaction ou passer."
    );
    return;
   }
   // Even a previously queued conversation must not run a competing turn.
   // All AI moves pass through one revision-guarded deterministic runner.
   if(game.started&&game.active==="ai"&&advanceTurnIfAI())return;
   if(actionApplied&&game.started)return; // Physical action already applied.
   if(own.rulesOnly){
    if(stillCurrent())sendMessage("Le moteur de jeu est actif. Pour les réponses de conversation, active Qwen depuis le gestionnaire. État : "+game.message);
    return;
   }
   let catalog=[];
   try{catalog=await getCatalog();}catch{/* Chat still works with previously known cards */}
   const free=own.provider==="free";
   const template=free&&own.model===ADVANCED_LOCAL_MODEL?{chat_template_kwargs:{enable_thinking:false}}:{};
   const transcript=getMessages(0).messages.slice(-8)
    .map(m=>({role:m.role,text:String(m.text||"").slice(0,free?450:1200)}));
   const payload={
    model:own.model,temperature:free?0.2:0.3,max_tokens:free?380:1100,
    ...(own.provider==="free"?{response_format:{type:"json_object"}}:{}),
    ...template,
    messages:[
     {role:"system",content:free?FREE_SYSTEM_PROMPT:SYSTEM_PROMPT},
     {role:"user",content:JSON.stringify({
      latestHumanMessage:message,
      normalizedPlayerAnnouncement:normalized,
      preferredReplyLanguage:detectMessageLanguage(message),
      conversation:transcript,
      board:modelBoardState(game),
      gameReference:buildGameKnowledge(game,message,catalog,{
       maxCards:free?12:18,maxText:free?500:700,
       ruleCount:free?5:5
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
   const controller=new AbortController();
   liveChatAbort=controller;
   const sendRequest=async body=>fetchImpl(own.endpoint+"/chat/completions",{
    method:"POST",headers,body:JSON.stringify(body),
    signal:AbortSignal.any([AbortSignal.timeout(free?20000:timeoutMs),
     controller.signal])
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
     model:own.model,temperature:0.2,max_tokens:240,...template,
     messages:[{role:"system",content:FREE_SYSTEM_PROMPT},
      {role:"user",content:JSON.stringify(smallContext)}]
    });
   }
   if(!stillCurrent()||getState().revision!==revision)return;
   if(!response.ok)throw Error(modelHTTPError(response.status,own.provider));
   const packet=await response.json();
   const parsed=extractJSON(packet?.choices?.[0]?.message?.content);
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Réponse IA mal formée.");
   let reply=String(parsed.reply||"").trim().slice(0,1200);
   const proposed=Array.isArray(parsed.commands)?parsed.commands.slice(0,8):[];
   const commands=[],rejected=[];
   let preview=game;
   for(const command of proposed){
    if(question||own.provider==="free"&&!allowPhysicalLocalCommand(command,game,message)){
     rejected.push("Commande sans annonce de jeu correspondante");
     continue;
    }
    try{
     const checked=validateAgentCommands([command],preview,message,catalog);
     if(checked.length){commands.push(...checked);preview=applyCommand(preview,checked[0]);}
    }catch(e){rejected.push(String(e.message||e));}
   }
   const english=detectMessageLanguage(message)==="en";
   // A valid but incomplete note/phase is not a finished AI turn.
   // Finish only simple, verifiable actions without inventing card effects.
   if(!question&&!game.pendingCombat&&!game.spellChain&&game.active==="ai"&&preview.active==="ai"){
    const safe=planSafeAITurn(preview);
    commands.push(...safe);
   }
   if(!stillCurrent())return;
   if(commands.length){
    try{await applyBatch(commands,revision);}
    catch(e){sendMessage((english?"Board unchanged: ":"Plateau inchangé : ")+String(e.message||e).slice(0,200));return;}
    if(stillCurrent())sendMessage(getState().message||groundedReply("",commands,game,english));
    return;
   }
   if(rejected.length){
    // Never claim an invalid movement happened.
    reply=(english?"Some suggested moves were not executed: ":"Certains déplacements proposés n'ont pas été exécutés : ")+
     [...new Set(rejected)].slice(0,2).join(". ");
   }
   if(stillCurrent())sendMessage(groundedReply(reply,commands,game,english));
  }catch(e){
   if(e?.name==="AbortError"||
      getMessages(0).session!==session||config!==own||!config?.enabled)return;
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
   if(own.provider==="free"&&/réponse structurée|Réponse IA mal formée/.test(lastError)){
   // A broken model response is NOT a gameplay move. Do not spam raw JSON
   // errors or claim the card was played when the deterministic engine did not.
   sendMessage("Je n'ai pas pu interpréter la réponse du modèle local. "+
    "Le plateau reste inchangé. Répète ton action complète ou consulte le journal du gestionnaire.");
   return;
  }
  sendMessage((own.provider==="free"?"⚠️ ":"⚠️ Impossible de joindre l'IA intégrée : ")+lastError);
  }finally{processing=false;}
 }
 function onHumanMessage(text,{actionApplied=false}={}){
  if(!config?.enabled)return;
  const exactCombatReply=actionApplied?"":combatTotalsReply(normalizePlayerAnnouncement(text),getState());
  if(exactCombatReply){
   sendMessage(exactCombatReply);
   advanceTurnIfAI();
   return;
  }
  // A player can finish their turn by voice, text, or a board button.
  // Do not enqueue the AI's turn behind any pending inference call.
  if(advanceTurnIfAI())return;
  const session=getMessages(0).session;
  queue=queue.then(()=>respond(text,session,{actionApplied}))
   .catch(e=>{lastError=String(e?.message||e);processing=false;});
 }
 return {configure,disable,enable,status,onHumanMessage,advanceTurnIfAI};
}
