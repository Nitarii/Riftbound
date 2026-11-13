// An LLM may help understand a spoken physical-board move, but it must
// never invent scores, card payments, resources, or side effects.
// The reducer independently validates any returned command.
const clean=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const contains=(haystack,needle)=>needle&&(" "+haystack+" ").includes(" "+needle+" ");
const verbs={
 move:/\b(?:deplac\w*|boug\w*|envoi\w*|avance\w*|move|send|shift|va|go)\b/i,
 ready:/\b(?:redress\w*|reveill\w*|reactiv\w*|ready|untap|unexhaust)\b/i,
 exhaust:/\b(?:epuis\w*|engag\w*|tap|exhaust)\b/i
};
export function allowPhysicalLocalCommand(raw,game,message){
 if(!raw||typeof raw!=="object"||!Object.hasOwn(verbs,raw.type))return false;
 const card=game?.cards?.find(c=>c.uid===raw.uid);
 if(!card||card.owner!=="human"||!["base","battlefield"].includes(card.zone))return false;
 const heard=clean(message),name=clean(card.name);
 if(!name||!verbs[raw.type].test(heard))return false;
 const shortName=name.split(" ").slice(0,2).join(" ");
 const humanMatches=game.cards.filter(c=>c.owner==="human"&&
  ["base","battlefield"].includes(c.zone)&&
  clean(c.name).startsWith(shortName));
 if(!contains(heard,name)&&(!contains(heard,shortName)||humanMatches.length!==1))return false;
 if(raw.type==="move"){
  if(raw.zone!=="battlefield"||!Number.isInteger(raw.battlefield))return false;
  if(!game.battlefields?.[raw.battlefield]?.card)return false;
  const fieldName=clean(game.battlefields[raw.battlefield].card.name);
  // For spoken phrases like "sur le premier terrain", require the exact
  // printed battlefield name instead of guessing the target.
  return contains(heard,fieldName);
 }
 return raw.type==="ready"||raw.type==="exhaust";
}
