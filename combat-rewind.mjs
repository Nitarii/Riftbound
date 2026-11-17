export function captureCombatOpening(state){
 const fight=state.pendingCombat;
 if(fight?.kind!=="combat"||!fight.id||fight.focus!=="human"||fight.passes.human||
    state.combatRewindId===fight.id||state.spellChain||state.pendingEffects.length||state.finished)
  return null;
 state.combatRewindId=fight.id;
 return structuredClone(state);
}

export function matchesCombatOpening(opening,state){
 return Boolean(state.combatRewindId&&opening?.pendingCombat?.id===state.combatRewindId&&
  opening.combatRewindId===state.combatRewindId&&opening.pendingCombat.focus==="human"&&
  opening.createdAt===state.createdAt&&opening.turn===state.turn&&opening.active===state.active&&
  Number.isInteger(opening.revision)&&opening.revision<=state.revision&&
  Array.isArray(opening.history)&&Array.isArray(opening.cards)&&opening.decks?.ai&&opening.players?.human&&opening.players?.ai);
}

export function rewindCombat(opening,state,{english=false}={}){
 if(!matchesCombatOpening(opening,state))
  throw Error(english?"No attack to rewind to this turn.":"Aucune ouverture d’attaque à restaurer pendant ce tour.");
 const restored=structuredClone(opening);
 restored.revision=state.revision+1;
 restored.cardSerial=Math.max(opening.cardSerial,state.cardSerial);
 const field=restored.battlefields[restored.pendingCombat.battlefield].card.name;
 restored.message=english?
  "Back to the reaction window at "+field+". Restore the physical board. Revealed cards remain known.":
  "Retour à ta focalisation à "+field+". Remets les cartes physiques dans l’état restauré. Les cartes déjà révélées restent connues.";
 restored.history=[{revision:restored.revision,at:new Date().toISOString(),text:restored.message,
  rewoundTo:opening.revision,abandonedRevision:state.revision},...restored.history].slice(0,120);
 return restored;
}

export function requestsCombatRewind(normalized){
 return /(?:^|[.!]\s+)(?:(?:peux-tu|tu peux) )?rev(?:iens|enir) (?:au moment ou tu m['’]attaqu(?:es|ais)|(?:a|au debut de) l['’]attaque)$/.test(normalized)||
  /(?:^|[.!]\s+)(?:go back|rewind) to (?:when you attacked me|the start of the attack)$/.test(normalized);
}
