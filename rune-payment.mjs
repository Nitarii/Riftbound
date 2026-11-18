// Official basic-rune accounting: exhaust => Energy, recycle => Power.
// A rune may be exhausted first and recycled for Power in the SAME payment.
// No synthetic resource or guessed cost is permitted.
import {goldToken} from "./verified-cards.mjs";
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
 const colored=card?.power==null?0:Number(card.power);
 const extraPower=Number(card?.extraPower??0),power=colored+extraPower;
 if(!Number.isInteger(energy)||energy<0||!Number.isInteger(colored)||colored<0||
    !Number.isInteger(extraPower)||extraPower<0)
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
 if(colored&&!domains.length)return {error:"Domaine du Power non identifié pour "+card.name+"."};
 const reservedPower=Math.max(0,Number(state?.powerPool?.[owner])||0);
 const recycled=announced?.recycled??(card.runeUid?power:null);
 const poolPower=Math.min(power,reservedPower);
 const readyGold=owner==="ai"&&recycled===null?(state.cards||[]).filter(c=>
  c.owner===owner&&c.zone==="base"&&!c.exhausted&&!c.faceDown&&goldToken(c)):[];
 const gold=readyGold.slice(0,power-poolPower);
 const powerFromRunes=power-poolPower-gold.length;
 if(recycled!==null&&(!Number.isInteger(recycled)||recycled<powerFromRunes||recycled>power))
  return {error:card.name+" demande "+power+" Power et tu peux en payer "+poolPower+" avec ta réserve."};
 const recycleCount=recycled??powerFromRunes;
 const fromPool=power-recycleCount-gold.length;
 const coloredRunes=Math.max(0,(card.anyPower?0:colored)-fromPool-gold.length);
 if(announced?.domain&&(!recycleCount||coloredRunes>0&&!domains.includes(announced.domain)))
  return {error:card.name+" ne peut pas être payé en recyclant des runes "+announced.domain+"."};
 const eligible=all.filter(c=>(!card.runeUid||card.runeUid===c.uid)&&
  (!announced?.domain||runeDomain(c)===announced.domain)).sort((a,b)=>Number(a.exhausted)-Number(b.exhausted));
 const matching=eligible.filter(c=>domains.includes(runeDomain(c)));
 if(matching.length<coloredRunes)
  return {error:"Power insuffisant ("+domains.join("/")+") : "+coloredRunes+
   " demandé(s), "+matching.length+" rune(s) de ce domaine."};
 const reserved=matching.slice(0,coloredRunes);
 const remaining=eligible.filter(c=>!reserved.includes(c));
 if(remaining.length<recycleCount-coloredRunes)
  return {error:"Power insuffisant : "+recycleCount+" rune(s) à recycler."};
 // Pick ready Power runes first so they can pay both costs. Then fill Energy
 // with other ready runes. Recycled Power runes can be ready OR exhausted.
 const recycle=[...reserved,...remaining.slice(0,recycleCount-coloredRunes)];
 const forEnergy=[...recycle.filter(c=>!c.exhausted),...ready.filter(c=>!recycle.some(r=>r.uid===c.uid))]
  .slice(0,fromRunes);
 if(forEnergy.length!==fromRunes)return {error:"Impossible de régler l'énergie exacte."};
 return {energy,poolEnergy,power,poolPower:fromPool,domains,exhaustUids:forEnergy.map(c=>c.uid),
  recycleUids:recycle.map(c=>c.uid),goldUids:gold.map(c=>c.uid)};
}
