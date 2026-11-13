// Bilingual, typo-tolerant interpretation of announced PHYSICAL actions.
// Understand intent without inventing cards, hidden hands, costs or rule effects.
import {applyCommand} from "./core.mjs";

const clean=value=>String(value||"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").toLowerCase()
 .replace(/[,;:!?()[\]{}]+/g," ").replace(/[-–—]+/g," ")
 .replace(/\s+/g," ").trim();
const words=value=>clean(value).match(/[a-z0-9']+/g)||[];
const num=value=>({un:1,une:1,one:1,a:1,an:1,deux:2,two:2,trois:3,three:3,quatre:4,four:4}[value]||Number(value));
const number="(\\d+|un|une|one|two|deux|trois|three|four|quatre)";
const fail=(fr,en)=>({commands:[],recognized:true,error:fr,errorEN:en});

export function detectMessageLanguage(message,fallback="fr"){
 const tokens=words(message);
 const fr=new Set(["je","j'ai","j'en","mon","ma","mes","moi","dans","sur","pour","avec","et","les","des","de","une","un","pioche","canalise","joue","poser","pose","epuise","termine","finis","tour","bonjour","merci","peux"]);
 const en=new Set(["i","i'm","my","your","the","to","in","into","on","and","from","with","please","draw","channel","play","place","exhaust","spend","end","turn","hello","thanks","can","should"]);
 let francais=0,english=0;
 for(const token of tokens){
  if(fr.has(token))francais+=["je","mon","ma","mes","dans","pour","tour"].includes(token)?3:1;
  if(en.has(token))english+=["i","my","your","the","turn"].includes(token)?3:1;
 }
 const first=clean(message);
 if(/^(?:je\b|j\x27|moi\b)/.test(first))francais+=5;
 else if(/^(?:i\b|my\b)/.test(first))english+=5;
 if(francais===english)return fallback==="en"?"en":"fr";
 return francais>english?"fr":"en";
}

// Distance 1 correction for gameplay verbs only; card names are matched separately.
// A unique candidate is required: never turn an uncertain verb into an action.
const aliases=new Map(Object.entries({
 canalize:"canalise",canaliz:"canalise",canalis:"canalise",canaliser:"canalise",canalisee:"canalise",
 chanel:"channel",chanell:"channel",channell:"channel",channelle:"channel",
 pioch:"pioche",piocher:"pioche",piohc:"pioche",piohce:"pioche",piocche:"pioche",piohshe:"pioche",
 drwa:"draw",draww:"draw",draws:"draw",drau:"draw",
 jou:"joue",jouer:"joue",jous:"joue",joeu:"joue",jou:"joue",
 paly:"play",plai:"play",plaie:"play",
 poser:"pose",poses:"pose",placement:"place",
 exhauste:"exhaust",exaust:"exhaust",exahust:"exhaust",exhause:"exhaust",exoste:"exhaust",
 epuisee:"epuise",epuisse:"epuise",epuizer:"epuise",epuiser:"epuise",
 depense:"spend",depenses:"spend",spent:"spend",utiliser:"utilise",
 runne:"rune",runee:"rune",runnes:"runes",runees:"runes",deuz:"deux",troi:"trois",thre:"three",torn:"turn",
 cartte:"carte",carttes:"cartes",carteee:"carte",
 finis:"finis",finni:"finis",fini:"finis",terminer:"termine",termineer:"termine",
 passez:"passe",paser:"passe",passer:"passe",finished:"finish",ended:"end"
}));
const intentWords=["canalise","channel","pioche","exhaust","epuise","termine","finish","passe","place","invoque","summon","utilise","spend","draw","joue","pose","play","pass","end"];
const intentNouns=["runes","rune","cartes","carte","cards","card","turn","tour"];
function distance(a,b,max=3){
 if(Math.abs(a.length-b.length)>max)return max+1;
 const previous=Array.from({length:b.length+1},(_,i)=>i);
 let prevPrev=null;
 for(let i=1;i<=a.length;i++){
  const next=[i];
  for(let j=1;j<=b.length;j++){
   let best=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])
    best=Math.min(best,prevPrev[j-2]+1);
   next.push(best);
  }
  prevPrev=[...previous];
  previous.splice(0,previous.length,...next);
 }
 return previous[b.length];
}
function correctToken(token){
 if(aliases.has(token))return aliases.get(token);
 if(token.length<5||intentWords.includes(token)||intentNouns.includes(token))return token;
 const candidates=[...intentWords,...intentNouns].filter(word=>Math.abs(word.length-token.length)<=1&&distance(token,word,1)<=1);
 return candidates.length===1?candidates[0]:token;
}
export const normalizePlayerAnnouncement=message=>clean(message).replace(/[a-z]+/g,correctToken);

