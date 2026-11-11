// Conservative bilingual voice/text interpretation for a staged combat.
const norm=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[’‘]/g,"'").trim();
export function combatVoicePlan(message,state){
 if(!state?.pendingCombat)return null;
 const text=norm(message);
 if(/\?/.test(text)||/\b(?:comment|how|pourquoi|why|si je|if i)\b/.test(text))
  return {recognized:false,commands:[]};
 if(/(?:effets?|effects?|capacites?|abilities?)\s+(?:resolus?|appliques?|verified|resolved|done|confirmed)|(?:confirme|confirm|validate)\s+(?:les?\s+)?(?:effets?|effects?)/.test(text))
  return {recognized:true,commands:[{type:"combat-confirm-effects",confirm:true}]};
 if(/\b(?:resou[ds]|resol[uv]|resolv(?:e|ed)?|calcul(?:e|ons)|apply damage|infli(?:ge|ger))\b.*\b(?:combat|fight|damage|degats?)\b/.test(text))
  return {recognized:true,commands:[{type:"combat-resolve"}]};
 const passes=/^(?:je |j'|i |we |ok |okay |bon |allez |oui )?(?:passe|pass|no reaction|pas de reaction|aucune reaction|sans reaction|rien a jouer|nothing to play|go ahead|vas[- ]?y|tu peux resoudre)(?:\s+(?:(?:ma|my|la|the)\s+)?(?:reaction|priorite|priority))?[.! ]*$/;
 if(passes.test(text))return {recognized:true,commands:[{type:"combat-pass",player:"human"}]};
 return null;
}
