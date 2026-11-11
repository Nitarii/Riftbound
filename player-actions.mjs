// Conservative bilingual narration planner for the PHYSICAL player's announced actions.
// It never reads the human hand or guesses an unknown card, payment or effect.
import {applyCommand} from "./core.mjs";

const clean=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").toLowerCase().replace(/\s+/g," ").trim();
const num=s=>({un:1,une:1,one:1,a:1,deux:2,two:2,trois:3,three:3,quatre:4,four:4}[s]||Number(s));
const number="(\\d+|un|une|one|two|deux|trois|three|four|quatre)";
const announceError=(fr,en)=>({commands:[],error:fr,errorEN:en});
const unknownCard=name=>announceError(
  "Je ne retrouve pas « "+name+" » dans le catalogue. Vérifie son nom ou actualise les cartes avant de la placer.",
  "I cannot find “"+name+"” in the card catalog. Check its name or refresh the catalog before playing it."
);
function expectedChannel(state){
 const first=state.firstPlayer||((state.history||[]).find(h=>/Début de partie/.test(h.text||""))?.text?.includes("IA")?"ai":"human");
 const firstAction=!state.turnActions?.channeled;
 return state.turn===1&&firstAction&&state.active!==first?3:2;
}
export function findAnnouncedCard(catalog,name){
 const query=clean(name).replace(/^(un|une|a|an|the|my|mon|ma|le|la)\s+/,"").trim();
 if(!query)return null;
 const entries=(catalog||[]).filter(c=>c&&c.name&&c.code&&!c.isVariant);
 const exact=entries.filter(c=>clean(c.name)===query||clean(c.code)===query);
 const found=exact.length?exact:query.length>=4?entries.filter(c=>clean(c.name).includes(query)):[];
 const names=[...new Set(found.map(c=>clean(c.name)))];
 if(names.length!==1)return null;
 // Prefer standard printings and preserve the normalized catalog card metadata.
 return found[0]||null;
}
export function planHumanAnnouncement(message,startingState,catalog=[]){
 const text=clean(message).slice(0,1200);
 const state=startingState;
 if(!text||!state?.started)return {commands:[],recognized:false};
 const channel=text.match(new RegExp("(?:pioche|canalise|canaliser|channel|draw)\\s+(?:mes\\s+|my\\s+|the\\s+)?"+number+"\\s+runes?\\b"));
 const draw=text.match(new RegExp("(?:pioche|piocher|draw)\\s+(?:une?\\s+|my\\s+|the\\s+)?"+number+"\\s+(?:cartes?|cards?)\\b"))||
   (/\b(?:je pioche ma carte|i draw a card)\b/.test(text)?["", "1"]:null);
 const spend=text.match(new RegExp("(?:exhaust|exhauste|epuise|incline|tap|spend|j'en exhaust|j'en epuise)\\s+"+number+"\\s+runes?\\b"))||
   text.match(new RegExp("(?:j'en\\s+)?(?:exhaust|exhauste|epuise|tap|spend)\\s+"+number+"(?=\\s+(?:pour|to)\\s+(?:jouer|play))"));
 const play=text.match(/\b(?:joue|jouer|poser?|place|invoque|play|summon)\s+(?:un|une|le|la|l'|a|an|the|my)?\s*([a-z0-9' -]{2,90}?)(?=\s+(?:dans|sur|in|onto|to)\s+(?:(?:ma|mon|my|the|la|le)\s+)?(?:base|champ|battlefield)\b)/);
 const endTurn=/(?:\b(?:je\s+)?(?:passe|termine|finis)\s+(?:mon\s+)?tour\b|\b(?:i\s+)?(?:end|finish|pass)\s+(?:my\s+)?turn\b)/.test(text);
 const recognized=Boolean(channel||draw||spend||play||endTurn);
 if(!recognized)return {commands:[],recognized:false};
 if(state.active!=="human")return announceError("Ce n'est pas ton tour : j'attends que l'IA termine le sien.",
  "It is not your turn. Please wait for the AI to finish.");
 const commands=[];
 let preview=state;
 const add=c=>{preview=applyCommand(preview,c);commands.push(c);};
 try{
  if(channel){
   const count=num(channel[1]),expected=expectedChannel(preview);
   if(!Number.isInteger(count)||count!==expected)
    return announceError("Tu dois canaliser "+expected+" runes pendant cette phase"+
     (state.turn===1?" (le joueur qui commence en reçoit 2, le second 3).":"."),
     "You must channel "+expected+" runes this turn"+
     (state.turn===1?" (first player: 2; second player: 3).":"."));
   if(preview.turnActions?.channeled)return announceError("Les runes de ce tour ont déjà été canalisées.",
      "You already channeled your runes this turn.");
   if(preview.players.human.runeCount<count)return announceError("Il ne reste pas assez de runes dans ton deck.",
      "Not enough runes remain in your rune deck.");
   add({type:"phase",phase:"Channel"});
   add({type:"channel",player:"human",count});
  }
  if(draw){
   if(!preview.turnActions?.channeled&&!channel)return announceError("Commence par canaliser les runes de ton tour.","Channel your turn's runes before drawing.");
   const count=num(draw[1]);
   if(count!==1)return announceError("Sans effet de carte annoncé, tu dois piocher 1 carte pendant la phase Draw.",
       "Without a stated card effect, draw 1 card during the Draw phase.");
   if(preview.turnActions?.drawn)return announceError("Tu as déjà effectué ta pioche normale de ce tour.",
      "You already made the standard draw this turn.");
   add({type:"phase",phase:"Draw"});
   add({type:"draw",player:"human",count:1});
  }
  if(play){
   const card=findAnnouncedCard(catalog,play[1]);
   if(!card)return unknownCard(play[1]);
   if(!/unit|unite|unité/i.test(card.type||""))
    return announceError("Cette carte n'est pas une unité jouable en base. Vérifions sa zone et son effet.",
       "This is not a unit that can be played to your base. Check its zone and effect.");
   if(preview.players.human.handCount<=0)
    return announceError("Tu n'as aucune carte indiquée en main. Mets d'abord le compte de main à jour.",
      "Your tracked hand is empty. Update your hand count first.");
   if(preview.turnActions?.channeled===0&&!channel)
    return announceError("Annonce d'abord les runes canalisées pour ce tour.",
      "Please announce your rune channeling before playing a card.");
   if(preview.turnActions?.drawn===0&&!draw)
    return announceError("Tu dois d'abord annoncer la pioche normale d'une carte avant ta phase Main.",
      "Please announce the standard card draw before your Main phase.");
   const energy=Number(card.energy);
   if(!Number.isFinite(energy)||energy<0)
    return announceError("Le coût de "+card.name+" est indisponible : je ne peux pas valider son paiement.",
       "The cost of "+card.name+" is missing, so I cannot validate its payment.");
   const ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   const spent=spend?num(spend[1]):0;
   if(energy>0&&!spend)return announceError("Précise combien de runes tu épuises pour jouer "+card.name+".",
        "Say how many runes you exhaust to play "+card.name+".");
   if(spend&&(!Number.isInteger(spent)||spent<energy||spent>ready))
    return announceError("Coût invalide pour "+card.name+" : "+energy+" énergie, "+ready+
       " runes prêtes et "+spent+" annoncées.",
       "Invalid payment for "+card.name+": "+energy+" energy, "+ready+" ready runes, "+spent+" announced.");
   if(spend&&spent>0)add({type:"exhaust-runes",player:"human",count:spent});
   add({type:"phase",phase:"Main"});
   add({type:"add",player:"human",card,zone:"base",fromHand:true});
  }else if(spend){
   const count=num(spend[1]);
   const ready=preview.cards.filter(c=>c.owner==="human"&&c.zone==="runes"&&!c.exhausted).length;
   if(!Number.isInteger(count)||count<1||count>ready)
    return announceError("Tu n'as pas assez de runes prêtes pour cet épuisement.",
       "You do not have enough ready runes.");
   add({type:"exhaust-runes",player:"human",count});
  }
  if(endTurn){
   add({type:"phase",phase:"Ending"});
   add({type:"next-turn"});
  }
  return {commands,recognized:true,summary:commands.length?preview.message:""};
 }catch(e){return announceError("Je ne peux pas appliquer cette annonce : "+String(e.message||e),
      "I cannot apply that announcement: "+String(e.message||e));}
}
