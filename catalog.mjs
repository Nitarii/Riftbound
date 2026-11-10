const API = "https://api.rifthunt.com";
const LOCAL_KEY = "riftbound-companion-catalog-v1";
const normalize = x => {
  const id=x.id||x.cardCode||x.code||x.card_code||"";
  const name=x.name||x.title||"";
  const domains=x.domains||x.colors||x.domain||[];
  const image=x.imageUrl||x.image_url||x.image||x.images?.full||x.images?.large||"";
  return {code:String(id),name:String(name),type:String(x.cardType||x.type||x.card_type||"Unit"),
    image:typeof image==="string"?image:"",domains:Array.isArray(domains)?domains:typeof domains==="string"?[domains]:[],
    text:String(x.abilityEffective||x.ability||x.cardText||x.text||""),
    energy:x.energy??x.cost??null,power:x.power??null,might:x.might??null,
    tags:Array.isArray(x.tags)?x.tags:[],set:String(x.cardSet||x.set||""),subtitle:String(x.subtitle||"")};
};
let cache=null;
export async function loadCatalog(force=false) {
  if(cache&&!force)return cache;
  if(!force) {
    try{const saved=JSON.parse(localStorage.getItem(LOCAL_KEY));if(saved?.cards?.length>30){cache=saved.cards;return cache;}}catch{}
  }
  const candidates=[
    API+"/bulk/cards",
    "https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json",
    "https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/data/cards.json"
  ];
  for(const url of candidates) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)continue;
      const raw=await response.json();
      const items=Array.isArray(raw)?raw:Array.isArray(raw.cards)?raw.cards:Array.isArray(raw.data)?raw.data:Array.isArray(raw.results)?raw.results:null;
      if(!items||items.length<30)continue;
      const cards=items.map(normalize).filter(x=>x.name&&x.code);
      if(cards.length<30)continue;
      cache=cards;
      try{localStorage.setItem(LOCAL_KEY,JSON.stringify({cards,syncedAt:new Date().toISOString()}));}catch{}
      return cards;
    }catch(e){console.info("Source de cartes indisponible",url,e.message);}
  }
  try{const saved=JSON.parse(localStorage.getItem(LOCAL_KEY));if(saved?.cards?.length){cache=saved.cards;return cache;}}catch{}
  throw Error("Catalogue distant indisponible. Importez un fichier JSON de cartes via le panneau Catalogue.");
}
export function importCatalog(json) {
  const list=Array.isArray(json)?json:Array.isArray(json.cards)?json.cards:Array.isArray(json.data)?json.data:null;
  if(!list||list.length<1)throw Error("JSON attendu : tableau de cartes ou objet {cards:[...]}");
  cache=list.map(normalize).filter(x=>x.name).slice(0,20000);
  localStorage.setItem(LOCAL_KEY,JSON.stringify({cards:cache,syncedAt:new Date().toISOString()}));
  return cache;
}
export function searchCards(cards,term,type="",limit=80) {
  const s=term.trim().toLowerCase();
  return cards.filter(x=>(!type||x.type.toLowerCase().includes(type.toLowerCase()))&&
   (!s||[x.name,x.subtitle,x.code,x.set,...x.domains].join(" ").toLowerCase().includes(s))).slice(0,limit);
}
// Illustrative archetypes: templates based on a chosen legend; NOT validated tournament lists.
// Deliberately refuses to claim a complete legal deck when a matching pool is unavailable.
export function buildDraft(cards,legend,champion) {
  const domains=legend.domains||[];
  const pool=cards.filter(c=>["unit","spell","gear"].some(t=>c.type.toLowerCase().includes(t))&&
    (!c.domains.length||c.domains.every(d=>domains.includes(d)))&&c.code!==champion.code);
  const selected=[];
  const counts=new Map();
  const sorted=[...pool].sort((a,b)=>(Number(a.energy)||0)-(Number(b.energy)||0));
  for(const card of sorted) {
    if(selected.length>=40)break;
    const cardName=(card.name+" "+card.subtitle).trim();
    const n=counts.get(cardName)||0;
    if(n>=3)continue;
    // Current sample generator is intentionally approximate; import a real list for tournament play.
    counts.set(cardName,n+1);
    selected.push(card);
  }
  const runes=cards.filter(c=>c.type.toLowerCase().includes("rune")&&
    (!c.domains.length||c.domains.some(d=>domains.includes(d)))).slice(0,12);
  return {main:selected,runes,issues:[
    "Deck de démonstration, NON garanti légal. Importer un deck vérifié pour jouer en format compétitif.",
    selected.length<40?"Moins de 40 cartes trouvées dans la sélection.":null,
    runes.length<12?"Moins de 12 runes trouvées.":null
  ].filter(Boolean)};
}
