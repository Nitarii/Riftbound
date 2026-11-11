// Text-only handoff for an agent without browser/HTTP tools.
// No hidden cards, deck order, local tokens, or remote access secrets are exported.
import {applyCommand} from "./core.mjs";

const allowed=new Set([
 "note","start","next-turn","phase","add","move","remove","exhaust",
 "ready","flip","counter","damage","score","hand-count","draw","channel","mulligan"
]);
const cleanCard=c=>c?{
 code:String(c.code||""),name:String(c.name||""),type:String(c.type||""),
 text:String(c.text||"").slice(0,1400),energy:c.energy??null,power:c.power??null,
 might:c.might??null
}:null;
const cleanPlayer=p=>({
 legend:cleanCard(p?.legend),champion:cleanCard(p?.champion),
 score:p?.score??0,handCount:p?.handCount??0,
 deckCount:p?.deckCount??null,runeCount:p?.runeCount??0,
 deckName:p?.deckName||""
});
const shownCard=c=>{
 if(c.zone==="hand"||c.faceDown){
   return {uid:c.uid,owner:c.owner,zone:c.zone,battlefield:c.battlefield,
     faceDown:true};
 }
 return {uid:c.uid,owner:c.owner,zone:c.zone,battlefield:c.battlefield,
   exhausted:!!c.exhausted,damage:c.damage||0,counters:c.counters||{},
   ...cleanCard(c)};
};
export function publicGameState(state){
 if(!state||typeof state!=="object"||!state.players)throw Error("État de partie indisponible");
 return {
  revision:state.revision,turn:state.turn,phase:state.phase,
  active:state.active,started:!!state.started,
  players:{human:cleanPlayer(state.players.human),ai:cleanPlayer(state.players.ai)},
  battlefields:(state.battlefields||[]).map(b=>({owner:b.owner,card:cleanCard(b.card)})),
  cards:(state.cards||[]).filter(c=>c.zone!=="deck"&&c.zone!=="rune-deck").map(shownCard)
  // Never export state.decks, player's private notes, or free-form history.
 };
}
export function manualAgentRequest(state){
 const publicView=publicGameState(state);
 return [
  "Tu es mon adversaire IA dans une partie PHYSIQUE de Riftbound.",
  "Tu n'as pas accès à mon ordinateur ni à une API. Ce message est un état PUBLIC transmis manuellement.",
  "Ne prétends pas avoir déplacé les cartes toi-même. Je collerai tes commandes dans mon application.",
  "Ne demande pas ma main physique cachée et n'invente ni cartes ni effets.",
  "Les mains et l'ordre des decks ont volontairement été masqués pour préserver le jeu.",
  "Tu ne peux donc pas choisir correctement les cartes de ta propre main à partir de ce seul export.",
  "Pour une partie véritablement autonome avec main IA privée, utilise un agent capable d'accéder au relais distant.",
  "Lis l'état et mon annonce de tour, propose tes actions et explique-les brièvement en français.",
  "Réponds avec UN SEUL bloc JSON de la forme :",
  '{"revision":'+publicView.revision+',"message":"Annonce de tes actions","commands":[{"type":"note","text":"Action expliquée"}]}',
  "Tu peux utiliser : note, phase, next-turn, add, move, remove, exhaust, ready, flip, counter, damage, score, hand-count, draw, channel et mulligan.",
  "Pour déplacer une carte, utilise son uid présent dans cards.",
  "Évite les commandes impossibles ou inventées. Les actions réelles doivent toujours être vérifiées par les joueurs.",
  "Ne reproduis pas de jeton, d'URL privée ou de script dans ta réponse.",
  "",
  "=== ÉTAT PUBLIC DU PLATEAU ===",
  JSON.stringify(publicView,null,2)
 ].join("\n");
}
function findJSON(text){
 const trimmed=String(text||"").trim();
 if(!trimmed||trimmed.length>50000)throw Error("Réponse vide ou trop longue (max 50 000 caractères).");
 const fences=[...trimmed.matchAll(/\x60{3}(?:json)?\s*([\s\S]*?)\x60{3}/gi)];
 if(fences.length===1)return fences[0][1].trim();
 if(fences.length>1)throw Error("Plusieurs blocs de code détectés : colle uniquement le bloc JSON des actions.");
 return trimmed;
}
export function parseManualAgentReply(text,revision){
 let obj;
 try{obj=JSON.parse(findJSON(text));}
 catch{throw Error("La réponse doit contenir du JSON valide (ex. {\"commands\":[{\"type\":\"note\",\"text\":\"...\"}]}).");}
 if(!obj||typeof obj!=="object")throw Error("Réponse JSON invalide");
 const isArray=Array.isArray(obj);
 const commands=isArray?obj:Array.isArray(obj.commands)?obj.commands:
  typeof obj.type==="string"?[obj]:null;
 if(!Array.isArray(commands)||commands.length===0||commands.length>15)
  throw Error("L'agent doit fournir entre 1 et 15 commandes dans commands[].");
 const sourceRevision=!isArray&&Object.hasOwn(obj,"revision")?Number(obj.revision):null;
 if(sourceRevision!==null&&(!Number.isInteger(sourceRevision)||sourceRevision!==revision))
  throw Error("Cette réponse concerne un ancien état. Recopie l'état actuel pour l'IA.");
 const safe=commands.map((c,index)=>{
  if(!c||typeof c!=="object"||Array.isArray(c)||!allowed.has(c.type))
   throw Error("Commande n°"+(index+1)+" interdite ou non reconnue.");
  if(JSON.stringify(c).length>5000)throw Error("Commande trop longue.");
  return JSON.parse(JSON.stringify(c));
 });
 return {
  revision,
  message:typeof obj.message==="string"?obj.message.slice(0,500):"",
  commands:safe
 };
}
export function previewManualActions(state,reply){
 const parsed=parseManualAgentReply(reply,state.revision);
 let next=state;
 const changes=[];
 for(const c of parsed.commands){
  next=applyCommand(next,c);
  changes.push(next.message);
 }
 return {...parsed,changes};
}
