// Conservative bilingual voice/text interpretation for a staged combat.
import {battleParties,combatPriority} from "./combat-engine.mjs";
import {spokenPublicTarget} from "./player-actions.mjs";

const norm=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[’‘]/g,"'").trim();
function damageOrder(text,state){
 const fight=state.pendingCombat;
 if(state.spellChain||fight?.kind==="conquest"||!fight)return null;
 const prefixed=text.replace(/^(?:j'attribue (?:mes |les )?degats (?:a|sur)|(?:je )?cible|ordre des degats|damage order|target)\s*:?\s*/,"");
 const parts=prefixed.split(/\s*,?\s+\b(?:puis|then)\b\s+|\s*,\s*|\s*;\s*/)
  .map(part=>part.replace(/[.!]+$/,"").trim()).filter(Boolean);
 if(parts.length<2&&prefixed===text)return null;
 const combatants=battleParties(state,fight.battlefield,fight.attacker);
 const targets=fight.attacker==="ai"?combatants.attackers:combatants.defenders;
 if(targets.length<2)return null;
 const chosen=parts.map(part=>spokenPublicTarget(targets,part));
 if(chosen.some(card=>!card)){
  if(prefixed===text&&!chosen.some(Boolean))return null;
  return {recognized:true,commands:[],error:"Précise les noms des unités adverses pour l’ordre des dégâts.",
   errorEN:"Name the opposing units to set the damage order."};
 }
 const uids=new Set(chosen.map(card=>card.uid));
 const invalidOrder=chosen.some((card,i)=>i>0&&combatPriority(chosen[i-1])>combatPriority(card));
 if(uids.size!==chosen.length||invalidOrder)return {recognized:true,commands:[],
  error:"Choisis des cibles distinctes dans l’ordre Tank, unités ordinaires, puis Backline.",
  errorEN:"Choose distinct targets in Tank, normal unit, then Backline order."};
 const order=[...chosen,...targets.filter(card=>!uids.has(card.uid))].sort((a,b)=>combatPriority(a)-combatPriority(b));
 return {recognized:true,commands:[{type:"combat-order",player:"human",uids:order.map(card=>card.uid)}]};
}
export function combatVoicePlan(message,state){
 if(!state?.pendingCombat&&!state?.spellChain)return null;
 const text=norm(message);
 if(/\?/.test(text)||/\b(?:comment|how|pourquoi|why|si je|if i)\b/.test(text))
  return {recognized:false,commands:[]};
 const order=damageOrder(text,state);
 if(order)return order;
 if(/(?:effets?|effects?|capacites?|abilities?)\s+(?:resolus?|appliques?|verified|resolved|done|confirmed)|(?:confirme|confirm|validate)\s+(?:les?\s+)?(?:effets?|effects?)/.test(text))
  return {recognized:true,commands:[{type:"combat-confirm-effects",confirm:true}]};
 if(/\b(?:resou[ds]|resol[uv]|resolv(?:e|ed)?|calcul(?:e|ons)|apply damage|infli(?:ge|ger))\b.*\b(?:combat|fight|damage|degats?)\b/.test(text))
  return {recognized:true,commands:[{type:"combat-resolve"}]};
 const passes=/^(?:je |j'|i |we |ok |okay |bon |allez |oui )?(?:passe|pass|no reaction|pas de reaction|ne peux pas reagir|aucune reaction|sans reaction|rien a jouer|nothing to play|go ahead|vas[- ]?y|tu peux resoudre|continue)(?:\s+(?:(?:ma|my|la|the)\s+)?(?:reaction|priorite|priority))?[.! ]*$/;
 if(passes.test(text))return {recognized:true,commands:[{type:state.spellChain?"chain-pass":"combat-pass",player:"human"}]};
 return null;
}