function catalogEntries(catalog){
 const byName=new Map();
 for(const card of catalog||[]){
  if(!card?.name||!card?.code||card.isVariant)continue;
  const key=clean(card.name);
  if(!byName.has(key))byName.set(key,card);
 }
 return [...byName].map(([key,card])=>({key,card}));
}
function cardQuery(name){
 return clean(name).replace(/^(?:(?:un|une|a|an|the|my|mon|ma|le|la)\s+|l')+/,"").trim();
}
function rankedCards(catalog,name){
 const query=cardQuery(name),entries=catalogEntries(catalog);
 if(!query)return [];
 const exact=entries.filter(x=>x.key===query||clean(x.card.code)===query);
 if(exact.length)return exact.map(x=>({...x,score:0}));
 // User may invert spoken card names ("Poro Loyal" for "Loyal Poro").
 const parts=query.split(" ").filter(Boolean);
 if(parts.length>=2){
  const key=parts.slice().sort().join(" ");
  const swapped=entries.filter(x=>x.key.split(" ").filter(Boolean).sort().join(" ")===key);
  if(swapped.length===1)return swapped.map(x=>({...x,score:0}));
 }
 const partial=query.length>=5?entries.filter(x=>x.key.includes(query)):[],prefix=partial.length===1?partial:[];
 if(prefix.length)return prefix.map(x=>({...x,score:0}));
 if(query.length<6)return [];
 const max=query.length>=8?2:1;
 return entries.map(x=>({...x,score:distance(query,x.key,max+2)}))
  .filter(x=>x.score<=max+1).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key))
  .slice(0,5);
}
export function findAnnouncedCard(catalog,name){
 const ranked=rankedCards(catalog,name);
 if(ranked.length!==1&&ranked.length===0)return null;
 if(!ranked.length)return null;
 const query=cardQuery(name),best=ranked[0];
 if(best.score===0)return ranked.length===1?best.card:null;
 const max=query.length>=8?2:1;
 if(best.score>max)return null;
 if(ranked[1]&&ranked[1].score<=best.score+1)return null;
 return best.card;
}
function unknownCard(catalog,name){
 const possible=rankedCards(catalog,name).slice(0,3).map(x=>x.card.name);
 const hints=possible.length?" Propositions : "+possible.join(" / ")+".":"";
 const hintsEN=possible.length?" Suggestions: "+possible.join(" / ")+".":"";
 return {...fail("Je ne peux pas identifier « "+name+" » avec certitude."+hints+" Précise le nom exact avant de déplacer une carte.",
  "I cannot identify “"+name+"” confidently."+hintsEN+" Please confirm the exact card name before moving it."),
   needsClarification:{kind:"card",query:name}};
}
function expectedChannel(state){
 const first=state.firstPlayer||((state.history||[]).find(h=>/Début de partie/.test(h.text||""))?.text?.includes("IA")?"ai":"human");
 return state.turn===1&&!(state.turnActions?.channeled)&&state.active!==first?3:2;
}

