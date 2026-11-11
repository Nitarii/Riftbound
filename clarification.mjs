// Short-lived card clarification for physical announcements.
// Never treats an unconfirmed fuzzy match as permission to move a real card.
import {findAnnouncedCard} from "./player-actions.mjs";
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const tokens=value=>norm(value).split(" ").filter(word=>word.length>=3);
const sameTokens=(a,b)=>tokens(a).sort().join(" ")===tokens(b).sort().join(" ");
const answerYes=/^(?:oui|yes|yep|yeah|ok|okay|c est ca|exact|exactement|correct|tout a fait|that one)$/;
const answerNo=/^(?:non|no|nope|annule|annuler|cancel|cancel it|laisse tomber|never mind)$/;
export function suggestCardNames(catalog,unknown,limit=3){
 const input=tokens(unknown),result=new Map();
 if(!input.length)return [];
 for(const card of catalog||[]){
  if(!card?.name||!card.code||card.isVariant)continue;
  const name=norm(card.name),parts=tokens(card.name);
  const shared=input.filter(w=>parts.includes(w)).length;
  const prefix=input.filter(w=>parts.some(p=>p.startsWith(w)&&w.length>=4)).length;
  const sharedLong=input.filter(w=>w.length>=4&&parts.some(p=>p.startsWith(w))).length;
  if(!sharedLong&&!prefix)continue;
  const score=shared*5+prefix*2-(Math.abs(parts.length-input.length)*1.5);
  const prev=result.get(name);
  if(!prev||score>prev.score)result.set(name,{card,score,name});
 }
 return [...result.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
  .slice(0,limit).map(x=>x.card);
}
export function makeCardClarification({announcement,query,revision,catalog,now=Date.now()}){
 return {kind:"card",announcement:String(announcement).slice(0,1200),
  query:String(query||"").slice(0,120),revision,createdAt:now,
  suggestions:suggestCardNames(catalog,query).map(card=>({code:card.code,name:card.name}))};
}
export function isPendingValid(pending,state,now=Date.now()){
 return Boolean(pending?.kind==="card"&&pending.revision===state.revision&&
  now-pending.createdAt>=0&&now-pending.createdAt<=5*60*1000);
}
function acceptedCard(catalog,pending,spoken){
 const candidate=findAnnouncedCard(catalog,spoken);
 if(candidate)return candidate;
 const answer=norm(spoken),suggestions=pending.suggestions||[];
 if(answerYes.test(answer)&&suggestions.length===1){
  return catalog.find(c=>c.code===suggestions[0].code)||null;
 }
 const chosen=answer.match(/^(?:le|la|the|option|numero|number)?\s*(1|2|3|premier|premiere|deuxieme|second|secondo|troisieme|first|second|third)$/);
 if(chosen){
  const n={premier:1,premiere:1,first:1,deuxieme:2,second:2,secondo:2,troisieme:3,third:3}[chosen[1]]||Number(chosen[1]);
  const choice=suggestions[n-1];
  return choice?catalog.find(c=>c.code===choice.code)||null:null;
 }
 // Reversed word order is unambiguous ONLY if it refers to an exact full card name.
 const matches=(catalog||[]).filter(c=>c?.name&&sameTokens(c.name,spoken));
 const unique=new Map(matches.map(c=>[norm(c.name),c]));
 return unique.size===1?[...unique.values()][0]:null;
}
function request(pending,english=false){
 const names=(pending.suggestions||[]).map(c=>c.name);
 const hint=names.length?(english?" Possible match: ":" Carte possible : ")+names.join(" / ")+".":"";
 const confirmation=names.length===1?(english?" Say « yes » or the exact card name to confirm.":" Dis « oui » ou le nom exact pour confirmer."):
  (english?" Say the exact card name to continue.":" Dis le nom exact de la carte pour continuer.");
 return (english?"I couldn't identify « ":"Je n'ai pas identifié « ")+pending.query+" »."+hint+confirmation;
}
export function resolveCardClarification(pending,message,catalog,state,{now=Date.now(),english=false}={}){
 if(!isPendingValid(pending,state,now))return {status:"stale"};
 const spoken=String(message||"").trim();
 const normal=norm(spoken);
 if(!spoken)return {status:"waiting",message:request(pending,english)};
 if(answerNo.test(normal))return {status:"cancel",message:english?"Action cancelled.":"Action annulée."};
 if(spoken.length>100||
  /\b(?:je|i)\s+(?:joue|play|pioche|draw|canalise|channel|passe|end)\b/i.test(spoken))
  return {status:"new"};
 const card=acceptedCard(catalog,pending,spoken);
 if(card){
  const raw=pending.announcement;
  const index=raw.toLowerCase().indexOf(pending.query.toLowerCase());
  if(index<0)return {status:"stale"};
  const revised=raw.slice(0,index)+card.name+raw.slice(index+pending.query.length);
  return {status:"confirmed",card,announcement:revised,
   message:(english?"Confirmed: ":"Confirmé : ")+card.name+"."};
 }
 // In a short reply, avoid sending a disconnected noun to Qwen.
 if(spoken.length<=65){
  return {status:"waiting",message:request(pending,english)};
 }
 return {status:"new"};
}
