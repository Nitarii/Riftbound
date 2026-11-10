// Conservative, human-led French narration recognition.
// This records explicit declarations; it does NOT validate costs, timing, effects or legality.
const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").toLowerCase().replace(/\s+/g," ").trim();
const numbers={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5};
const amount=x=>{
  if(!x)return 1;
  const n=Number(x);
  return Number.isInteger(n)?n:numbers[norm(x)]||1;
};
const VALID_AMOUNT=x=>Number.isInteger(x)&&x>0&&x<=12;
function chooseCard(catalog,query){
  const q=norm(query).replace(/^(une?|la|le|les)\s+carte\s+/,"").trim();
  const candidates=catalog.filter(c=>norm(c.name)===q||norm(c.code)===q);
  const card=candidates.find(c=>!c.isVariant)||candidates[0];
  if(card)return {card};
  // For spoken names, permit a unique partial match only.
  const partial=catalog.filter(c=>norm(c.name).includes(q)&&q.length>3);
  const names=new Set(partial.map(c=>norm(c.name)));
  if(names.size===1)return {card:partial.find(c=>!c.isVariant)||partial[0]};
  return {error:partial.length?"Plusieurs cartes portent ce nom ; précise le sous-titre.":"Carte non trouvée : "+query};
}
export function parseNarration(sentence,catalog=[],state=null){
  const t=norm(sentence).replace(/[.!?]+$/,"");
  if(!t)return null;
  const p=/\b(?:l'?ia|l'?intelligence artificielle|adversaire|bot)\b/.test(t)?"ai":"human";
  let m=t.match(/\b(?:pioche|pioches|piocher|tire)\s+(?:(\d+|un|une|deux|trois|quatre|cinq)\s+)?(?:cartes?|carte|fois)?\s*$/);
  if(m){
    const count=amount(m[1]);if(!VALID_AMOUNT(count))return {error:"Nombre de cartes invalide."};
    return {command:{type:"draw",player:p,count},label:(p==="ai"?"L'IA":"Le joueur")+" pioche "+count+" carte(s)."};
  }
  m=t.match(/\b(?:canalise|canaliser|canalises)\s+(?:(\d+|un|une|deux|trois|quatre|cinq)\s+)?(?:runes?|rune)?\s*$/);
  if(m){
    const count=amount(m[1]);if(!VALID_AMOUNT(count))return {error:"Nombre de runes invalide."};
    return {command:{type:"channel",player:p,count},label:(p==="ai"?"L'IA":"Le joueur")+" canalise "+count+" rune(s)."};
  }
  m=t.match(/\b(?:gagne|marque|prends?)\s+(?:(\d+|un|une|deux|trois|quatre|cinq)\s+)?(?:points?|pv)\s*$/);
  if(m){
    const value=amount(m[1]);if(!VALID_AMOUNT(value))return {error:"Nombre de points invalide."};
    return {command:{type:"score",player:p,value},label:(p==="ai"?"L'IA":"Le joueur")+" gagne "+value+" point(s)."};
  }
  if(/\b(?:termine|finis|passe)\s+(?:mon|son|le)\s+tour\b/.test(t)||/^fin (?:de |du )?tour$/.test(t)){
    return {command:{type:"next-turn"},label:"Passer au tour suivant."};
  }
  m=t.match(/\b(?:joue|pose|deploie|invoque|place|mets)\s+(.+?)\s+(?:dans|en|sur|au)\s+(?:ma |sa |la |le |mon |son )?(base|champ de bataille|battlefield|terrain)(.*)$/);
  if(m){
    const result=chooseCard(catalog,m[1]);
    if(result.error)return {error:result.error};
    const zone=m[2]==="base"?"base":"battlefield";
    const suffix=norm(m[3]||"");
    const battlefield=/\b(?:de l'?ia|de l'?adversaire|ennemi)\b/.test(suffix)?1:0;
    return {command:{type:"add",player:p,card:result.card,zone,battlefield},
      label:(p==="ai"?"L'IA":"Le joueur")+" place "+result.card.name+" "+(zone==="base"?"dans sa base":"sur le champ de bataille "+(battlefield+1))+"."};
  }
  m=t.match(/\b(?:epuise|redresse)\s+(?:la carte |l'?unite )?(.+)$/);
  if(m&&state){
    const matches=(state.cards||[]).filter(c=>norm(c.name)===norm(m[1]));
    if(matches.length!==1)return {error:matches.length?"Plusieurs exemplaires trouvés : sélectionne la carte sur le plateau.":"Carte non présente sur le plateau."};
    const type=t.includes("redresse")?"ready":"exhaust";
    return {command:{type,uid:matches[0].uid},label:(type==="ready"?"Redresser ":"Épuiser ")+matches[0].name+"."};
  }
  return null;
}
