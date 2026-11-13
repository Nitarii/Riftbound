// Checked, deterministic mandatory On Play effects. Never silently ignore
// an unknown triggered ability when a local AI commits a card to the board.
const TRIGGER=/\b(?:when you play (?:me|this(?: card)?)|when (?:i am|i'm|this is) played|on play\s*:|quand (?:tu|vous) (?:me |la |le )?joue(?:s|z)|lorsque (?:tu|vous) (?:me |la |le )?joue(?:s|z))\s*[:,\-]?\s*([^\r\n]+)/gi;
const RESTRICTION=/\b(?:play only|can't play|cannot play|additional cost|as an additional cost|must pay|you may only play|ne peut etre jouee que|co[uû]t suppl[ée]mentaire)\b/i;

export function mandatoryPlayEffects(card){
 const text=String(card?.text||"");
 if(RESTRICTION.test(text))return {supported:false,discard:0,reason:"conditions de jeu supplémentaires"};
 let match,discard=0,found=false;
 for(const regex=new RegExp(TRIGGER.source,TRIGGER.flags);(match=regex.exec(text));){
  found=true;
  const instruction=match[1].trim().replace(/[.! ]+$/g,"").trim();
  const simple=/^(?:discard|d[ée]fausse(?:z)?|d[ée]fausser)\s+(?:one|a|an|une?|1)\s*(?:cards?|carte)?$/i.test(instruction);
  if(simple){discard+=1;continue;}
  const plural=/^(?:discard|d[ée]fausse(?:z)?|d[ée]fausser)\s+(\d+)\s*(?:cards?|cartes?)?$/i.exec(instruction);
  if(plural&&Number(plural[1])>=1&&Number(plural[1])<=4){
   discard+=Number(plural[1]);continue;
  }
  return {supported:false,discard:0,reason:"effet « When you play » non automatisé : "+instruction.slice(0,110)};
 }
 if(/\b(?:on play|when you play|when i'm played|when i am played)\b/i.test(text)&&!found)
  return {supported:false,discard:0,reason:"effet d'entrée en jeu non reconnu"};
 return {supported:true,discard,reason:""};
}

// Discard the least useful remaining AI hand cards; do not see the human hand.
// The exact UID is validated again by the reducer during atomic play.
export function chooseRequiredDiscards(state,playedUid,count){
 const hand=(state?.cards||[]).filter(c=>c.owner==="ai"&&c.zone==="hand"&&c.uid!==playedUid);
 if(hand.length<count)return null;
 const value=c=>(Number(c.might)||0)*2+(Number(c.energy)||0)+
  (Number(c.power)||0)*2+(c.type==="Unit"?2:1);
 hand.sort((a,b)=>value(a)-value(b)||String(a.uid).localeCompare(String(b.uid)));
 return hand.slice(0,count).map(c=>c.uid);
}
