// Official printed preconstructed decklists published by Riot on 2026-02-13.
// Codes and quantities are data, not copied art. Always verify newer bans/errata.
export const PRECONS = Object.freeze([
  {id:"fiora",label:"Fiora · Spiritforged (Body / Order)",source:"https://playriftbound.com/en-us/news/announcements/spiritforged-precons-fiora-rumble/",
    legend:"SFD-205",champion:"SFD-110",battlefields:["SFD-213","SFD-221","SFD-218"],
    main:[["SFD-110",2],["SFD-103",2],["SFD-156",2],["SFD-113",2],["SFD-099",2],
      ["OGN-136",2],["SFD-093",2],["SFD-167",2],["SFD-157",2],["SFD-180",1],
      ["SFD-116",1],["SFD-097",2],["SFD-107",3],["OGN-229",2],["SFD-206",1],
      ["SFD-106",2],["SFD-161",3],["SFD-108",3],["SFD-172",1],["SFD-095",3]],
    runes:[["OGN-214",6],["OGN-126",6]]},
  {id:"rumble",label:"Rumble · Spiritforged (Fury / Mind)",source:"https://playriftbound.com/en-us/news/announcements/spiritforged-precons-fiora-rumble/",
    legend:"SFD-181",champion:"SFD-026",battlefields:["SFD-212","SFD-215","SFD-220"],
    main:[["SFD-021",2],["SFD-026",2],["SFD-007",3],["OGN-016",3],
      ["SFD-065",3],["SFD-062",3],["SFD-069",3],["SFD-071",2],["SFD-089",1],
      ["OGN-083",2],["OGN-105",1],["SFD-070",2],["SFD-066",2],["SFD-076",3],
      ["OGN-095",2],["OGN-024",3],["SFD-182",1],["SFD-019",1],["SFD-022",1]],
    runes:[["OGN-089",6],["OGN-007",6]]}
]);
export function canonicalCode(code) {
  return String(code??"").toUpperCase().replace(/\/\d+.*$/,"").replace(/[^A-Z0-9-]/g,"");
}
export function preconById(id,rng=Math.random) {
  if(id==="random"||!id)return PRECONS[Math.floor(rng()*PRECONS.length)];
  const selected=PRECONS.find(p=>p.id===id);
  if(!selected)throw Error("Deck préconstruit inconnu : "+id);
  return selected;
}
export function resolvePrecon(cards,id="random",rng=Math.random) {
  const preset=preconById(id,rng);
  if(!Array.isArray(cards)||!cards.length)throw Error("Charge d'abord le catalogue de cartes.");
  const byCode=new Map();
  for(const c of cards){
    const key=canonicalCode(c.code);
    if(!key)continue;
    // Prefer standard printing instead of signed, alternate and foil versions.
    if(!byCode.has(key)||((byCode.get(key).isVariant||byCode.get(key).isAltArt)&&!(c.isVariant||c.isAltArt)))byCode.set(key,c);
  }
  const missing=[];
  const card=code=>{
    const v=byCode.get(canonicalCode(code));
    if(!v)missing.push(code);
    return v;
  };
  const expand=rows=>rows.flatMap(([code,n])=>Array.from({length:n},()=>card(code))).filter(Boolean);
  const legend=card(preset.legend),champion=card(preset.champion),battlefields=preset.battlefields.map(card),main=expand(preset.main),runes=expand(preset.runes);
  if(missing.length)throw Error("Cartes absentes du catalogue : "+[...new Set(missing)].join(", "));
  if(main.length!==40||runes.length!==12||battlefields.length!==3)throw Error("Taille de deck non conforme aux listes officielles.");
  if(!main.some(c=>canonicalCode(c.code)===canonicalCode(champion.code)))throw Error("Champion absent du deck principal.");
  const battlefield=battlefields[Math.floor(rng()*battlefields.length)];
  return {id:preset.id,label:preset.label,legend,champion,battlefield,battlefields,main,runes,
    source:preset.source};
}
