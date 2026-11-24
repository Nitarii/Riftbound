import {onPlayInstructions,empoweredDefenseLine} from "./effect-engine.mjs";
// Reports restrictions and expected on-play instructions. A triggered discard
// is an effect to resolve after responses, not an additional card-play cost.
const RESTRICTION=/\b(?:play only|can't play|cannot play|additional cost|as an additional cost|must pay|you may only play|ne peut etre jouee que|co[uû]t suppl[ée]mentaire)\b/i;
export const playRestrictionText=card=>String(card?.text||"").split(/\r?\n/).filter(line=>
 empoweredDefenseLine(line)===null).join("\n");
export function mandatoryPlayEffects(card,{playedBefore=0,xp=0}={}){
 const text=playRestrictionText(card);
 if(RESTRICTION.test(text))
  return {supported:false,discard:0,reason:"conditions de jeu supplémentaires"};
 const compiled=onPlayInstructions(card,{playedBefore,xp});
 const discard=compiled.steps.filter(x=>x.kind==="discard").reduce((n,x)=>n+x.count,0);
 const issue=compiled.unsupported[0];
 return {supported:!issue,discard:issue?0:discard,reason:issue?.reason||""};
}

// Discard the least useful remaining AI hand cards; do not see the human hand.
// The reducer revalidates the current hand at the actual discard instruction.
export function chooseRequiredDiscards(state,playedUid,count){
 const hand=(state?.cards||[]).filter(c=>c.owner==="ai"&&c.zone==="hand"&&c.uid!==playedUid);
 if(hand.length<count)return null;
 const value=c=>(Number(c.might)||0)*2+(Number(c.energy)||0)+
  (Number(c.power)||0)*2+(c.type==="Unit"?2:1);
 hand.sort((a,b)=>value(a)-value(b)||String(a.uid).localeCompare(String(b.uid)));
 return hand.slice(0,count).map(c=>c.uid);
}
