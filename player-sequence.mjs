// Multi-action narration with safe battlefield movements.
// Existing physical cards are identified by name, never by a guessed UID.
import {applyCommand} from "./core.mjs";
import {normalizePlayerAnnouncement,planHumanAnnouncement} from "./player-actions.mjs";
import {combatVoicePlan} from "./combat-voice.mjs";

const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[’‘]/g,"'").replace(/[-,;.!?]+/g," ").replace(/\s+/g," ").trim();
const articles=/^(?:(?:le|la|les|mon|ma|mes|my|the|a|an|un|une|au|aux|sur|dans|in|into|on|onto|to|vers)\s+|l')+/;
const strip=value=>normalize(value).replace(articles,"").replace(/\s+/g," ").trim();
function pickField(state,spoken){
 const raw=normalize(spoken);
 if(/^(?:mon|ma|my)\s+(?:champ de bataille|battlefield|terrain|field)/.test(raw))return 0;
 if(/^(?:son|sa|their|enemy|opponent|ia)\s+(?:champ de bataille|battlefield|terrain|field)/.test(raw))return 1;
 const q=strip(spoken).replace(/^(?:champ de bataille|battlefield|terrain|field)\s+(?:de\s+)?/,"");
 if(/^(?:mon|ma|mine|my|joueur|player|du joueur|human)$/.test(q)||/^(?:mon|ma|my)\s+(?:champ|battlefield)/.test(strip(spoken)))return 0;
 if(/^(?:ia|ai|adversaire|opponent|enemy|ennemi)$/.test(q)||/^(?:adversaire|enemy|opponent|ia)\s+(?:champ|battlefield)/.test(strip(spoken)))return 1;
 const simple=strip(spoken);
 if(/^(?:champ de bataille|battlefield|terrain|field)$/.test(simple))return null;
 const matched=(state.battlefields||[]).map((f,i)=>({i,name:normalize(f.card?.name||"")}))
  .filter(f=>f.name&&(f.name===simple||f.name.includes(simple)||simple.includes(f.name)));
 return matched.length===1?matched[0].i:null;
}
function pickReadyUnit(state,spoken){
 const q=strip(spoken).replace(/^unit[eé]?\s+/,"").trim();
 if(!q)return {error:"Nom d'unité manquant."};
 const pool=state.cards.filter(c=>c.owner==="human"&&c.zone==="base"&&/unit/i.test(c.type||""));
 const found=pool.filter(c=>{
  const name=normalize(c.name||"");
  return name===q||name.includes(q)||q.split(" ").sort().join(" ")===name.split(" ").sort().join(" ");
 });
 if(found.length===0)return {error:"Aucune unité « "+q+" » n'est présente dans ta base. Joue-la d'abord en base avant de la déplacer."};
 if(found.length!==1)return {error:"Plusieurs unités correspondent à « "+q+" » dans ta base. Sélectionne la carte exacte sur le plateau."};
 if(found[0].exhausted)return {error:found[0].name+" est épuisé(e) et ne peut pas se déplacer normalement."};
 return {unit:found[0]};
}
const endTurn=/\b(?:termine|finis|passe|end|finish|pass)\s+(?:(?:mon|my|le|the)\s+)?(?:tour|turn)\b|\b(?:fin de mon tour|my turn is over)\b/;
function extractMovement(text){
 let t=text.replace(endTurn," ").replace(/\b(?:et|and|puis|then)\s+(?:je|i)\s*$/," ").trim();
 // "je conquiers le Grove avec mon Loyal Poro"
 const conquer=/\b(?:conquiers|conquer|conquers|capture|captures|prends|take|attaque|attack|controle|control)\s+(?:(?:le|la|the|mon|my)\s+)?(.+?)\s+(?:avec|using|with)\s+(?:(?:mon|my|ma|le|la|the|un|une)\s+)?(.+?)\s*$/;
 let m=t.match(conquer);
 if(m)return {full:m[0],field:m[1],unit:m[2],kind:"conquer"};
 // "je déplace / joue mon poro sur le Grove / mon champ de bataille"
 const to=/\b(?:deplace|deplacer|move|mets|place|envoie|send|joue|play|pose)\s+(?:(?:mon|ma|my|le|la|the|un|une)\s+)?(.+?)\s+(?:vers|sur|dans|au|in|into|onto|on|to)\s+(.+?)\s*$/;
 m=t.match(to);
 if(m&& !/\bbase\b/.test(m[2]))return {full:m[0],field:m[2],unit:m[1],kind:"move"};
 return null;
}
// Parse repeated "I play / je joue" clauses in order, pairing each payment
// with the card it pays for. The full batch remains atomic in the relay.
function planBaseSequence(message,state,catalog){
 const t=normalizePlayerAnnouncement(message);
 const plays=[...t.matchAll(/\b(?:je|i)\s+(?:joue|play|pose|place|mets)\b/g)];
 if(plays.length<2)return planHumanAnnouncement(message,state,catalog);
 const bounds=[0];
 for(let i=1;i<plays.length;i++){
  const previous=plays[i-1].index,next=plays[i].index;
  const between=t.slice(previous,next);
  const spends=[...between.matchAll(/\b(?:j'en|j'|je|i)\s*(?:exhaust|epuise|tap|spend|utilise)\b/g)];
  bounds.push(spends.length?previous+spends.at(-1).index:next);
 }
 bounds.push(t.length);
 const commands=[];let preview=state;
 for(let i=0;i<bounds.length-1;i++){
  const chunk=t.slice(bounds[i],bounds[i+1]).replace(/^(?:et|and|puis|then)\s+/,"")
   .replace(/\s+(?:et|and|puis|then)\s*$/,"").trim();
  if(!chunk)continue;
  const plan=planHumanAnnouncement(chunk,preview,catalog);
  if(plan.error)return {...plan,commands:[]};
  for(const command of plan.commands||[]){preview=applyCommand(preview,command);commands.push(command);}
 }
 return {commands,recognized:commands.length>0,summary:preview.message};
}
export function planPlayerSequence(message,state,catalog=[]){
 const combat= combatVoicePlan(message,state);
 if(combat)return combat;
 const text=normalizePlayerAnnouncement(message).slice(0,1200);
 if(!text||!state?.started)return {commands:[],recognized:false};
 // Questions and speculative statements remain conversational.
 if(/[?]/.test(String(message))||/^(?:si je|if i|can i|est ce que|comment|how|pourquoi|why)\b/.test(text))
  return {commands:[],recognized:false};
 const movement=extractMovement(text);
 if(!movement)return planBaseSequence(message,state,catalog);
 if(state.active!=="human")return {commands:[],recognized:true,error:"Ce n'est pas ton tour.",errorEN:"It's not your turn."};
 const wantsEnd=endTurn.test(text);
 const remainder=text.replace(movement.full," ").replace(endTurn," ").replace(/\b(?:et|and|puis|then)\s*$/," ").trim();
 let preliminary={commands:[],recognized:false},preview=state;
 if(remainder){
  preliminary=planBaseSequence(remainder,state,catalog);
  if(preliminary.error)return preliminary;
  for(const cmd of preliminary.commands||[])preview=applyCommand(preview,cmd);
 }
 const index=pickField(preview,movement.field);
 if(index===null)return {commands:[],recognized:true,error:"Champ de bataille ambigu : précise Grove ou le nom de l'autre terrain.",
  errorEN:"Ambiguous battlefield: specify the actual battlefield name."};
 const chosen=pickReadyUnit(preview,movement.unit);
 if(chosen.error)return {commands:[],recognized:true,error:chosen.error,errorEN:chosen.error};
 if(!preview.turnActions?.channeled||!preview.turnActions?.drawn){
  return {commands:[],recognized:true,error:"Annonce d'abord la canalisation et la pioche normales de ce tour.",
   errorEN:"First announce this turn's channeling and standard draw."};
 }
 const commands=[...(preliminary.commands||[])];
 const add=command=>{preview=applyCommand(preview,command);commands.push(command);};
 try{
  if(preview.phase!=="Main")add({type:"phase",phase:"Main"});
  const defended=preview.cards.some(c=>c.zone==="battlefield"&&
   c.battlefield===index&&c.owner==="ai"&&/^unit$/i.test(c.type||""));
  if(defended)add({type:"combat-attack",player:"human",
   uids:[chosen.unit.uid],battlefield:index});
  else add({type:"move",uid:chosen.unit.uid,zone:"battlefield",battlefield:index});
  if(wantsEnd&&!preview.pendingCombat){
   add({type:"phase",phase:"Ending"});add({type:"next-turn"});
  }
  return {commands,recognized:true,summary:preview.message};
 }catch(e){
  return {commands:[],recognized:true,error:"Déplacement impossible : "+String(e.message||e),
   errorEN:"Move not applied: "+String(e.message||e)};
 }
}
