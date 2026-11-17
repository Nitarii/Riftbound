// Bilingual, typo-tolerant interpretation of announced PHYSICAL actions.
// Understand intent without inventing cards, hidden hands, costs or rule effects.
import {applyCommand} from "./core.mjs";
import {rankSpokenCards,matchSpokenCard} from "./card-voice.mjs";
import {fieldMusicians,verifiedSpell,soulspinner,printedCode} from "./verified-cards.mjs";
import {RUNE_DOMAINS,runeDomain} from "./rune-payment.mjs";

const clean=value=>String(value||"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").toLowerCase()
 .replace(/[.,;:!?()[\]{}]+/g," ").replace(/[-–—]+/g," ")
 .replace(/\s+/g," ").trim();
const words=value=>clean(value).match(/[a-z0-9']+/g)||[];
const num=value=>({un:1,une:1,one:1,a:1,an:1,deux:2,two:2,trois:3,three:3,quatre:4,four:4}[value]||Number(value));
const number="(\\d+|un|une|one|two|deux|trois|three|four|quatre)";
const domainNames={...Object.fromEntries(RUNE_DOMAINS.map(x=>[x.toLowerCase(),x])),
 ordre:"Order",calme:"Calm",fureur:"Fury",corps:"Body",esprit:"Mind"};
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
 jou:"joue",jouer:"joue",jous:"joue",joeu:"joue",
 paly:"play",plai:"play",plaie:"play",
 poser:"pose",poses:"pose",placement:"place",
 exhauste:"exhaust",exaust:"exhaust",exahust:"exhaust",exhause:"exhaust",exoste:"exhaust",
 epuisee:"epuise",epuisse:"epuise",epuizer:"epuise",epuiser:"epuise",
 depense:"spend",depenses:"spend",spent:"spend",utiliser:"utilise",
 runne:"rune",runee:"rune",runnes:"runes",runees:"runes",deuz:"deux",troi:"trois",thre:"three",torn:"turn",tou:"tour",
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

export function findAnnouncedCard(catalog,name){
 return matchSpokenCard(catalog,name).card;
}
function unknownCard(catalog,name){
 const possible=rankSpokenCards(catalog,name,{limit:3})
  .filter(x=>x.score>=.60).map(x=>x.card.name);
 const hints=possible.length?" Propositions : "+possible.join(" / ")+".":"";
 const hintsEN=possible.length?" Suggestions: "+possible.join(" / ")+".":"";
 return {...fail("Je ne peux pas identifier « "+name+" » avec certitude."+hints+
  " Dis le nom exact de la carte ou confirme une proposition.",
  "I cannot identify “"+name+"” confidently."+hintsEN+
  " Please confirm the actual card name before playing it."),
  needsClarification:{kind:"card",query:name}};
}
function expectedChannel(state){
 const first=state.firstPlayer||"human";
 return Math.min(state.players.human.runeCount,
  state.turn===1&&state.active!==first?3:2);
}
export function spokenPublicTarget(cards,phrase){
 const query=clean(phrase).replace(/^(?:la |le |mon |ma |my |the |l')/,"").trim();
 const identified=matchSpokenCard(cards.map((c,i)=>({...c,code:c.code||"voice-"+i})),query).card?.name;
 const viable=identified?cards.filter(c=>c.name===identified):
  query.length>=4?cards.filter(c=>clean(c.name).split(" ").includes(query)||
     clean(c.name).startsWith(query+" ")): [];
 return viable.length===1?viable[0]:null;
}
export function spokenField(state,phrase){
 return spokenPublicTarget(state.battlefields.map((b,index)=>b.card&&({...b.card,index})).filter(Boolean),phrase)?.index??null;
}
export function planTargetedPlay(text,state,catalog){
 // Preserve the target and battlefield as separate choices, with no model guessing.
 const board=state.cards.filter(c=>["base","battlefield"].includes(c.zone)&&/^unit$/i.test(c.type)&&!c.faceDown);
 const hide=text.match(/^(?:je cache une carte|i hide a card)\s+(?:au|a|sur|at|on)\s+(.+?)(?:\s+(?:en recyclant|avec|using)\s+(?:une rune |a rune )?([a-z]+))?$/);
 if(hide){
  const field=spokenField(state,hide[1]);
  if(field===null)return fail("Choisis le champ où cacher une carte, sans donner son nom.",
   "Name the battlefield where you are hiding a card. Keep the card name private.");
  let runeUid;
  if(hide[2]){
   const domain=Object.hasOwn(domainNames,hide[2])?domainNames[hide[2]]:null;
   const selected=state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&
    domain&&runeDomain(c)===domain).sort((a,b)=>Number(b.exhausted)-Number(a.exhausted))[0];
   if(!selected)return fail("Identifie sur le plateau la rune que tu recycles pour cacher.",
    "Identify the rune you are recycling to hide.");
   runeUid=selected.uid;
  }
  return {type:"hide",player:"human",battlefield:field,runeUid};
 }
 const hiddenPlay=text.match(/^(?:je revele|je joue|i reveal|i play)\s+(.+?)(?:\s+(?:cachee?|face cachee|from hidden))\s+(?:au|a|at|from)\s+(.+?)(?:\s+(?:sur|avec|moving|on)\s+(.+))?$/)||
  text.match(/^(?:je revele|i reveal)\s+(.+?)\s+(?:au|a|at|from)\s+(.+?)(?:\s+(?:sur|avec|moving|on)\s+(.+))?$/);
 if(hiddenPlay){
  const field=spokenField(state,hiddenPlay[2]);
  const slot=state.cards.find(c=>c.owner==="human"&&c.zone==="hidden"&&c.faceDown&&c.battlefield===field);
  if(!slot)return fail("Précise le champ de ta carte cachée.","Specify the battlefield of your hidden card.");
  const card=findAnnouncedCard(catalog,hiddenPlay[1]);
  if(!card)return unknownCard(catalog,hiddenPlay[1]);
  const rule=verifiedSpell(card);
  if(!rule)return {type:"play-hidden",player:"human",uid:slot.uid,card};
  const targets=rule.returnToBase?board.filter(c=>c.zone==="battlefield"&&c.battlefield===field):
   board.filter(c=>c.owner==="human");
  const target=hiddenPlay[3]&&spokenPublicTarget(targets,hiddenPlay[3]);
  if(!target)return fail("Indique l’unité ciblée par le sort caché.",
   "Name the unit targeted by the hidden spell.");
  return {type:"cast",player:"human",uid:slot.uid,hidden:true,battlefield:field,targetUid:target.uid,card};
 }
 const flow=text.match(/^(?:je (?:joue|lance)|i (?:play|cast))\s+(.+?)\s+(?:depuis (?:ma|la) defausse|par flux|from (?:my|the) trash|with flow)\s+(?:sur|on)\s+(.+)$/);
 if(flow){
  const trash=state.cards.filter(c=>c.owner==="human"&&c.zone==="trash"&&verifiedSpell(c)?.flow);
  const source=findAnnouncedCard(trash,flow[1]);
  const target=spokenPublicTarget(board,flow[2]);
  if(!source||!target)return fail("Indique un sort avec Flux dans ta défausse et une cible visible.",
   "Name a supported Flow spell from your trash and its visible target.");
  const instance=trash.find(c=>printedCode(c)===printedCode(source));
  return {type:"cast",player:"human",uid:instance.uid,flow:true,targetUid:target.uid};
 }
 const transfer=text.match(/^(?:je joue )?resonating strike\s*(?:je deplace|pour deplacer|sur)\s+(.+?)(?:\s+de\s+.+?)?\s+(?:vers|au|sur|a)\s+(.+?)(?:\s+\+?2.*)?$/);
 if(transfer){
  const card=findAnnouncedCard(catalog,"Resonating Strike");
  const target=spokenPublicTarget(board.filter(c=>c.owner==="human"),transfer[1]);
  const field=spokenField(state,transfer[2]);
  if(!card||!target||field===null)return fail("Précise l’unité et le champ contrôlé de Resonating Strike.",
   "Specify the friendly unit and controlled battlefield for Resonating Strike.");
  return {type:"cast",player:"human",card,targetUid:target.uid,battlefield:field};
 }
 const ambush=text.match(/^(?:je joue|je pose|i play)\s+(.+?)\s+en embuscade\s+(?:sur|au|a)\s+(.+?)(?:\s+sur mes .*runes.*)?$/);
 if(ambush){
  const card=findAnnouncedCard(catalog,ambush[1]),field=spokenField(state,ambush[2]);
  if(!soulspinner(card)||field===null)return fail("Embuscade non reconnue : précise la carte et le champ.",
   "Specify the supported Ambush unit and the battlefield.");
  return {type:"play-physical",card,battlefield:field,ambush:true};
 }
 const play=text.match(/^(?:je joue|je pose|i play|le bonus de)\s+(.+?)(?:\s+que je mets)?\s+(?:sur|cible|targeting|on)\s+(.+?)(?:\s+pour .*runes?)?$/);
 if(!play){
  const threatening=state.spellChain?.items.at(-1);
  const target=threatening?.damage>0&&board.find(c=>c.uid===threatening.targetUid&&c.owner==="human");
  if(!target)return null;
  const implicit=text.match(/^(?:je joue|i play)\s+(.+)$/);
  const spell=implicit&&findAnnouncedCard(catalog,implicit[1]);
  return spell&&verifiedSpell(spell)?.prevention&&target?
   {type:"cast",player:"human",card:spell,targetUid:target.uid}:null;
 }
 const card=findAnnouncedCard(catalog,play[1]);
 if(!card||!verifiedSpell(card)&&!/^unit$/i.test(card.type))return null;
 const target=spokenPublicTarget(board,play[2]);
 if(verifiedSpell(card)){
  if(!target)return fail("Cible de "+card.name+" ambiguë : indique le nom de l’unité sur le plateau.",
    "Specify the unit targeted by "+card.name+".");
  return {type:"cast",player:"human",card,targetUid:target.uid};
 }
 if(fieldMusicians(card)&&target)return {type:"play-physical",card,targetUid:target.uid};
 if(text.startsWith("le bonus de "))return null;
 const field=spokenField(state,play[2]);
 return field!==null?{type:"play-physical",card,battlefield:field}:null;
}

export function planHumanAnnouncement(message,startingState,catalog=[]){
 const text=normalizePlayerAnnouncement(message).slice(0,1200)
  .replace(/\b(?:pour de|pour des) runes?$/,"").trim(),state=startingState;
 if(!text||!state?.started)return {commands:[],recognized:false};
 // A question, negation or hypothesis is not an instruction to move physical pieces.
 if(/[?]/.test(String(message))||
  /^(?:est ce que|est-ce que|puis je|peux je|peut on|pourquoi|combien|comment|can i|could i|should i|may i|what if|how (?:do|many)|if i|si je)\b/.test(text)||
  /\b(?:ne\s+(?:veux|veut|vais|joue|pioche)\s+pas|je\s+(?:ne\s+)?(?:veux|veut)\s+pas|(?:joue|pose|play|pioche|draw|exhaust|canalise|channel)\s+pas|don'?t|do not|won'?t|cannot|not going to|pas envie|sans jouer)\b/.test(text))
  return {commands:[],recognized:false};
 const inventory=text.match(new RegExp("^j'ai "+number+" runes? (?:d'|de )?([a-z]+) (?:pas|non) epuis(?:e|ees|es)(?: et)? je joue (.+)$"));
 if(inventory&&Object.hasOwn(domainNames,inventory[2])){
  const n=num(inventory[1]),domain=domainNames[inventory[2]];
  const ready=state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted);
  const typed=ready.filter(c=>runeDomain(c)===domain);
  const unknown=ready.filter(c=>c.code==="PHYSICAL-RUNE");
  if(typed.length!==n&&!(typed.length<n&&n-typed.length===unknown.length))return fail(
   "Le nombre de runes prêtes annoncé ne concorde pas avec le plateau. Vérifie les runes physiques avant le sort.",
   "The announced ready runes do not match the board. Check the physical runes before casting.");
  const corrections=typed.length===n?[]:unknown.map(c=>({type:"rune-identify",uid:c.uid,domain}));
  const next=corrections.reduce(applyCommand,state);
  const play=planHumanAnnouncement("je joue "+inventory[3],next,catalog);
  if(play.error||!play.commands.length)return play;
  return {...play,commands:[...corrections,...play.commands]};
 }
 const declaredDiscard=text.match(/^(?:je de fausse|je defausse|i discard)\s+(.+?)(?:\s+et je pioche|\s+and i draw)?$/);
 const waiting=state.pendingEffects?.[0];
 if(waiting?.trigger==="hidden-reveal"){
  const reveal=text.match(/^(?:je revele|i reveal)\s+(.+)$/);
  if(reveal){
   const card=findAnnouncedCard(catalog,reveal[1]);
   if(!card)return unknownCard(catalog,reveal[1]);
   return {commands:[{type:"effect-confirm",id:waiting.id,confirm:true,card}],recognized:true};
  }
 }
 if(declaredDiscard&&waiting?.player==="human"&&
    (waiting.choice?.kind==="discard-draw"||waiting.trigger==="spell-discard")){
  const card=findAnnouncedCard(catalog,declaredDiscard[1]);
  if(!card)return unknownCard(catalog,declaredDiscard[1]);
  return {commands:[{type:"effect-confirm",id:waiting.id,confirm:true,card}],recognized:true};
 }
 if(/^(?:je passe|i pass|vas y|tu peux resoudre|je ne peux pas reagir|aucune reaction)$/.test(text)){
  if(state.spellChain)return {commands:[{type:"chain-pass",player:"human"}],recognized:true};
 }
 const targeted=planTargetedPlay(text,state,catalog);
 if(targeted){
  if(targeted.error)return targeted;
  try{const preview=applyCommand(state,targeted);
   return {commands:[targeted],recognized:true,summary:preview.message};
  }catch(error){return fail("Action non appliquée : "+error.message,"Action not applied: "+error.message);}
 }
 const destination=text.match(/^(?:je joue|je pose)\s+(.+?)\s+(?:a|au)\s+(.+?)(?:\s+tout epuis.*|\s+pour .*runes?)?$/);
 if(destination){
  const card=findAnnouncedCard(catalog,destination[1]),field=spokenField(state,destination[2]);
  if(card&&field!==null){
   const cmd={type:"play-physical",card,battlefield:field};
   try{return {commands:[cmd],recognized:true,summary:applyCommand(state,cmd).message};}
   catch(error){return fail("Action non appliquée : "+error.message,"Action not applied: "+error.message);}
  }
 }
 const correctedChannel=text.match(/^((?:je )?(?:canalise|channel))\s+.+?\s+(?:euh\s+)?(?:non|pardon)\s+(.+)$/);
 const namedChannel=(correctedChannel?correctedChannel[1]+" "+correctedChannel[2]:text)
  .match(/\b(?:canalise|channel)\s+(.+)$/);
 if(namedChannel){
  const singleDomain=namedChannel[1].match(new RegExp("^"+number+" (?:runes? )?(?:d'|de )?([a-z]+)$"));
  if(singleDomain&&Object.hasOwn(domainNames,singleDomain[2])&&!(num(singleDomain[1])>=1&&num(singleDomain[1])<=3))
   return fail("Indique un nombre de runes canalisées entre un et trois.","Name between one and three channeled runes.");
  const names=singleDomain&&Object.hasOwn(domainNames,singleDomain[2])?
   Array(num(singleDomain[1])).fill(domainNames[singleDomain[2]]):
   namedChannel[1].split(" ").filter(x=>Object.hasOwn(domainNames,x)).map(x=>domainNames[x]);
  if(names.length){
   const unknown=state.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&c.code==="PHYSICAL-RUNE");
   const current=state.turnActions?.channeled||0;
   if(state.active!=="human"||!current||names.length!==current)return fail(
    "Précise les "+current+" domaines des runes canalisées ce tour.","Name the domains of the runes channeled this turn.");
   const latest=state.cards.filter(c=>c.owner==="human"&&c.zone==="runes").slice(-current);
   if(latest.length!==names.length||latest.some((v,i)=>v.code!=="PHYSICAL-RUNE"&&v.domains?.[0]!==names[i]))
    return fail("Les domaines déjà enregistrés ne correspondent pas à l’annonce.","Already recorded rune domains do not match.");
   return {recognized:true,commands:latest.flatMap((v,i)=>unknown.includes(v)?
    [{type:"rune-identify",uid:v.uid,domain:names[i]}]:[])};
  }
 }
 const channel=text.match(new RegExp("\\b(?:pioche|canalise|channel|draw|prends|take)\\s+(?:(?:mes|my|the|les|des|de)\\s+)?"+number+"\\s+runes?\\b"))||
  text.match(new RegExp("\\b(?:canalise|channel)\\s+"+number+"\\b"));
 const draw=text.match(new RegExp("\\b(?:pioche|draw|prends|take)\\s+(?:(?:mes|my|the|les|des|de)\\s+)?"+number+"\\s+(?:cartes?|cards?)\\b"))||
  (/\b(?:pioche|draw)\s+(?:ma|une|la|my|one|a|the)\s+(?:carte|card)\b/.test(text)?["","1"]:null);
 const spend=text.match(new RegExp("\\b(?:exhaust|epuise|tap|spend|utilise|use)\\s+(?:(?:mes|my|les)\\s+)?"+number+"(?:\\s+runes?)?\\b"))||
  text.match(new RegExp("\\b(?:pour|for|avec|with|contre|cout|coute|payer|pay)\\s+"+number+"\\s+runes?\\b"));
 const play=text.match(/\b(?:joue|pose|place|invoque|play|summon|mets)\s+(?:(?:un|une|le|la|mon|ma|my|a|an|the)\s+|l')?([a-z0-9' -]{2,96}?)\s+(?:dans|sur|in|onto|on|to)\s+(?:(?:ma|mon|my|the|la|le)\s+)?(base|champ(?: de bataille)?|battlefield|terrain|field)\b/)||
   text.match(/\b(?:joue|pose|place|invoque|play|summon|mets)\s+(?:(?:un|une|le|la|mon|ma|my|a|an|the)\s+|l')?([a-z0-9' -]{3,90}?)(?=\s+(?:pour|for|avec|with|contre|cout|coute|payer|pay)\s+(?:\d+|un|une|one|two|deux|trois|three|four|quatre)\s+runes?\b|\s+(?:et\s+je|and\s+i|puis\s+je|then\s+i)\b|$)/);
 const endTurn=/\b(?:termine|finis|passe|end|finish|pass)\s+(?:(?:mon|my|le|the)\s+)?(?:tour|turn)\b|\b(?:mon|my)\s+(?:tour|turn)\s+(?:(?:is|est)\s+)?(?:fini|termine|over)\b/.test(text)||
   state.phase==="Main"&&!state.pendingCombat&&!state.spellChain&&/^(?:je passe|i pass)$/.test(text);
 const chosen=/\b(?:je joue|i play) (?:mon |my )?(?:champion choisi|chosen champion)\b/.test(text);
 const recognized=Boolean(channel||draw||spend||play||endTurn||chosen);
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
   if(!preview.turnActions?.channeled&&preview.players.human.runeCount>0)return fail("Commence par canaliser les runes de ton tour.",
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
  if(play||chosen){
   if(play?.[2]&&play[2]!=="base")return fail("Le déplacement direct vers un champ de bataille nécessite une vérification des règles. Précise l'action exacte.",
    "Playing directly onto a battlefield needs rules verification. Clarify the exact action.");
   const champion=chosen?preview.cards.find(c=>c.owner==="human"&&c.zone==="champion"):null;
   if(chosen&&!champion)return fail("Ton champion choisi n'est plus dans sa zone.","Your chosen champion is no longer in its zone.");
   const card=champion||findAnnouncedCard(catalog,play[1]);
   if(!card)return unknownCard(catalog,play[1]);
   if(!/^(unit|gear)$/i.test(card.type||""))
    return fail("Indique la cible du sort dans ton annonce.","Specify the unit targeted by the spell.");
   if(!chosen&&preview.players.human.handCount<=0)
    return fail("Le compte de ta main est à zéro : vérifie-le avant de jouer une carte.",
      "Your hand count is zero. Update it before playing a card.");
   if(preview.phase!=="Main"&&(!preview.turnActions?.channeled||!preview.turnActions?.drawn))
    return fail("Le début de tour n'est pas encore résolu sur le plateau.",
      "The normal start of turn has not been completed on the board.");
   if(card.energy==null||card.energy===""||!Number.isFinite(Number(card.energy))||Number(card.energy)<0)
    return fail("Le coût de "+card.name+" est indisponible : paiement non vérifiable.",
      "The cost of "+card.name+" is missing; payment cannot be verified.");
   const energy=Number(card.energy),ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   const spent=spend?num(spend[1]):energy;
   // Energy is printed on the card: infer payment without making the player
   // announce a number. A spoken number must still be checked against the card.
   if(ready<energy)return fail(
     "Tu ne peux pas encore jouer "+card.name+" : cette carte coûte "+energy+
     " énergies, mais tu n'as que "+ready+" runes prêtes. Aucune carte n'a été posée.",
     "You cannot play "+card.name+" yet: it costs "+energy+
     " energy, but you only have "+ready+" ready rune(s). No card was played.");
    if(!Number.isInteger(spent)||spent!==energy)
     return fail("Pour jouer "+card.name+", il faut épuiser exactement "+energy+" runes, et non "+spent+".",
      "Playing "+card.name+" requires exactly "+energy+" runes, not "+spent+".");
   if(preview.phase!=="Main")add({type:"phase",phase:"Main"});
   add({type:"play-physical",...(champion?{uid:champion.uid}:{card})});
  }else if(spend){
   const count=num(spend[1]),ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   if(!Number.isInteger(count)||count<1||count>ready)
    return fail("Tu n'as pas assez de runes prêtes pour cette dépense.",
     "You don't have enough ready runes to pay that amount.");
   add({type:"exhaust-runes",player:"human",count});
  }
  if(endTurn){
   if(preview.phase!=="Ending")add({type:"phase",phase:"Ending"});
   if(!preview.pendingEffects?.length)add({type:"next-turn"});
  }
  return {commands,recognized:true,summary:commands.length?preview.message:""};
 }catch(error){return fail("Action non appliquée : "+String(error.message||error),
  "Action not applied: "+String(error.message||error));}
}
