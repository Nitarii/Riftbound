// Official basic-rune accounting: exhaust => Energy, recycle => Power.
// A rune may be exhausted first and recycled for Power in the SAME payment.
// No synthetic resource or guessed cost is permitted.
export const RUNE_DOMAINS=["Fury","Chaos","Calm","Body","Mind","Order"];
const runeCodeDomains={
 "OGN-007":"Fury","OGN-166":"Chaos","OGN-042":"Calm",
 "OGN-126":"Body","OGN-089":"Mind","OGN-214":"Order"
};
export function runeDomain(rune){
 const domains=Array.isArray(rune?.domains)?rune.domains:[];
 const text=[...domains,rune?.name,
  runeCodeDomains[String(rune?.code||"").toUpperCase().split("/")[0]]].filter(Boolean)
  .join(" ").toLowerCase();
 return RUNE_DOMAINS.find(d=>new RegExp("\\b"+d.toLowerCase()+"\\b").test(text))||null;
}
export function cardPowerDomains(card){
 return [...new Set((Array.isArray(card?.domains)?card.domains:[]).map(d=>
  RUNE_DOMAINS.find(x=>x.toLowerCase()===String(d).toLowerCase())).filter(Boolean))];
}
export function planRunePayment(state,owner,card,announced){
 if(!["human","ai"].includes(owner))return {error:"Propriétaire de rune inconnu."};
 const energy=card?.energy==null||card.energy===""?NaN:Number(card.energy);
 const power=card?.power==null?0:Number(card.power);
 if(!Number.isInteger(energy)||energy<0||!Number.isInteger(power)||power<0)
  return {error:"Coût de carte incomplet : énergie ou Power inconnus."};
 const all=(state?.cards||[]).filter(c=>c.owner===owner&&c.zone==="runes");
 const ready=all.filter(c=>!c.exhausted);
 const poolEnergy=Math.min(energy,Math.max(0,Number(state?.energyPool?.[owner])||0));
 const fromRunes=energy-poolEnergy;
 if(announced?.exhausted!=null&&announced.exhausted!==fromRunes)
  return {error:"Pour "+card.name+", il faut épuiser exactement "+fromRunes+" runes."};
 if(announced?.exhaustAll&&ready.length!==fromRunes)
  return {error:card.name+" demande "+fromRunes+" runes à épuiser et tu en as "+ready.length+" prêtes."};
 if(ready.length<fromRunes)return {error:"Énergie insuffisante : "+energy+" nécessaires, "+ready.length+" runes prêtes."};
 const domains=card.anyPower?RUNE_DOMAINS:cardPowerDomains(card);
 if(power&&!domains.length)return {error:"Domaine du Power non identifié pour "+card.name+"."};
 if(announced?.recycled!=null&&announced.recycled!==power)
  return {error:card.name+" demande de recycler exactement "+power+" rune(s)."};
 if(announced?.domain&&(!power||!domains.includes(announced.domain)))
  return {error:card.name+" ne peut pas être payé en recyclant des runes "+announced.domain+"."};
 const paymentDomains=announced?.domain?[announced.domain]:domains;
 const matching=all.filter(c=>(!card.runeUid||card.runeUid===c.uid)&&
  (card.anyPower&&!announced?.domain||paymentDomains.includes(runeDomain(c))));
 if(matching.length<power)
  return {error:"Power insuffisant ("+paymentDomains.join("/")+") : "+power+
   " demandé(s), "+matching.length+" rune(s) de ce domaine."};
 // Pick ready Power runes first so they can pay both costs. Then fill Energy
 // with other ready runes. Recycled Power runes can be ready OR exhausted.
 const sortedMatching=[...matching].sort((a,b)=>Number(a.exhausted)-Number(b.exhausted));
 const recycle=sortedMatching.slice(0,power);
 const forEnergy=[...recycle.filter(c=>!c.exhausted),...ready.filter(c=>!recycle.some(r=>r.uid===c.uid))]
  .slice(0,fromRunes);
 if(forEnergy.length!==fromRunes)return {error:"Impossible de régler l'énergie exacte."};
 return {energy,poolEnergy,power,domains,exhaustUids:forEnergy.map(c=>c.uid),
  recycleUids:recycle.map(c=>c.uid)};
}
