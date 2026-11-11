// Pure selector helpers (shared by browser and tests). Never returns a huge list.
const fold=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").trim();
const baseName=name=>fold(String(name||"").split(",")[0]);
const canonical=code=>String(code||"").toUpperCase().split("/")[0].replace(/-[0-9]{3}$/,"");
export function isLegend(card){return fold(card?.type).includes("legend");}
export function isBattlefield(card){return fold(card?.type).includes("battlefield");}
export function isUnit(card){return fold(card?.type).includes("unit")||fold(card?.type).includes("champion");}
export function isChosenChampion(card,legend){
 if(!isUnit(card))return false;
 const championName=baseName(legend?.name);
 return Boolean(championName&&baseName(card.name)===championName);
}
export function filteredPickerCards(cards,kind,query="",legend=null,limit=7){
 const q=fold(query),maximum=Math.max(1,Math.min(10,limit));
 let pool=cards.filter(c=>c?.name&&(
  kind==="legend"?isLegend(c):
  kind==="battlefield"?isBattlefield(c):
  kind==="champion"?isChosenChampion(c,legend):false));
 if(kind==="champion"&&!pool.length&&legend){
   // Gallery sometimes calls the chosen card "Unit"; no guessed cross-champion substitutes.
   return [];
 }
 const seen=new Set();
 pool=pool.filter(c=>{
  const key=fold(c.name)+"|"+canonical(c.code);
  if(seen.has(key)||c.isVariant)return false;
  seen.add(key);return true;
 });
 const rank=c=>{
  const name=fold(c.name),code=fold(c.code),subtitle=fold(c.subtitle);
  if(!q)return 0;
  if(name===q||code===q)return 0;
  if(name.startsWith(q))return 1;
  if(name.split(/[ ,]/).some(w=>w.startsWith(q)))return 2;
  if(subtitle.startsWith(q)||code.includes(q))return 3;
  if(name.includes(q)||subtitle.includes(q))return 4;
  return 10;
 };
 return pool.filter(c=>rank(c)<10).sort((a,b)=>{
   const diff=rank(a)-rank(b);
   return diff||a.name.localeCompare(b.name,"fr")||a.code.localeCompare(b.code);
 }).slice(0,maximum);
}
export function randomExampleCards(cards,rng=Math.random){
 const legendPool=filteredPickerCards(cards,"legend","",null,10_000);
 // Select from all known legend names, not just the top 7 shown in the combobox.
 const legends=cards.filter(isLegend).filter(c=>!c.isVariant);
 const seen=new Set();
 const uniqueLegends=legends.filter(c=>{const k=fold(c.name);if(seen.has(k))return false;seen.add(k);return true;});
 const legend=uniqueLegends[Math.floor(rng()*uniqueLegends.length)]||legendPool[0]||null;
 const champions=legend?cards.filter(c=>isChosenChampion(c,legend)&&!c.isVariant):[];
 const champion=champions[Math.floor(rng()*champions.length)]||null;
 const fields=cards.filter(c=>isBattlefield(c)&&!c.isVariant);
 const battlefield=fields[Math.floor(rng()*fields.length)]||null;
 return {legend,champion,battlefield};
}