export function planHumanAnnouncement(message,startingState,catalog=[]){
 const text=normalizePlayerAnnouncement(message).slice(0,1200),state=startingState;
 if(!text||!state?.started)return {commands:[],recognized:false};
 // A question, negation or hypothesis is not an instruction to move physical pieces.
 if(/[?]/.test(String(message))||
  /^(?:est ce que|est-ce que|puis je|peux je|peut on|pourquoi|combien|comment|can i|could i|should i|may i|what if|how (?:do|many)|if i|si je)\b/.test(text)||
  /\b(?:ne\s+(?:veux|veut|vais|joue|pioche)\s+pas|je\s+(?:ne\s+)?(?:veux|veut)\s+pas|(?:joue|pose|play|pioche|draw|exhaust|canalise|channel)\s+pas|don'?t|do not|won'?t|cannot|not going to|pas envie|sans jouer)\b/.test(text))
  return {commands:[],recognized:false};
 const channel=text.match(new RegExp("\\b(?:pioche|canalise|channel|draw|prends|take)\\s+(?:(?:mes|my|the|les|des|de)\\s+)?"+number+"\\s+runes?\\b"))||
  text.match(new RegExp("\\b(?:canalise|channel)\\s+"+number+"\\b"));
 const draw=text.match(new RegExp("\\b(?:pioche|draw|prends|take)\\s+(?:(?:mes|my|the|les|des|de)\\s+)?"+number+"\\s+(?:cartes?|cards?)\\b"))||
  (/\b(?:pioche|draw)\s+(?:ma|une|la|my|one|a|the)\s+(?:carte|card)\b/.test(text)?["","1"]:null);
 const spend=text.match(new RegExp("\\b(?:exhaust|epuise|tap|spend|utilise|use)\\s+(?:(?:mes|my|les)\\s+)?"+number+"(?:\\s+runes?)?\\b"))||
  text.match(new RegExp("\\b(?:pour|for|avec|with|contre|cout|coute|payer|pay)\\s+"+number+"\\s+runes?\\b"));
 const play=text.match(/\b(?:joue|pose|place|invoque|play|summon|mets)\s+(?:(?:un|une|le|la|mon|ma|my|a|an|the)\s+|l')?([a-z0-9' -]{2,96}?)\s+(?:dans|sur|in|onto|on|to)\s+(?:(?:ma|mon|my|the|la|le)\s+)?(base|champ(?: de bataille)?|battlefield|terrain|field)\b/)||
   text.match(/\b(?:joue|pose|place|invoque|play|summon|mets)\s+(?:(?:un|une|le|la|mon|ma|my|a|an|the)\s+|l')?([a-z0-9' -]{3,90}?)(?=\s+(?:pour|for|avec|with|contre|cout|coute|payer|pay)\s+(?:\d+|un|une|one|two|deux|trois|three|four|quatre)\s+runes?\b|\s+(?:et\s+je|and\s+i|puis\s+je|then\s+i)\b|$)/);
 const endTurn=/\b(?:termine|finis|passe|end|finish|pass)\s+(?:(?:mon|my|le|the)\s+)?(?:tour|turn)\b|\b(?:mon|my)\s+(?:tour|turn)\s+(?:(?:is|est)\s+)?(?:fini|termine|over)\b/.test(text);
 const recognized=Boolean(channel||draw||spend||play||endTurn);
 if(!recognized)return {commands:[],recognized:false};
 if(state.active!=="human")return fail("Ce n'est pas ton tour : attends que l'IA termine le sien.",
  "It isn't your turn yet. Wait for the AI to finish.");
 const commands=[];let preview=state;
 const add=cmd=>{preview=applyCommand(preview,cmd);commands.push(cmd);};
 try{
  if(channel){
   const count=num(channel[1]),expected=expectedChannel(preview);
   if(preview.turnActions?.channeled===count){
    // The mandatory runes were already channeled by the automatic start of turn.
   }else{
   if(!Number.isInteger(count)||count!==expected)
    return fail("Tu dois canaliser "+expected+" runes pendant cette phase"+
      (state.turn===1?" (premier joueur : 2, second : 3).":"."),
      "Channel "+expected+" runes in this phase"+(state.turn===1?" (first player: 2, second: 3).":"."));
   if(preview.turnActions?.channeled)return fail("Les runes de ce tour ont déjà été canalisées.",
    "You already channeled your runes this turn.");
   if(preview.players.human.runeCount<count)return fail("Il ne reste pas assez de runes dans ton deck.",
    "There are not enough runes in your deck.");
   add({type:"phase",phase:"Channel"});
   add({type:"channel",player:"human",count});
   }
  }
  if(draw){
   if(!preview.turnActions?.channeled)return fail("Commence par canaliser les runes de ton tour.",
    "Channel your runes before drawing.");
   const count=num(draw[1]);
   if(preview.turnActions?.drawn===count){
    // Repeat of the normal draw; do not draw again.
   }else{
   if(count!==1)return fail("Sans effet de carte confirmé, tu dois piocher 1 carte pendant la phase Draw.",
    "Without a confirmed card effect, draw 1 card during the Draw phase.");
   if(preview.turnActions?.drawn)return fail("Tu as déjà effectué ta pioche normale de ce tour.",
    "You already drew your standard card this turn.");
   add({type:"phase",phase:"Draw"});
   add({type:"draw",player:"human",count:1});
   }
  }
  if(play){
   if(play[2]&&play[2]!=="base")return fail("Le déplacement direct vers un champ de bataille nécessite une vérification des règles. Précise l'action exacte.",
    "Playing directly onto a battlefield needs rules verification. Clarify the exact action.");
   const card=findAnnouncedCard(catalog,play[1]);
   if(!card)return unknownCard(catalog,play[1]);
   if(!/unit|unite|unité/i.test(card.type||""))
    return fail("Cette carte n'est pas une unité jouable en base. Vérifions sa zone et son effet.",
     "This card is not a regular unit playable into your base. Check its zone and effect.");
   if(preview.players.human.handCount<=0)
    return fail("Le compte de ta main est à zéro : vérifie-le avant de jouer une carte.",
      "Your hand count is zero. Update it before playing a card.");
   if(!preview.turnActions?.channeled||!preview.turnActions?.drawn)
    return fail("Le début de tour n'est pas encore résolu sur le plateau.",
      "The normal start of turn has not been completed on the board.");
   if(card.energy==null||card.energy===""||!Number.isFinite(Number(card.energy))||Number(card.energy)<0)
    return fail("Le coût de "+card.name+" est indisponible : paiement non vérifiable.",
      "The cost of "+card.name+" is missing; payment cannot be verified.");
   const energy=Number(card.energy),ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   const spent=spend?num(spend[1]):energy;
   // Energy is printed on the card: infer payment without making the player
   // announce a number. A spoken number must still be checked against the card.
   if(Number(card.power||0)>0)return fail(
    "Cette carte exige aussi du Power de domaine : confirme les runes à recycler avant de la jouer.",
    "This card also requires domain Power: confirm which runes to recycle before playing.");
   if(ready<energy)return fail(
     "Tu ne peux pas encore jouer "+card.name+" : cette carte coûte "+energy+
     " énergies, mais tu n'as que "+ready+" rune(s) prête(s). Aucune carte n'a été posée.",
     "You cannot play "+card.name+" yet: it costs "+energy+
     " energy, but you only have "+ready+" ready rune(s). No card was played.");
    if(!Number.isInteger(spent)||spent!==energy)
     return fail("Pour jouer "+card.name+", il faut épuiser exactement "+energy+" rune(s), et non "+spent+".",
      "Playing "+card.name+" requires exactly "+energy+" runes, not "+spent+".");
    if(spent>0)add({type:"exhaust-runes",player:"human",count:spent});
   add({type:"phase",phase:"Main"});
   add({type:"add",player:"human",card,zone:"base",fromHand:true});
  }else if(spend){
   const count=num(spend[1]),ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   if(!Number.isInteger(count)||count<1||count>ready)
    return fail("Tu n'as pas assez de runes prêtes pour cette dépense.",
     "You don't have enough ready runes to pay that amount.");
   add({type:"exhaust-runes",player:"human",count});
  }
  if(endTurn){
   add({type:"phase",phase:"Ending"});
   add({type:"next-turn"});
  }
  return {commands,recognized:true,summary:commands.length?preview.message:""};
 }catch(error){return fail("Action non appliquée : "+String(error.message||error),
  "Action not applied: "+String(error.message||error));}
}
