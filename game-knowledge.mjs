// Compact knowledge retrieval for the free 0.6B local opponent.
// Our summaries are original, not a copy of Riot's copyrighted rules PDFs.
// The official Rules Hub remains authoritative; card texts come from the
// existing normalized catalogue and should be checked against current errata.
export const RULES_SOURCES=Object.freeze({
 rulesHub:"https://playriftbound.com/fr-fr/rules-hub/",
 rulesHubEN:"https://playriftbound.com/en-us/rules-hub/",
 howToPlay:"https://playriftbound.com/fr-fr/news/rules-and-releases/how-to-play-get-started/",
 status:"Règles de base et règles de tournoi datées du 9 octobre 2026 ; bannissements en construit mis à jour le 18 septembre 2026. Vérifier les changements sur le hub officiel.",
 effectiveDate:"2026-10-16",
 coreRevision:"2026-10-09",
 tournamentRevision:"2026-10-09"
});
const GUIDE=[
 {id:"setup",terms:["mise en place","légende","legend","champion","choisi","deck","format","début"],text:"En duel, chacun a sa légende, un champion choisi visible, des champs de bataille, un deck principal et un deck de runes distinct. La légende détermine les domaines du deck. Un deck préconstruit imprimé peut ne plus être légal en tournoi."},
 {id:"turn",terms:["tour","phase","début","fin","réveil","éveil","pioche","canalis","awaken","draw"],text:"Les phases suivies par ce site sont Awaken, Beginning, Channel, Draw, Main, Ending. La pioche et la canalisation standard du début de tour sont automatisées. Le moteur lit les textes des cartes et applique les instructions qu’il sait vérifier (défausse, pioche, runes, bonus, dégâts simples) aux événements pertinents. Les effets conditionnels, les priorités et les capacités non prises en charge sont affichés en attente de résolution; ne jamais inventer une issue."},
 {id:"runes",terms:["rune","payer","coût","énergie","energy","recycle","canalis","ressource","power"],text:"Règle Riot des runes basiques : une rune prête épuisée fournit 1 Energy ; recycler une rune (même déjà épuisée) sous son Rune Deck fournit 1 Power du domaine imprimé. Les cartes avec Power coûtent les deux ressources. Pour jouer 2 Energy et 1 Fury Power, épuiser 2 runes puis recycler 1 Rune Fury. Le moteur IA choisit exclusivement des runes réellement présentes et de la bonne couleur. Un coût supplémentaire non géré nécessite confirmation."},
 {id:"battlefields",terms:["terrain","battleground","battlefield","champ","contrôle","capture","conquête","victoire","point","score"],text:"Conquer : prendre le contrôle d'un champ de bataille non encore marqué pendant ce tour donne généralement +1 PV, sauf règle du dernier point. Hold : si un champ est toujours contrôlé au Beginning de ton prochain tour, +1 PV. Une unité prête en base peut se déplacer en s'épuisant vers un champ. Entrer sur un champ ennemi/contesté demande un showdown/combat ; ne pas attribuer les points avant sa résolution. Le score de victoire Duel est 8."},
 {id:"combat",terms:["combat","attaque","assaut","might","puissance","dégât","damage","showdown","confrontation","reaction","tank","shield","assault","backline","stun"],text:"Selon Riot Core Rules 9 octobre 2026 : un assaut contre des défenseurs ouvre une confrontation avec fenêtres de réactions. On attend les passes avant la résolution. Les deux camps infligent simultanément leur Might totale, Stun donne 0 dégât sans réduire la Might nécessaire à la survie, Assault améliore la Might attaquante, Shield la Might défensive. Les dégâts sont attribués létalement avant une autre unité, Tank en priorité, Backline en dernier. Les morts vont en défausse, les attaquants survivants sont rappelés en base si un défenseur reste, toutes les unités sont soignées après combat. Contrôle et conquête/points après résolution seulement. Les cartes complexes ou les champs avec effets doivent être annoncés et confirmés par les joueurs avant calcul; ne jamais inventer un déclenchement."},
 {id:"timing",terms:["réaction","reaction","rapid","action","timing","répond","chaine","chaîne","priorité"],text:"Les actions, réactions, déclenchements et capacités ont des fenêtres précises. En cas de doute sur l'ordre des effets ou la possibilité de répondre, demander confirmation plutôt que simuler une règle inexistante."},
 {id:"legality",terms:["banni","bannie","interdit","légal","tournoi","compétit","constructed","standard"],text:"Une liste de bannissements s'applique au Construit officiel. Bannissements du 18 septembre 2026 en Standard : Called Shot, Ekko Recurrent, Draven Vanquisher, Fight or Flight, Scrapheap, Stealthy Pursuer, Stacked Deck ; champs The Arena's Greatest, Aspirant's Climb, Dreaming Tree, Obelisk of Power, Reaver's Row. Vérifier les versions et errata actuels sur le hub Riot."},
 {id:"errata",terms:["texte","effet","errata","règle","officiel","carte","précision"],text:"Le texte actuel d'une carte et les errata Riot prévalent sur une interprétation approximative. Notre catalogue peut être ancien ou non corrigé. Si un effet exact manque, ne pas l'inventer : demander au joueur de confirmer le texte et consulter le hub officiel."}
];
export const SITE_GUIDE=Object.freeze({
 purpose:"Compagnon de partie physique avec moteur déterministe pour les actions et effets de cartes pris en charge. Les capacités complexes demandent une résolution explicite.",
 roles:"human = joueur avec cartes physiques cachées ; ai = adversaire contrôlé par le modèle.",
 chat:"L'humain écrit ou dicte ses actions dans la chatbox. Entrée envoie, Maj+Entrée insère une ligne. Le site relaie la réponse de l'IA et ses changements de plateau.",
 board:"GET /api/state décrit les cartes et leurs uid. Les commandes du serveur font évoluer le plateau; chaque commande modifie la révision et l'historique.",
 commands:"move(uid,zone,battlefield?), add(player:'human',card:{code},zone), draw(player:'ai',count), channel(player:'ai',count), ready(uid), exhaust(uid), damage(uid,value), counter(uid,value,key), score(player,value), phase(phase), next-turn, note(text).",
 setup:"Avant le premier tour, le joueur choisit légende/champion/terrain et le serveur installe un deck préconstruit IA avec select-precon. Ne jamais reconfigurer la partie en cours.",
 history:"Les commandes validées ajoutent une ligne dans l'historique et augmentent revision. Le site montre l'historique, le plateau et la discussion en même temps.",
 phases:["Awaken","Beginning","Channel","Draw","Main","Ending"],
 zones:["legend","champion","hand","deck","base","battlefield","trash","banished","runes","rune-deck","rune-trash"],
 safety:"Ne pas consulter, réclamer ou modifier la main cachée humaine. Les cartes IA jouées doivent provenir d'uid déjà existants dans sa main. Déplacement/score uniquement avec effet ou action fondé.",
 responsibility:"Le joueur manipule ses cartes physiques. Le modèle annonce les siennes et maintient le visuel ; toute règle complexe doit être confirmée."
});
const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const bounded=(text,max)=>String(text||"").slice(0,max);
const isHiddenHuman=card=>card.owner==="human"&&(card.zone==="hand"||card.faceDown);
const detailCard=card=>{
 if(!card)return null;
 return {
  code:bounded(card.code,70),
  name:bounded(card.name,130),
  type:bounded(card.type,45),
  energy:card.energy??null,power:card.power??null,might:card.might??null,
  domains:Array.isArray(card.domains)?card.domains.slice(0,3):[],
  text:bounded(card.text,570),
  ...(card.uid?{uid:bounded(card.uid,80),owner:card.owner,zone:card.zone}:{}),
  ...(card.battlefield!==undefined?{battlefield:card.battlefield}:{})
 };
};
export function selectRules(topic="",limit=4){
 const query=normalize(topic);
 const scored=GUIDE.map((rule,i)=>({
  ...rule,score:rule.terms.reduce((n,term)=>n+(query.includes(normalize(term))?3:0),0)+
   (i===0||i===1||i===3?1:0)
 }));
 return scored.sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(8,limit)))
  .map(({id,text})=>({topic:id,summary:text}));
}
function chosenCards(state){
 const cards=[];
 for(const [owner,index] of [["human",0],["ai",1]]){
  const player=state?.players?.[owner]||{};
  for(const card of [player.legend,player.champion]){
   if(card)cards.push({...card,owner,zone:normalize(card.type).includes("legend")?"legend":"champion"});
  }
  const bf=state?.battlefields?.[index]?.card;
  if(bf)cards.push({...bf,owner,zone:"battlefield-definition"});
 }
 return cards;
}
export function searchRelevantCards(catalog,query="",limit=5){
 const text=normalize(query);
 if(!text)return [];
 const words=[...new Set((text.match(/[\p{L}\p{N}-]+/gu)||[])
  .filter(w=>w.length>=4))].slice(0,30);
 if(!words.length)return [];
 return (Array.isArray(catalog)?catalog:[]).filter(c=>c?.name).map(c=>{
  const name=normalize(c.name),code=normalize(c.code);
  const score=(text.includes(name)&&name.length>=4?15:0)+
   (text.includes(code)&&code.length>=5?18:0)+
   words.reduce((n,w)=>n+(name.includes(w)?(name.startsWith(w)?4:2):0),0);
  return {card:c,score};
 }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score||
   String(a.card.name).localeCompare(String(b.card.name),"fr"))
  .slice(0,Math.max(1,Math.min(20,limit))).map(x=>detailCard(x.card));
}
export function buildGameKnowledge(state,announcement,catalog=[],{
 maxCards=13,maxText=570,ruleCount=4
}={}){
 const sourceCards=new Map((Array.isArray(catalog)?catalog:[])
  .filter(c=>c?.code).map(c=>[normalize(c.code),c]));
 const nameIndex=new Map((Array.isArray(catalog)?catalog:[])
  .filter(c=>c?.name).map(c=>[normalize(c.name),c]));
 const resolved=c=>{
  if(!c)return null;
  const found=sourceCards.get(normalize(c.code))||nameIndex.get(normalize(c.name));
  return {...c,
   // Imported card errata/corrections are preferred to stale board snapshots.
   text:found?.text||c.text||"",
   domains:found?.domains||c.domains||[],
   energy:found?.energy??c.energy,
   power:found?.power??c.power,
   might:found?.might??c.might
  };
 };
 const message=normalize(announcement);
 const candidates=[];
 const priority=new Map();
 const add=(card,level)=>{
  if(!card?.name||isHiddenHuman(card))return;
  const key=card.uid||normalize(card.code)+"|"+normalize(card.name)+"|"+(card.owner||"");
  const prev=priority.get(key);
  if(prev&&prev.level>=level)return;
  const item={card:resolved(card),level,key};
  priority.set(key,item);
 };
 // The AI's private hand, active units and battlefields are more important
 // than generic catalogue matches on every message.
 for(const card of state?.cards||[]){
  if(card.owner==="ai"&&card.zone==="hand")add(card,100);
  else if(card.zone==="battlefield")add(card,70);
  else if(card.zone==="base")add(card,50);
  else if(card.zone==="runes")add(card,35);
 }
 for(const card of chosenCards(state))add(card,95);
 for(const card of searchRelevantCards(catalog,announcement,8))add(card,80);
 candidates.push(...priority.values());
 const ranked=candidates.sort((a,b)=>b.level-a.level||
  (message.includes(normalize(a.card.name))?-1:0)-(message.includes(normalize(b.card.name))?-1:0));
 const picked=ranked.slice(0,Math.max(1,Math.min(24,maxCards))).map(x=>{
  const full=detailCard(x.card);
  full.text=bounded(full.text,Math.max(80,Math.min(1500,maxText)));
  return full;
 });
 const missing=picked.filter(c=>!c.text).map(c=>c.name).slice(0,8);
 const truncated=picked.filter((c,i)=>{
  const original=ranked[i]?.card?.text||"";
  return original.length>Math.max(80,Math.min(1500,maxText));
 }).map(c=>c.name).slice(0,8);
 for(const card of picked){
  if(truncated.includes(card.name))card.text+=" … [texte incomplet, consulter la carte officielle]";
 }
 return {
  rules:{revision:RULES_SOURCES.coreRevision,source:RULES_SOURCES.rulesHub,
   notice:"Règles originales résumées, non exhaustives; le hub officiel et les errata prévalent.",
   quickReference:selectRules(announcement,ruleCount)},
  site:SITE_GUIDE,
  cards:picked,
  catalog:{available:Array.isArray(catalog)&&catalog.length>100,
   count:Array.isArray(catalog)?catalog.length:0,
   missingTexts:missing,truncatedTexts:truncated,
   note:"Textes issus du catalogue. Pour une capacité manquante ou tronquée, demander confirmation; vérifier les errata officiels."}
 };
}
export function publicReference(query,catalog=[]){
 return {sources:RULES_SOURCES,quickRules:selectRules(query,6),
  site:SITE_GUIDE,matches:searchRelevantCards(catalog,query,12),
  catalogCount:Array.isArray(catalog)?catalog.length:0};
}
