// Compact, character-aware selectors for physical Riftbound play.
// Identity comes from the champion tag on Legend cards, not from their epithet.
const fold=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleLowerCase("fr").replace(/[’']/g,"'").trim();
const firstTitle=name=>String(name||"").split(",")[0].trim();
const canonical=code=>String(code||"").toUpperCase().split("/")[0].replace(/-[0-9]{3}$/,"");
const labels=card=>Array.isArray(card?.cardTypeLabels)?card.cardTypeLabels:
 Array.isArray(card?.typeLabels)?card.typeLabels:[];
export function isLegend(card){return fold(card?.type).includes("legend");}
export function isBattlefield(card){return fold(card?.type).includes("battlefield");}
export function isUnit(card){return fold(card?.type).includes("unit")||
 fold(card?.type).includes("champion")||labels(card).some(v=>fold(v)==="champion");}
export function championIdentity(card){
 if(!card)return "";
 const direct=String(card.championName||card.championTag||card.identity||"").trim();
 if(direct)return direct;
 const title=String(card.fullName||card.full_name||card.name||"").trim();
 const tags=Array.isArray(card.tags)?card.tags:[];
 // The scrape exports e.g. Legend name "Bashful Bloom", tags ["Lillia"].
 // The tag is the printed champion identity and is authoritative for Legends.
 if(isLegend(card)&&tags.length){
  const identified=tags.find(v=>fold(title).startsWith(fold(v)+",")||
   fold(firstTitle(title))===fold(v));
  return String(identified||tags[0]).trim();
 }
 if(title.includes(","))return firstTitle(title);
 if(labels(card).some(v=>fold(v)==="champion")&&tags.length)return String(tags[0]).trim();
 if(tags.length&&isUnit(card)&&!title.includes(","))return String(tags[0]).trim();
 return firstTitle(title);
}
export function legendSearchName(card){
 const identity=championIdentity(card),title=String(card?.name||"").trim();
 if(!isLegend(card)||!identity)return title;
 if(fold(title)===fold(identity)||fold(title).startsWith(fold(identity)+","))return title;
 return identity+", "+title;
}
export function isChosenChampion(card,legend){
 if(!isUnit(card)||!legend)return false;
 const identity=fold(championIdentity(legend));
 if(!identity)return false;
 const cardIdentity=fold(championIdentity(card));
 const title=fold(firstTitle(card.name));
 const hasChampionLabel=labels(card).some(v=>fold(v)==="champion");
 const same=cardIdentity===identity||title===identity||
   (Array.isArray(card.tags)&&card.tags.some(t=>fold(t)===identity));
 if(!same)return false;
 // A chosen champion is a Champion unit. Imported catalogs lacking subtype
 // labels can still offer correctly named champion units as a fallback.
 if(!hasChampionLabel&&!title.startsWith(identity)&&cardIdentity!==identity)return false;
 const available=(legend.domains||[]).map(fold).filter(Boolean);
 const required=(card.domains||[]).map(fold).filter(Boolean);
 if(available.length&&required.length&&!required.every(v=>available.includes(v)))return false;
 return true;
}
export function filteredPickerCards(cards,kind,query="",legend=null,limit=7){
 const q=fold(query),maximum=Math.max(1,Math.min(10,limit));
 const pool=(Array.isArray(cards)?cards:[]).filter(c=>c?.name&&(
   kind==="legend"?isLegend(c):
   kind==="battlefield"?isBattlefield(c):
   kind==="champion"?isChosenChampion(c,legend):false));
 const seen=new Set();
 const unique=pool.filter(c=>{
  if(c.isVariant)return false;
  const key=fold(c.name)+"|"+canonical(c.code);
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
 const rank=c=>{
  if(!q)return 0;
  const name=fold(c.name),id=fold(championIdentity(c)),code=fold(c.code),
    sub=fold(c.subtitle),tags=(c.tags||[]).map(fold),display=fold(legendSearchName(c));
  if(id===q&&kind!=="battlefield")return 0;
  if(name===q||code===q||display===q)return 0;
  if(id.startsWith(q)&&kind!=="battlefield")return 1;
  if(display.startsWith(q)||name.startsWith(q))return 2;
  if(tags.some(t=>t===q||t.startsWith(q)))return 3;
  if(display.split(/[ ,]/).some(w=>w.startsWith(q)))return 4;
  if(name.includes(q)||display.includes(q)||sub.includes(q)||code.includes(q))return 5;
  return 10;
 };
 return unique.filter(c=>rank(c)<10).sort((a,b)=>
  rank(a)-rank(b)||fold(legendSearchName(a)).localeCompare(fold(legendSearchName(b)),"fr")||
  a.code.localeCompare(b.code)).slice(0,maximum);
}
export function randomExampleCards(cards,rng=Math.random){
 const all=Array.isArray(cards)?cards:[];
 const seen=new Set();
 const legends=all.filter(c=>isLegend(c)&&!c.isVariant&&c.name).filter(c=>{
  const id=fold(championIdentity(c))+"|"+fold(c.name);
  if(seen.has(id))return false;
  seen.add(id);return true;
 });
 const pick=pool=>pool[Math.floor(rng()*pool.length)]||null;
 const legend=pick(legends);
 const champion=pick(legend?all.filter(c=>isChosenChampion(c,legend)&&!c.isVariant):[]);
 const battlefield=pick(all.filter(c=>isBattlefield(c)&&!c.isVariant));
 return {legend,champion,battlefield};
}
