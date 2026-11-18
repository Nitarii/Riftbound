import {previewCombat} from "./combat-engine.mjs";
import {normalizePlayerAnnouncement,spokenPublicTarget} from "./player-actions.mjs";
import {runeDomain} from "./rune-payment.mjs";
import {goldToken} from "./verified-cards.mjs";
import {chainPriorityReply} from "./rules-compendium.mjs";

const publicZones=new Set(["legend","champion","base","battlefield","runes","trash","banished","chain"]);
export const publicCardVisible=card=>Boolean(card?.name&&!card.faceDown&&publicZones.has(card.zone));
const bilingual=(english,fr,en)=>english?en:fr;
const sideName=(side,english)=>side==="ai"?bilingual(english,"IA","AI"):bilingual(english,"Joueur","Player");
const shortName=card=>card.name.slice(0,44);

export function publicChainDetail(state,card,{english=false}={}){
 const item=state.spellChain?.items.find(value=>!value.ability&&value.uid===card.uid);
 if(!item)return "";
 const target=state.cards.find(candidate=>candidate.uid===item.targetUid&&publicCardVisible(candidate));
 let detail=bilingual(english,"Sur la chaîne.","On the chain.");
 if(target)detail+=" "+bilingual(english,"Cible "+target.name+".","Target "+target.name+".");
 if(Number.isFinite(item.damage)&&item.damage>0)
  detail+=" "+bilingual(english,item.damage+" dégâts prévus avant les réactions.",
   item.damage+" damage before reactions.");
 return detail;
}

function summarizeBoard(state,visible,english){
 const side=owner=>sideName(owner,english);
 const {human,ai}=state.players;
 const lines=[bilingual(english,
  "Tour "+state.turn+" · "+state.phase+" · "+side(state.active)+". Score "+human.score+"–"+ai.score+" (joueur–IA).",
  "Turn "+state.turn+" · "+state.phase+" · "+side(state.active)+". Score "+human.score+"–"+ai.score+" (player–AI).")];
 const fight=state.pendingCombat;
 const field=fight&&state.battlefields[fight.battlefield]?.card?.name;
 if(field){
  if(fight.kind==="combat"){
   const now=previewCombat({...state,cards:visible},fight.battlefield,fight.attacker,fight.orders);
   if(now.ready&&now.attackers.length&&now.defenders.length)lines.push(bilingual(english,
    field+" · "+side(fight.attacker)+" attaque à "+now.attackingMight+", "+side(fight.defender)+" défend à "+now.defendingMight+" pour l’instant.",
    field+" · "+side(fight.attacker)+" attacks at "+now.attackingMight+", "+side(fight.defender)+" defends at "+now.defendingMight+" for now."));
   else lines.push(field+" · "+bilingual(english,"L’échange de dégâts est en attente.","Combat damage is pending."));
  }else lines.push(field+" · "+bilingual(english,"Confrontation de conquête en cours.","Conquest showdown in progress."));
  if(fight.focus)lines.push(bilingual(english,"Focalisation "+side(fight.focus)+".","Focus "+side(fight.focus)+"."));
 }
 if(state.spellChain)lines.push(bilingual(english,"Chaîne en cours · priorité "+side(state.spellChain.priority)+".",
  "Chain in progress · priority "+side(state.spellChain.priority)+"."));
 for(const owner of ["human","ai"]){
  const totals=new Map();
  for(const rune of visible.filter(card=>card.owner===owner&&card.zone==="runes"&&!card.exhausted)){
   const domain=runeDomain(rune)||bilingual(english,"non identifiées","unidentified");
   totals.set(domain,(totals.get(domain)||0)+1);
  }
  const list=[...totals].map(([domain,count])=>count+" "+domain).join(", ");
  lines.push(side(owner)+" · "+bilingual(english,"runes prêtes","ready runes")+" "+(list||"0")+".");
  const reserve=state.powerPool?.[owner]||0;
  const gold=visible.filter(card=>card.owner===owner&&card.zone==="base"&&goldToken(card));
  if(reserve||gold.length)lines.push(side(owner)+" · "+bilingual(english,"Power en réserve ","Power in pool ")+reserve+
   " · Gold "+gold.filter(c=>!c.exhausted).length+"/"+gold.length+" "+bilingual(english,"prêts","ready")+".");
 }
 const units=visible.filter(card=>/^unit$/i.test(card.type));
 const unitNames=(owner,zone,index)=>{
  const cards=units.filter(card=>card.owner===owner&&card.zone===zone&&(index===undefined||card.battlefield===index));
  const names=cards.slice(0,2).map(shortName).join(", ");
  return names?(names+(cards.length>2?" +"+(cards.length-2):"")):"—";
 };
 state.battlefields.forEach((battlefield,index)=>{
  if(!battlefield.card)return;
  lines.push(shortName(battlefield.card)+" · "+side("human")+" "+unitNames("human","battlefield",index)+
   " · "+side("ai")+" "+unitNames("ai","battlefield",index)+".");
 });
 lines.push(bilingual(english,"Bases","Bases")+" · "+side("human")+" "+unitNames("human","base")+
  " · "+side("ai")+" "+unitNames("ai","base")+".");
 return lines.join("\n").slice(0,1200);
}

export function publicTableReply(message,state,{english=false}={}){
 const text=normalizePlayerAnnouncement(message);
 const priority=chainPriorityReply(text,{english});
 if(priority)return {text:priority};
 const request=text.match(/^(?:(?:(?:tu peux|peux tu|can you|could you) )?(?:(?:m'|me )?afficher|affiche|montre(?: moi)?|show(?: me)?)|je (?:ne )?vois pas|i (?:do not|can't) see)\s+(.+)$/);
 if(!request)return null;
 const query=request[1].replace(/^(?:la carte |the card |l'|le |la |the )/,"").trim();
 const visible=state.cards.filter(publicCardVisible);
 if(/^(?:etat (?:du|de la) (?:plateau|table)(?: actuel(?:le)?)?|plateau(?: actuel)?|board(?: state)?|current board(?: state)?|table state)$/.test(query))
  return {text:summarizeBoard(state,visible,english),view:{kind:"board"}};
 const spells=(state.spellChain?.items||[]).slice().reverse().map(item=>
  !item.ability&&visible.find(card=>card.uid===item.uid&&card.zone==="chain")).filter(Boolean);
 const uniqueNames=cards=>[...new Map([...cards].reverse().map(card=>[card.name,card])).values()];
 const card=spokenPublicTarget(uniqueNames(spells),query)||spokenPublicTarget(uniqueNames(visible),query);
 if(!card)return {text:bilingual(english,"Je ne trouve pas de carte publique sous ce nom.",
  "I could not find a public card with that name.")};
 const detail=publicChainDetail({...state,cards:visible},card,{english});
 return {text:[card.name+".",detail].filter(Boolean).join(" "),view:{kind:"card",uid:card.uid}};
}
