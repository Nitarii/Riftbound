// Printed preconstructed recipes from Origins through Radiance.
// Codes and quantities are data, not copied art. Always verify newer bans/errata.
const PROVING_GROUNDS="https://uvsgames.com/wp-content/uploads/2025/11/OGS-ProvingGrounds-HowtoPlay-EN.pdf";
export const PRECONS = Object.freeze([
  // Origins Champion Decks — printed deck lists cross-checked with the product source map.
  {id:"jinx",label:"Jinx · Origins (Fury / Chaos)",source:"https://riftmana.com/riftbound-preconstructed-origin-champion-starter-decks/",
    legend:"OGN-251",champion:"OGN-030",battlefields:["OGN-285","OGN-289","OGN-298"],
    main:[["OGN-169",3],["OGN-168",3],["OGN-008",2],["OGN-003",3],["OGN-185",3],
      ["OGN-182",3],["OGN-036",1],["OGN-030",1],["OGN-006",3],["OGN-165",2],
      ["OGN-024",2],["OGN-180",2],["OGN-019",3],["OGN-001",2],["OGN-178",2],
      ["OGN-002",3],["OGN-011",1],["OGN-195",1]],
    runes:[["OGN-007",6],["OGN-166",6]],
    warning:"Deck imprimé original : contient des cartes désormais interdites dans certains formats (Fight or Flight, Scrapheap, Reaver's Row)."},
  {id:"viktor",label:"Viktor · Origins (Mind / Order)",source:"https://riftmana.com/riftbound-preconstructed-origin-champion-starter-decks/",
    legend:"OGN-265",champion:"OGN-117",battlefields:["OGN-294","OGN-293","OGN-275"],
    main:[["OGN-090",2],["OGN-095",2],["OGN-209",3],["OGN-213",2],["OGN-093",2],
      ["OGN-216",3],["OGN-101",2],["OGN-103",3],["OGN-206",2],["OGN-094",2],
      ["OGN-084",3],["OGN-222",3],["OGN-111",1],["OGN-083",2],["OGN-208",3],
      ["OGN-117",1],["OGN-086",2],["OGN-118",1],["OGN-233",1]],
    runes:[["OGN-089",6],["OGN-214",6]]},
  {id:"lee-sin",label:"Lee Sin · Origins (Calm / Body)",source:"https://riftmana.com/riftbound-preconstructed-origin-champion-starter-decks/",
    legend:"OGN-257",champion:"OGN-151",battlefields:["OGN-282","OGN-289","OGN-280"],
    main:[["OGN-043",2],["OGN-052",3],["OGN-136",3],["OGN-128",3],["OGN-058",3],
      ["OGN-060",1],["OGN-055",3],["OGN-132",3],["OGN-053",2],["OGN-135",2],
      ["OGN-152",1],["OGN-147",3],["OGN-065",3],["OGN-151",1],["OGN-125",2],
      ["OGN-157",1],["OGN-137",2],["OGN-142",2]],
    runes:[["OGN-042",6],["OGN-126",6]]},
  // Unleashed Champion Decks.
  {id:"vi",label:"Vi · Unleashed (Fury / Order)",source:"https://playriftbound.com/en-us/news/announcements/vi--vex-champion-decks/",
    legend:"UNL-187",champion:"UNL-176",battlefields:["UNL-217","UNL-215","UNL-218"],
    main:[["OGN-036",1],["UNL-030",1],["UNL-176",2],["UNL-010",2],["SFD-009",2],
      ["UNL-002",3],["UNL-175",1],["UNL-161",2],["UNL-009",1],["UNL-159",1],
      ["UNL-153",2],["UNL-156",2],["UNL-154",2],["UNL-006",2],["UNL-188",1],
      ["UNL-015",2],["UNL-017",2],["UNL-024",1],["UNL-163",2],["UNL-001",1],
      ["UNL-012",2],["UNL-026",1],["UNL-008",2],["UNL-018",2]],
    runes:[["OGN-007",6],["OGN-214",6]],
    warning:"Liste imprimée pour les duels amicaux. Star Spring est interdit en Construit officiel."},
  {id:"vex",label:"Vex · Unleashed (Calm / Chaos)",source:"https://playriftbound.com/en-us/news/announcements/vi--vex-champion-decks/",
    legend:"UNL-193",champion:"UNL-055",battlefields:["UNL-207","UNL-213","UNL-214"],
    main:[["UNL-150",1],["SFD-146",1],["UNL-055",2],["UNL-134",2],["UNL-136",1],
      ["UNL-039",2],["UNL-031",2],["UNL-036",2],["UNL-127",2],["UNL-038",2],
      ["UNL-040",3],["UNL-141",1],["UNL-041",2],["UNL-042",3],["UNL-043",1],
      ["UNL-048",2],["UNL-052",1],["UNL-194",1],["UNL-047",2],["UNL-133",2],
      ["UNL-034",2],["UNL-035",1],["UNL-126",1],["UNL-050",1]],
    runes:[["OGN-042",6],["OGN-166",6]]},
  // Vendetta Showdown Decks (two complete 56-card products).
  {id:"shen",label:"Shen · Vendetta (Calm / Order)",source:"https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/",
    legend:"VEN-147",champion:"VEN-138",battlefields:["OGN-280","VEN-159","VEN-166"],
    main:[["OGN-241",1],["VEN-042",2],["VEN-138",1],["VEN-043",1],["VEN-031",1],
      ["OGN-043",2],["VEN-117",3],["OGN-058",2],["VEN-027",2],["VEN-028",3],
      ["VEN-128",2],["VEN-126",1],["VEN-127",1],["VEN-034",1],["VEN-148",1],
      ["VEN-116",1],["VEN-135",1],["UNL-156",2],["VEN-030",2],["VEN-123",2],
      ["VEN-026",2],["VEN-129",2],["VEN-033",2],["VEN-119",2]],
    runes:[["OGN-042",6],["OGN-214",6]]},
  {id:"zed",label:"Zed · Vendetta (Fury / Chaos)",source:"https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/",
    legend:"VEN-143",champion:"VEN-112",battlefields:["OGN-298","VEN-165","VEN-166"],
    main:[["VEN-023",1],["VEN-112",2],["VEN-101",2],["VEN-007",3],["VEN-014",2],
      ["VEN-095",3],["VEN-144",1],["VEN-105",2],["OGN-185",2],["VEN-102",1],
      ["VEN-008",3],["VEN-020",1],["VEN-012",2],["VEN-106",1],["VEN-002",3],
      ["VEN-093",3],["VEN-110",1],["VEN-013",3],["VEN-096",3],["VEN-017",1]],
    runes:[["OGN-166",6],["OGN-007",6]]},
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
    runes:[["OGN-089",6],["OGN-007",6]]},
  // Radiance Showdown Decks.
  {id:"seraphine",label:"Seraphine · Radiance (Mind / Order)",source:"https://playriftbound.com/en-us/news/announcements/the-radiance-overview/",
    legend:"RAD-151",champion:"RAD-065",battlefields:["RAD-159","RAD-166","UNL-218"],
    main:[["RAD-138",1],["RAD-065",2],["RAD-152",1],["RAD-132",1],["RAD-134",2],
      ["RAD-057",2],["RAD-125",1],["RAD-060",1],["RAD-128",2],["RAD-127",2],
      ["RAD-059",2],["RAD-124",1],["RAD-116",3],["RAD-053",3],["RAD-048",2],
      ["RAD-047",2],["RAD-119",2],["RAD-049",2],["RAD-118",1],["RAD-122",1],
      ["OGN-211",2],["RAD-120",2],["RAD-117",1],["UNL-066",1]],
    runes:[["OGN-089",6],["OGN-214",6]]},
  {id:"evelynn",label:"Evelynn · Radiance (Body / Chaos)",source:"https://playriftbound.com/en-us/news/announcements/the-radiance-overview/",
    legend:"RAD-153",champion:"UNL-141",battlefields:["RAD-157","RAD-165","OGN-278"],
    main:[["RAD-090",1],["RAD-109",1],["UNL-141",2],["RAD-154",1],["RAD-108",1],
      ["RAD-086",1],["RAD-103",2],["RAD-102",1],["RAD-106",1],["RAD-081",2],
      ["RAD-105",2],["VEN-106",2],["RAD-104",1],["RAD-076",3],["RAD-097",3],
      ["RAD-070",2],["RAD-100",2],["RAD-095",2],["RAD-099",2],["OGN-135",2],
      ["RAD-077",2],["SFD-121",2],["RAD-098",2]],
    runes:[["OGN-126",6],["OGN-166",6]]},
  // Proving Grounds boxed lists, with their recommended champion and sole battlefield.
  {id:"annie",label:"Annie · Proving Grounds (Fury / Chaos)",source:PROVING_GROUNDS,
    format:"proving-grounds",legend:"OGS-017",champion:"OGS-001",battlefields:["OGN-296"],
    main:[["OGS-001",2],["OGS-010",2],["OGN-013",2],["OGN-171",3],["OGN-185",3],
      ["OGN-176",3],["OGN-191",3],["OGN-174",3],["OGS-018",2],["OGN-169",3],
      ["OGS-003",3],["OGS-011",2],["OGN-170",3],["OGN-005",3],["OGS-002",3]],
    runes:[["OGN-007",6],["OGN-166",6]]},
  {id:"garen",label:"Garen · Proving Grounds (Body / Order)",source:PROVING_GROUNDS,
    format:"proving-grounds",legend:"OGS-023",champion:"OGS-013",battlefields:["OGN-294"],
    main:[["OGS-007",2],["OGS-013",2],["OGN-210",3],["OGN-130",3],["OGN-132",3],
      ["OGN-211",3],["OGN-222",3],["OGN-219",3],["OGN-131",2],["OGN-215",2],
      ["OGS-016",3],["OGN-129",3],["OGN-206",3],["OGS-024",2],["OGS-015",3]],
    runes:[["OGN-126",6],["OGN-214",6]]},
  {id:"lux",label:"Lux · Proving Grounds (Mind / Order)",source:PROVING_GROUNDS,
    format:"proving-grounds",legend:"OGS-021",champion:"OGS-014",battlefields:["OGN-288"],
    main:[["OGS-006",2],["OGS-014",2],["OGN-084",2],["OGN-087",3],["OGN-088",2],
      ["OGN-103",3],["OGN-210",3],["OGN-219",3],["OGS-016",3],["OGN-085",3],
      ["OGN-105",3],["OGN-095",3],["OGN-206",3],["OGS-012",3],["OGS-022",2]],
    runes:[["OGN-089",6],["OGN-214",6]]},
  {id:"master-yi",label:"Master Yi · Proving Grounds (Calm / Body)",source:PROVING_GROUNDS,
    format:"proving-grounds",legend:"OGS-019",champion:"OGS-004",battlefields:["OGN-279"],
    main:[["OGS-004",2],["OGS-009",2],["OGN-052",3],["OGN-055",3],["OGN-049",3],
      ["OGS-005",3],["OGN-137",3],["OGN-142",2],["OGN-046",3],["OGN-048",3],
      ["OGN-129",2],["OGN-134",3],["OGN-127",3],["OGS-020",2],["OGS-008",3]],
    runes:[["OGN-042",6],["OGN-126",6]]}
]);
export function canonicalCode(code) {
  const text=String(code??"").toUpperCase().split("/")[0].replace(/[^A-Z0-9-]/g,"");
  const parts=text.split("-");
  // Riot's gallery API appends the printed denominator, e.g. "sfd-110-221".
  if(parts.length===3&&/^\d{3}[A-Z]?$/.test(parts[1])&&/^\d{3}$/.test(parts[2]))parts.pop();
  return parts.join("-");
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
  const format=preset.format??"preconstructed";
  if(main.length!==40||runes.length!==12||battlefields.length!==(format==="proving-grounds"?1:3))throw Error("Taille de deck non conforme aux listes officielles.");
  if(!main.some(c=>canonicalCode(c.code)===canonicalCode(champion.code)))throw Error("Champion absent du deck principal.");
  const battlefield=battlefields[Math.floor(rng()*battlefields.length)];
  return {id:preset.id,label:preset.label,format,legend,champion,battlefield,battlefields,main,runes,
    source:preset.source,warning:preset.warning||""};
}
