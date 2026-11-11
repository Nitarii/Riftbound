// Community-exported metadata from the public Riot card gallery.
import {canonicalCode} from "./precons.mjs";
// Displayed card art is requested directly from Riot's CMS CDN when available.
// Piltover Archive artwork is a last-resort remote fallback only; no art is copied to GitHub.
export const CARD_SOURCE="https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json";
export const CARD_SOURCE_BACKUP="https://raw.githubusercontent.com/slimtreble/Riftbound-card-data/main/cards.json";
const STORAGE="riftbound-companion-catalog-v3";
let cache=null;
export function piltoverImage(code){
  const normalized=canonicalCode(code);
  if(!/^[A-Z]{3}-[A-Z0-9]+(?:[A-Z])?$/.test(normalized))return "";
  return "https://cdn.piltoverarchive.com/cards/"+normalized+".webp";
}
export function normalizeCard(x){
  if(!x||typeof x!=="object")return null;
  const code=String(x.code||x.cardCode||x.card_code||x.publicCode||x.id||"").trim();
  const rawName=String(x.fullName||x.full_name||x.name||x.title||"").trim();
  const cardType=String(x.cardType||x.card_type||x.type||"Unit");
  const tags=Array.isArray(x.tags)?x.tags.map(String):[];
  const cardTypeLabels=Array.isArray(x.cardTypeLabels)?x.cardTypeLabels:
    Array.isArray(x.card_type_labels)?x.card_type_labels:
    Array.isArray(x.typeLabels)?x.typeLabels:[];
  // The source gallery may export a Legend under its epithet alone,
  // e.g. "Bashful Bloom". Its champion tag identifies "Lillia".
  const identity=cardType.toLowerCase().includes("legend")&&tags.length?tags[0]:
    rawName.includes(",")?rawName.split(",")[0].trim():
    cardTypeLabels.some(t=>String(t).toLowerCase()==="champion")&&tags.length?tags[0]:"";
  const name=cardType.toLowerCase().includes("legend")&&identity&&
    rawName.toLowerCase()!==identity.toLowerCase()&&
    !rawName.toLowerCase().startsWith(identity.toLowerCase()+",")
    ?identity+", "+rawName:rawName;
  if(!name||!code)return null;
  const domains=x.domains||x.colors||x.domain||[];
  const domainArray=Array.isArray(domains)?domains:typeof domains==="string"?[domains]:[];
  const officialImage=x.imageUrl||x.image_url||x.image||x.images?.full||x.images?.large||"";
  const riotUrl=typeof officialImage==="string"&&/^https:\/\/(cmsassets\.rgpub\.io|cdn\.sanity\.io|cdn\.rgpub\.io)\//i.test(officialImage)?officialImage:"";
  // Imported user cards may contain arbitrary HTTPS URLs; remote official data prefers Riot.
  const image=riotUrl||(/^(https:\/\/)/i.test(officialImage)?officialImage:"")||piltoverImage(code);
  const imageFallback=riotUrl?piltoverImage(code):"";
  const subtitle=String(x.subtitle||"").trim();
  return {code,name,type:cardType,image,imageFallback,
    championName:identity,cardTypeLabels:cardTypeLabels.map(String),
    domains:domainArray.map(String),text:String(x.abilityEffective||x.ability_effective||x.ability_corrected||x.ability||x.cardText||x.text||""),
    energy:x.energy??x.cost??null,power:x.power??null,might:x.might??null,
    tags,
    set:String(x.cardSet||x.card_set||x.setName||x.set||""),subtitle,
    isVariant:Boolean(x.isVariant||x.is_variant||x.isAltArt||x.is_alt_art||x.isSigned||x.is_signed),rarity:String(x.rarity||""),
    sourceUrl:String(x.sourceUrl||x.source_url||"")};
}
export function decodeCards(data){
  const list=Array.isArray(data)?data:Array.isArray(data?.cards)?data.cards:
    Array.isArray(data?.data)?data.data:Array.isArray(data?.results)?data.results:null;
  if(!list)throw Error("Source de cartes : tableau JSON attendu.");
  const seen=new Set();
  return list.map(normalizeCard).filter(c=>{
    if(!c)return false;
    const key=c.code.toUpperCase();
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,25000);
}
function save(cards){
  cache=cards;
  try{localStorage.setItem(STORAGE,JSON.stringify({cards,updatedAt:new Date().toISOString()}));}
  catch(e){console.info("Cache de cartes complet : le catalogue reste en mémoire.",e.message);}
}
export async function loadCatalog(force=false){
  if(cache&&!force)return cache;
  let old=null;
  try{old=JSON.parse(localStorage.getItem(STORAGE))?.cards||null;}catch{}
  if(!force&&old?.length>100){cache=old;return cache;}
  for(const url of [CARD_SOURCE,CARD_SOURCE_BACKUP]){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:"no-cache"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const cards=decodeCards(await response.json());
      if(cards.length<500)throw Error("Catalogue inattendu : "+cards.length+" cartes");
      save(cards);return cards;
    }catch(e){console.warn("Catalogue indisponible : "+url,e.message);}
  }
  if(old?.length){cache=old;return cache;}
  throw Error("Catalogue distant inaccessible. Importe un fichier cards.json depuis le panneau Catalogue.");
}
export function importCatalog(json){
  const cards=decodeCards(json);
  if(!cards.length)throw Error("Le fichier ne contient aucune carte reconnue.");
  save(cards);return cards;
}
export function searchCards(cards,term="",type="",limit=80){
  const s=String(term).trim().toLowerCase();
  const t=String(type).trim().toLowerCase();
  return (cards||[]).filter(c=>(!t||c.type.toLowerCase().includes(t))&&
    (!s||[c.name,c.subtitle,c.code,c.set,c.rarity,...c.domains].join(" ").toLowerCase().includes(s)))
    .slice(0,limit);
}
