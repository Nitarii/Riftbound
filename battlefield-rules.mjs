// Conservative automatic Conquer/Hold scoring for an uncontested Duel field.
// Never resolves combat or card abilities; opposing units block auto-control.
export const DUEL_WIN_SCORE=8;
export function battlefieldController(state,index){
 const owners=new Set((state?.cards||[]).filter(c=>c.zone==="battlefield"&&
  c.battlefield===index&&/unit/i.test(c.type||"")).map(c=>c.owner));
 return owners.size===1?[...owners][0]:null;
}
export function hasScoredField(state,owner,index){
 return Boolean(state?.scoredFields?.[owner]?.includes(index));
}
export function scoreControlledBattlefield(state,owner,index,kind="conquer"){
 if(!["human","ai"].includes(owner)||!Number.isInteger(index)||index<0||
  !state.battlefields?.[index]?.card||battlefieldController(state,index)!==owner)return null;
 state.scoredFields??={human:[],ai:[]};
 state.scoredFields[owner]??=[];
 if(state.scoredFields[owner].includes(index))return null;
 state.scoredFields[owner].push(index);
 const name=state.battlefields[index].card.name;
 const target=state.battlefields.filter(f=>f.card).length||2;
 if(kind==="conquer"&&state.players[owner].score>=DUEL_WIN_SCORE-1&&
  state.scoredFields[owner].length<target){
  if(owner==="human"){
   state.players.human.handCount+=1;
   if(Number.isInteger(state.players.human.deckCount))
    state.players.human.deckCount=Math.max(0,state.players.human.deckCount-1);
  }else{
   const drawn=state.decks.ai.main.shift();
   if(drawn){
    state.cards.push({uid:"c_draw_"+Math.random().toString(36).slice(2),
     owner:"ai",...drawn,zone:"hand",battlefield:null,exhausted:false,
     faceDown:false,counters:{},damage:0});
    state.players.ai.handCount++;
   }
   state.players.ai.deckCount=state.decks.ai.main.length;
  }
  return "Conquête de "+name+" : pioche 1 carte à la place du dernier point (règle de victoire)";
 }
 state.players[owner].score++;
 return (kind==="hold"?"Maintien de ":"Conquête de ")+name+
  " : +1 PV ("+state.players[owner].score+"/"+DUEL_WIN_SCORE+")";
}
export function scoreNewControl(before,after,owner,index){
 const previously=battlefieldController(before,index);
 const now=battlefieldController(after,index);
 if(now!==owner||now===previously)return null;
 return scoreControlledBattlefield(after,owner,index,"conquer");
}
