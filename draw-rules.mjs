// Standard Main Deck draw, including Burn Out (Core Rules §431).
// Runes never belong in the Main Deck. The local AI sees only its own cards.
const usable=c=>c.owner&&c.zone==="trash"&&!/^(rune|battlefield|legend)$/i.test(c.type||"");
function shuffle(deck,rng){
 for(let i=deck.length-1;i>0;i--){
  const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];
 }
 return deck;
}
export function drawMainCards(state,owner,count,{place,deckCard,random=Math.random}={}){
 if(!["ai","human"].includes(owner)||!Number.isInteger(count)||count<1||count>40)
  throw Error("Pioche de Main Deck invalide.");
 if(typeof place!=="function"||typeof deckCard!=="function")
  throw Error("Moteur de pioche non configuré.");
 let actual=0,burnOuts=0;
 state.pendingEffects??=[];
 const other=owner==="human"?"ai":"human";
 const topCount=()=>owner==="ai"?state.decks.ai.main.length:state.players.human.deckCount;
 for(let i=0;i<count;i++){
  // Recycle the trash, then give the opponent a point; retry the draw.
  while(topCount()<=0&&!state.winner){
   const trash=state.cards.filter(c=>c.owner===owner&&usable(c));
   if(owner==="human"&&!trash.length){
    // Hidden physical trash may not be completely registered on this board.
    // Never award repeated points without asking the human to verify it.
    state.pendingEffects.push({
     id:"burnout_"+state.revision+"_"+i,
     sourceUid:"",cardName:"Burn Out",player:"human",trigger:"draw",
     optional:false,text:"Main Deck vide : recycle la défausse, mélange et donne 1 point à l'adversaire.",
     reason:"Le contenu physique du Main Deck/de la défausse doit être confirmé."
    });
    return {actual,burnOuts,paused:true};
   }
   if(trash.length){
    const IDs=new Set(trash.map(c=>c.uid));
    state.cards=state.cards.filter(c=>!IDs.has(c.uid));
    if(owner==="ai"){
     state.decks.ai.main.push(...shuffle(trash.map(deckCard),random));
     state.players.ai.deckCount=state.decks.ai.main.length;
    }else state.players.human.deckCount+=trash.length;
   }
   state.players[other].score++;
   burnOuts++;
   if(state.players[other].score>=8){
    state.winner=other;
    state.finished=true;
    break;
   }
   // Neither deck nor trash has cards: each attempt burns out repeatedly,
   // up to the victory threshold, not an unbounded loop.
  }
  if(state.winner)break;
  if(owner==="ai"){
   const card=state.decks.ai.main.shift();
   if(!card)break;
   place(state,owner,card,"hand",undefined,false,
    "c_burn_draw_"+state.revision+"_"+i+"_"+state.cards.length);
   state.players.ai.handCount++;
   state.players.ai.deckCount=state.decks.ai.main.length;
  }else{
   state.players.human.handCount++;
   state.players.human.deckCount=Math.max(0,state.players.human.deckCount-1);
  }
  actual++;
 }
 return {actual,burnOuts,paused:false};
}
