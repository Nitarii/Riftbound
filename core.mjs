// Shared board state; automatic scoring only for uncontested fields, never card effects.
import {battlefieldController,scoreControlledBattlefield,scoreNewControl} from "./battlefield-rules.mjs";
import {planRunePayment} from "./rune-payment.mjs";
import {mandatoryPlayEffects} from "./play-effects.mjs";
import {processCardEvent} from "./effect-runtime.mjs";
import {previewCombat,battleParties,combatWarnings,applyCombatResult, effectiveMight,OPPOSITE} from "./combat-engine.mjs";
// Both the browser and the optional local relay use this exact reducer.
const ZONES = new Set(["legend","champion","hand","deck","base","battlefield","trash","banished","runes","rune-deck","rune-trash"]);
const OWNERS = new Set(["human","ai"]);
export const VERSION = 1;
export const PHASES = ["Awaken","Beginning","Channel","Draw","Main","Ending"];
const cp = x => JSON.parse(JSON.stringify(x));
function shuffle(a) {
  // Fisher-Yates: the chosen champion is removed before drawing the opening hand.
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
const player = () => ({legend:null,champion:null,score:0,handCount:4,deckCount:35,runeCount:12,notes:""});
export function createState() {
  return {version:VERSION,revision:0,createdAt:new Date().toISOString(),turn:1,active:"human",firstPlayer:"human",turnActions:{channeled:0,drawn:0},pendingCombat:null,pendingEffects:[],effectMarks:[],scoredFields:{human:[],ai:[]},phase:"Setup",started:false,
    players:{human:player(),ai:player()},
    battlefields:[{owner:"human",card:null},{owner:"ai",card:null}],
    cards:[], decks:{ai:{main:[],runes:[],battlefields:[]}}, history:[], message:"Nouvelle table. Choisis ta légende et ton champion."};
}
function id() {
  return "c_" + Math.random().toString(36).slice(2,10) + "_" + Date.now().toString(36);
}
function checkOwner(p) {if (!OWNERS.has(p)) throw Error("player doit être human ou ai");}
function string(x,max=500) {if(typeof x!=="string"||!x.trim()||x.length>max)throw Error("Chaîne obligatoire (max "+max+")");return x.trim();}
export function validateCard(card) {
  if(!card||typeof card!=="object") throw Error("Carte invalide");
  const name=string(card.name,160);
  return {code:String(card.code||"").slice(0,100),name,type:String(card.type||"Unit").slice(0,40),
    image:/^https:\/\/[a-z0-9.-]+\//i.test(card.image||"")?card.image:"",
    imageFallback:/^https:\/\/[a-z0-9.-]+\//i.test(card.imageFallback||"")?card.imageFallback:"",domains:Array.isArray(card.domains)?card.domains.slice(0,3).map(String):[],
    text:String(card.text||"").slice(0,2500),energy:card.energy==null||card.energy===""?null:Number.isFinite(+card.energy)?+card.energy:null,
    power:card.power==null||card.power===""?null:Number.isFinite(+card.power)?+card.power:null,might:card.might==null||card.might===""?null:Number.isFinite(+card.might)?+card.might:null,
    tags:Array.isArray(card.tags)?card.tags.slice(0,12).map(String):[]};
}
function place(state, p, c, zone, battlefield, faceDown, stableUid=null) {
  if(!ZONES.has(zone)) throw Error("Zone inconnue");
  const instance={uid:stableUid||id(),owner:p,...validateCard(c),zone,battlefield:zone==="battlefield"?Math.max(0,Math.min(1,Number(battlefield)||0)):null,
    exhausted:false,faceDown:!!faceDown,counters:{},damage:0};
  state.cards.push(instance);return instance;
}
function getCard(s,uid) {const c=s.cards.find(c=>c.uid===uid);if(!c)throw Error("Carte absente : "+uid);return c;}
function maybeRecord(s,summary) {
  s.revision=(s.revision||0)+1;
  s.message=summary;
  s.history.unshift({revision:s.revision,at:new Date().toISOString(),text:summary});
  s.history=s.history.slice(0,120);
}
function deckCard(c) {return validateCard(c);}
function entersNaturallyReady(card){
 const text=String(card?.text||"").replace(/^\[Accelerate\][^\n]*/gim,"");
 return /\benters? (?:the board )?ready\b/i.test(text);
}

export function applyCommand(old, command) {
  if(!command||typeof command!=="object"||Array.isArray(command)) throw Error("Commande JSON attendue");
  const s=cp(old||createState()), c=command, type=string(c.type,40);
  s.pendingEffects??=[];s.effectMarks??=[];
  if(s.pendingEffects.length&&["next-turn","play-paid","combat-attack"].includes(type))
   throw Error("Effet de carte en attente : résous-le avant de poursuivre la partie.");
  const p=c.player||"ai";
  let summary="";
  if(s.pendingCombat&&["next-turn","phase","play-paid","combat-attack"].includes(type)&&
    type!=="combat-attack")throw Error("Combat en cours : résous les réactions et les dégâts avant de poursuivre.");
  if(s.pendingCombat&&type==="combat-attack")throw Error("Un combat est déjà en cours.");
  const participants=index=>s.cards.filter(v=>v.zone==="battlefield"&&v.battlefield===index&&
    /^unit$/i.test(v.type||""));
  function beginCombat(field,attacker,arriving=[]){
    if(s.pendingCombat)return;
    const opponents=participants(field).filter(u=>u.owner===OPPOSITE[attacker]);
    if(!opponents.length)return;
    const prev=old.cards.filter(v=>v.zone==="battlefield"&&v.battlefield===field&&
      /^unit$/i.test(v.type||""));
    const prevOwners=[...new Set(prev.map(v=>v.owner))];
    const previousController=prevOwners.length===1?prevOwners[0]:null;
    s.pendingCombat={battlefield:field,attacker,defender:OPPOSITE[attacker],
      previousController,passes:{human:false,ai:true},orders:{human:[],ai:[]},
      confirmedEffects:false,initiators:arriving,
      warnings:[],createdAt:new Date().toISOString()};
    const party=battleParties(s,field,attacker);
    s.pendingCombat.warnings=combatWarnings(s,field,party.attackers,party.defenders);
  }
  function settleCombat(){
    const fight=s.pendingCombat;
    if(!fight||!fight.passes.human||!fight.passes.ai)
      throw Error("Attends que les deux joueurs aient passé leur fenêtre de réactions.");
    if(fight.warnings.length&&!fight.confirmedEffects)
      throw Error("Effets de cartes à vérifier : confirme leur résolution avant le calcul.");
    const preview=previewCombat(s,fight.battlefield,fight.attacker,fight.orders);
    if(!preview.ready)throw Error(preview.error);
    const dying=preview.dead.map(uid=>s.cards.find(c=>c.uid===uid)).filter(Boolean);
    const outcome=applyCombatResult(s,preview,{previousController:fight.previousController});
    const triggered=[];
    for(const unit of dying)
      triggered.push(...processCardEvent(s,{trigger:"die",actor:unit.owner,source:unit},{place,deckCard}));
    const resolved=outcome.controller;
    let scoring="";
    if(resolved&&resolved!==outcome.previousController){
      scoring=scoreControlledBattlefield(s,resolved,fight.battlefield,"conquer")||"";
      if(scoring)triggered.push(...processCardEvent(s,{
       trigger:"conquer",actor:resolved,field:fight.battlefield},{place,deckCard}));
    }
    summary="Combat "+s.battlefields[fight.battlefield].card.name+": "+
      preview.attackingMight+" Might attaque / "+preview.defendingMight+
      " Might défense · "+outcome.dead.length+" unités vaincues"+
      (outcome.recalled?" · "+outcome.recalled+" attaquant(s) rappelés":"")+
      (scoring?" · "+scoring:"")+
      (triggered.length?" · "+triggered.join(" · "):"")+
      (s.pendingEffects?.length?" · Effet(s) en attente":"");
  }
  if(type==="reset") {
    const fresh=createState();fresh.revision=(old?.revision||0)+1;
    fresh.history=[{revision:fresh.revision,at:new Date().toISOString(),text:"Partie réinitialisée"}];
    return fresh;
  }
  if(type==="setup-human"||type==="setup-ai") {
    const who=type==="setup-human"?"human":"ai";
    if(!c.legend||!c.champion||!c.battlefield) throw Error("legend, champion et battlefield requis");
    s.players[who].legend=validateCard(c.legend);
    s.players[who].champion=validateCard(c.champion);
    if(who==="human"){s.players.human.deckCount=35;s.players.human.handCount=4;s.players.human.runeCount=12;}
    s.battlefields[who==="human"?0:1].card=validateCard(c.battlefield);
    s.cards=s.cards.filter(v=>!(v.owner===who && (v.zone==="legend"||v.zone==="champion")));
    place(s,who,c.legend,"legend");
    place(s,who,c.champion,"champion");
    if(who==="ai") {
      if(!Array.isArray(c.main)||!Array.isArray(c.runes)) throw Error("Deck IA : main[] et runes[] requis");
      if(c.main.length>150||c.runes.length>36)throw Error("Deck trop grand");
      if(c.format==="preconstructed"&&(c.main.length!==40||c.runes.length!==12||!Array.isArray(c.battlefields)||c.battlefields.length!==3)){
        throw Error("Deck préconstruit : 40 cartes (champion inclus), 12 runes et 3 battlefields attendus");
      }
      s.decks.ai.main=c.main.map(deckCard);
      // The chosen champion is one of the 40 main-deck cards, but starts in champion zone.
      if(c.mainIncludesChampion!==false) {
        const index=s.decks.ai.main.findIndex(v=>(c.champion.code&&v.code===c.champion.code)||
          (v.name.toLowerCase()===c.champion.name.toLowerCase()));
        if(index<0){if(c.format==="preconstructed")throw Error("Champion absent des 40 cartes");}
        else s.decks.ai.main.splice(index,1);
      }
      shuffle(s.decks.ai.main);
      s.decks.ai.runes=shuffle(c.runes.map(deckCard));
      s.players.ai.deckName=typeof c.deckName==="string"?c.deckName.slice(0,100):"";
      s.decks.ai.battlefields=Array.isArray(c.battlefields)?c.battlefields.slice(0,3).map(deckCard):[validateCard(c.battlefield)];
      s.cards=s.cards.filter(v=>v.owner!=="ai"||["legend","champion"].includes(v.zone));
      s.players.ai.handCount=0;
      s.players.ai.deckCount=s.decks.ai.main.length;
      s.players.ai.runeCount=s.decks.ai.runes.length;
      for(let i=0;i<4;i++) {
        if(!s.decks.ai.main.length)break;
        place(s,"ai",s.decks.ai.main.shift(),"hand");
        s.players.ai.handCount++;
        s.players.ai.deckCount--;
      }
    }
    summary=(who==="ai"?"IA":"Joueur")+" : "+s.players[who].legend.name+" / "+s.players[who].champion.name;
  } else if(type==="start") {
    checkOwner(p);s.active=p;s.firstPlayer=p;s.turnActions={channeled:0,drawn:0};s.scoredFields={human:[],ai:[]};s.phase="Awaken";s.turn=1;s.started=true;
    summary="Début de partie. Premier joueur : "+(p==="ai"?"IA":"joueur");
  } else if(type==="next-turn") {
    // End-of-turn cleanup: marked damage heals and stun / temporary buffs expire.
    for(const unit of s.cards)if(/^unit$/i.test(unit.type||"")){
      unit.damage=0;unit.stunned=false;
      if(unit.counters){delete unit.counters.stunned;delete unit.counters.tempMight;delete unit.counters.mightThisTurn;}
    }
    s.active=s.active==="human"?"ai":"human";
    if(s.active===(s.firstPlayer||"human"))s.turn++;
    s.turnActions={channeled:0,drawn:0};
    s.scoredFields??={human:[],ai:[]};
    s.scoredFields[s.active]=[];
    // Awaken precedes Beginning. Ready the active player's cards, then
    // automatically mark obvious uncontested Hold scores; card effects stay manual.
    for(const card of s.cards)if(card.owner===s.active)card.exhausted=false;
    s.phase="Beginning";s.started=true;
    const holds=[];
    for(let i=0;i<s.battlefields.length;i++){
      if(battlefieldController(s,i)===s.active){
        const scored=scoreControlledBattlefield(s,s.active,i,"hold");
        if(scored)holds.push(scored);
      }
    }
    summary="Tour "+s.turn+" : "+(s.active==="human"?"joueur":"IA")+
     (holds.length?". "+holds.join(" · "):". Beginning résolu, phases restantes à jouer.");
    const triggered=processCardEvent(s,{trigger:"beginning",actor:s.active},{place,deckCard});
    for(let i=0;i<s.battlefields.length;i++)if(battlefieldController(s,i)===s.active)
     triggered.push(...processCardEvent(s,{trigger:"hold",actor:s.active,field:i},{place,deckCard}));
    if(triggered.length)summary+=" · "+triggered.join(" · ");
    if(s.pendingEffects.length)summary+=" · "+s.pendingEffects.length+" effet(s) en attente";
  } else if(type==="phase") {
    const phase=string(c.phase,30);
    if(!PHASES.includes(phase))throw Error("Phase inconnue");
    const entering=phase!==s.phase;
    s.phase=phase;summary="Phase "+phase;
    if(entering&&phase==="Ending"){
     const triggered=processCardEvent(s,{trigger:"ending",actor:s.active},{place,deckCard});
     if(triggered.length)summary+=" · "+triggered.join(" · ");
     if(s.pendingEffects.length)summary+=" · "+s.pendingEffects.length+" effet(s) en attente";
    }
  } else if(type==="add") {
    checkOwner(p);const v=place(s,p,c.card,c.zone||"base",c.battlefield,c.faceDown);
    // Standard units are played exhausted, unless their card text explicitly says otherwise.
    if(c.fromHand&&/unit/i.test(v.type||"")&&["base","battlefield"].includes(v.zone))
      v.exhausted=!entersNaturallyReady(v);
    if(v.zone==="hand")s.players[p].handCount++;
    if(p==="human"&&c.fromHand&&v.zone!=="hand")s.players.human.handCount=Math.max(0,s.players.human.handCount-1);
    summary=(p==="ai"?"IA":"Joueur")+" : "+v.name+" → "+v.zone;
    if(c.fromHand&&["base","battlefield"].includes(v.zone)){
     const triggered=processCardEvent(s,{trigger:"play",actor:p,source:v},{place,deckCard});
     if(!s.pendingEffects.length)
      triggered.push(...processCardEvent(s,{trigger:"ally-play",actor:p,source:v},{place,deckCard}));
     if(triggered.length)summary+=" · "+triggered.join(" · ");
    }
  } else if(type==="play-paid") {
    // One atomic, auditable payment+play, used by the AI. The full energy AND
    // matching domain Power cost are checked before mutating any card.
    if(!s.started||s.active!=="ai"||s.phase!=="Main")
      throw Error("Jouer une carte payée nécessite la phase Main de l'IA.");
    const v=getCard(s,string(c.uid,80));
    if(v.owner!=="ai"||!["hand","champion"].includes(v.zone)||
       !["unit","gear","spell"].includes(String(v.type||"").toLowerCase()))
     throw Error("La carte ne peut pas être jouée depuis cette zone.");
    const onPlay=mandatoryPlayEffects(v);
    const discardUids=Array.isArray(c.discardUids)?c.discardUids:[];
    // Preflight card text before paying the runes. For unfamiliar abilities
    // the card is playable, but its trigger becomes an unresolved chain item.
    if(discardUids.length!==onPlay.discard||new Set(discardUids).size!==discardUids.length)
     throw Error(v.name+" : défausse obligatoire de "+onPlay.discard+" carte(s) non choisie.");
    const discardCards=discardUids.map(uid=>getCard(s,string(uid,80)));
    if(discardCards.some(x=>x.owner!=="ai"||x.zone!=="hand"||x.uid===v.uid))
     throw Error("La défausse obligatoire doit venir de la main de l'IA.");
    const isSpell=String(v.type).toLowerCase()==="spell";
    const isGear=String(v.type).toLowerCase()==="gear";
    const dest=isSpell?"trash":c.zone||"base";
    if(!isSpell&&dest!=="base"&&dest!=="battlefield")throw Error("Lieu de jeu invalide.");
    const field=Number(c.battlefield);
    if(dest==="battlefield"&&(isGear||!Number.isInteger(field)||field<0||
      field>=s.battlefields.length||battlefieldController(s,field)!=="ai"))
     throw Error("L’IA ne peut jouer cette carte que sur un champ de bataille déjà contrôlé.");
    const accelerate=Boolean(c.accelerate);
    if(accelerate&&(!/^unit$/i.test(v.type||"")||!/\baccelerate\b/i.test(v.text||"")))
     throw Error("Accelerate n'est pas disponible sur cette unité.");
    const cost=accelerate?{...v,energy:Number(v.energy||0)+1,
      power:Number(v.power||0)+1}:v;
    const paid=planRunePayment(s,"ai",cost);
    if(paid.error)throw Error(paid.error);
    for(const uid of paid.exhaustUids)getCard(s,uid).exhausted=true;
    const removed=new Set(paid.recycleUids);
    for(const uid of paid.recycleUids){
      const rune=getCard(s,uid);
      s.decks.ai.runes.push(deckCard(rune));
    }
    s.cards=s.cards.filter(card=>!removed.has(card.uid));
    s.players.ai.runeCount=s.decks.ai.runes.length;
    if(v.zone==="hand")s.players.ai.handCount--;
    v.zone=dest;v.battlefield=dest==="battlefield"?field:null;
    v.exhausted=isSpell||isGear||accelerate?false:
      !entersNaturallyReady(v);
    if(!accelerate&&!isGear&&!isSpell&&/\baccelerate\b/i.test(v.text||""))v.exhausted=true;
    const triggered=processCardEvent(s,{trigger:"play",actor:"ai",source:v,
     choices:{discardUids}},{place,deckCard});
    if(!s.pendingEffects.length)
     triggered.push(...processCardEvent(s,{trigger:"ally-play",actor:"ai",source:v},{place,deckCard}));
    summary="IA : "+v.name+" jouée "+(dest==="base"?"en base":dest==="trash"?"comme sort":"sur "+s.battlefields[field].card.name)+
     " · "+paid.energy+" énergie ("+paid.exhaustUids.length+" rune(s) épuisée(s))"+
     " · "+paid.power+" Power ("+paid.recycleUids.length+" rune(s) recyclée(s) : "+
     paid.domains.join("/")+")"+(accelerate?" · Accelerate payé":"")+
     (discardCards.length?" · effet : défaussé "+discardCards.map(x=>x.name).join(", "):"")+
     (triggered.length?" · "+triggered.join(" · "):"")+
     (s.pendingEffects.length?" · Effet en attente : "+s.pendingEffects[0].cardName:"");
  } else if(type==="effect-confirm") {
    const pending=s.pendingEffects[0];
    if(!pending)throw Error("Aucun effet de carte en attente.");
    if(!c.confirm||c.id!==pending.id)
     throw Error("Confirme explicitement l'effet affiché avant de reprendre la partie.");
    s.pendingEffects.shift();
    summary="Effet résolu physiquement : "+pending.cardName+" — "+pending.text;
  } else if(type==="combat-attack") {
    if(!s.started||s.phase!=="Main"||s.active!==p)throw Error("L'assaut standard exige ta phase Main.");
    checkOwner(p);
    const field=Number(c.battlefield);
    if(!Number.isInteger(field)||field<0||field>=s.battlefields.length||
      !s.battlefields[field]?.card)throw Error("Champ de bataille non reconnu.");
    const ids=Array.isArray(c.uids)?c.uids:[];
    if(!ids.length||ids.length>24||new Set(ids).size!==ids.length)
      throw Error("Sélectionne une ou plusieurs unités distinctes pour l'assaut.");
    const attacking=ids.map(uid=>getCard(s,string(uid,80)));
    for(const v of attacking){
      if(v.owner!==p||v.zone!=="base"||v.exhausted||!/^unit$/i.test(v.type||""))
        throw Error(v.name+" : seule une unité prête dans ta base peut attaquer normalement.");
    }
    for(const v of attacking){v.exhausted=true;v.zone="battlefield";v.battlefield=field;}
    beginCombat(field,p,ids);
    summary="Assaut "+(p==="ai"?"IA":"joueur")+" : "+attacking.map(v=>v.name).join(", ")+
      " → "+s.battlefields[field].card.name+
      (s.pendingCombat?" · fenêtre de réactions ouverte":" · conquête du champ libre");
  } else if(type==="combat-pass") {
    const combat=s.pendingCombat;
    if(!combat)throw Error("Aucun combat en cours.");
    checkOwner(p);
    if(combat.passes[p])throw Error("Ce joueur a déjà passé la fenêtre de réactions.");
    combat.passes[p]=true;
    summary=(p==="ai"?"IA":"Joueur")+" passe sa réaction.";
    if(combat.passes.human&&combat.passes.ai){
      if(combat.warnings.length&&!combat.confirmedEffects)
        summary+=" Vérifie les effets signalés, puis confirme leur résolution.";
      else settleCombat();
    }
  } else if(type==="combat-order") {
    const combat=s.pendingCombat;
    if(!combat)throw Error("Aucun combat en cours.");
    checkOwner(p);
    const valid=participants(combat.battlefield).filter(v=>v.owner!==p).map(v=>v.uid);
    if(!Array.isArray(c.uids)||c.uids.length!==valid.length||
       new Set(c.uids).size!==valid.length||!c.uids.every(uid=>valid.includes(uid)))
      throw Error("L'ordre d'attribution doit contenir exactement les unités adverses.");
    combat.orders[p]=[...c.uids];summary="Ordre des dégâts de "+p+" modifié.";
  } else if(type==="combat-confirm-effects") {
    if(!s.pendingCombat)throw Error("Aucun combat en cours.");
    if(!c.confirm)throw Error("Confirmation explicite requise pour les effets de cartes.");
    s.pendingCombat.confirmedEffects=true;
    summary="Effets de combat confirmés comme résolus par le joueur physique.";
    if(s.pendingCombat.passes.human&&s.pendingCombat.passes.ai)settleCombat();
  } else if(type==="combat-resolve") {
    settleCombat();
  } else if(type==="stun") {
    const v=getCard(s,string(c.uid,80));
    if(!/^unit$/i.test(v.type||"")||!["base","battlefield"].includes(v.zone))
      throw Error("Seule une unité sur le plateau peut être étourdie.");
    if(v.stunned&&!c.clear)throw Error("Cette unité est déjà étourdie.");
    v.stunned=!c.clear;summary=v.name+" : "+(v.stunned?"étourdie":"étourdissement dissipé");
  } else if(type==="heal") {
    const v=getCard(s,string(c.uid,80));
    if(!/^unit$/i.test(v.type||""))throw Error("Seule une unité peut être soignée.");
    const n=c.all?Math.max(0,v.damage):Number(c.value);
    if(!Number.isInteger(n)||n<0||n>999)throw Error("Valeur de soin invalide.");
    v.damage=Math.max(0,(v.damage||0)-n);
    summary=v.name+" : "+n+" dégât(s) soignés";
  } else if(type==="move") {
    const v=getCard(s,string(c.uid,80)),zone=string(c.zone,40);
    if(!ZONES.has(zone))throw Error("Zone inconnue");
    const origin=v.zone;
    if(s.pendingCombat&&origin==="base"&&zone==="battlefield"&&!c.effect)
      throw Error("Déplacement normal impossible pendant une confrontation.");
    if(origin==="base"&&zone==="battlefield"&&v.exhausted&&/unit/i.test(v.type||""))
      throw Error("Cette unité est épuisée : elle ne peut pas se déplacer normalement.");
    if(v.zone==="hand")s.players[v.owner].handCount=Math.max(0,s.players[v.owner].handCount-1);
    if(zone==="hand")s.players[v.owner].handCount++;
    v.zone=zone;v.battlefield=zone==="battlefield"?Math.max(0,Math.min(1,Number(c.battlefield)||0)):null;
    if(/unit/i.test(v.type||"")&&["base","battlefield"].includes(zone)){
      if(["hand","champion"].includes(origin))
        v.exhausted=!/\baccelerate\b|enters? (?:the board )?ready/i.test(v.text||"");
      else if(origin==="base"&&zone==="battlefield")v.exhausted=true;
    }
    if(typeof c.faceDown==="boolean")v.faceDown=c.faceDown;
    summary=v.name+" → "+(zone==="battlefield"?"champ de bataille "+(v.battlefield+1):zone);
    if(origin==="base"&&zone==="battlefield"&&v.owner===s.active)
      beginCombat(v.battlefield,v.owner,[v.uid]);
    if(zone!==origin){
      const triggered=processCardEvent(s,{trigger:"move",actor:v.owner,source:v},{place,deckCard});
      if(triggered.length)summary+=" · "+triggered.join(" · ");
    }
  } else if(type==="remove") {
    const v=getCard(s,string(c.uid,80));
    s.cards=s.cards.filter(x=>x.uid!==v.uid);
    if(v.zone==="hand")s.players[v.owner].handCount=Math.max(0,s.players[v.owner].handCount-1);
    summary=v.name+" retirée de la table";
  } else if(type==="exhaust"||type==="ready") {
    if(c.uid){const v=getCard(s,string(c.uid,80));v.exhausted=type==="exhaust";summary=v.name+" : "+(v.exhausted?"épuisée":"redressée");}
    else{checkOwner(p);const affected=s.cards.filter(v=>v.owner===p);for(const v of affected)v.exhausted=type==="exhaust";summary=(p==="ai"?"IA":"Joueur")+" : "+type+" toutes ses cartes";}
  } else if(type==="exhaust-runes") {
    checkOwner(p);const count=Number(c.count);
    const ready=s.cards.filter(v=>v.owner===p&&v.zone==="runes"&&!v.exhausted);
    if(!Number.isInteger(count)||count<1||ready.length<count)throw Error("Pas assez de runes prêtes / Not enough ready runes");
    ready.slice(0,count).forEach(v=>v.exhausted=true);
    summary=(p==="human"?"Joueur":"IA")+" : "+count+" runes épuisées";
  } else if(type==="flip") {
    const v=getCard(s,string(c.uid,80));v.faceDown=!v.faceDown;summary=v.name+" retournée";
  } else if(type==="counter"||type==="damage") {
    const v=getCard(s,string(c.uid,80));
    const value=Number(c.value);
    if(!Number.isInteger(value)||value < -999||value>999)throw Error("Valeur entière entre -999 et 999");
    if(type==="damage"){
      v.damage=Math.max(0,(c.set?0:v.damage)+value);
      if(/^unit$/i.test(v.type||"")&&v.damage>0){
        const role=s.pendingCombat&&v.battlefield===s.pendingCombat.battlefield?
          (v.owner===s.pendingCombat.attacker?"attack":"defend"):"none";
        const might=effectiveMight(v,role);
        if(might!==null&&v.damage>=might){
          v.zone="trash";v.battlefield=null;v.exhausted=false;v.damage=0;
          summary=v.name+" vaincue par les dégâts.";
          const triggered=processCardEvent(s,{trigger:"die",actor:v.owner,source:v},{place,deckCard});
          if(triggered.length)summary+=" · "+triggered.join(" · ");
        }
      }
    }
    else{const key=string(c.key||"bonus",32);v.counters[key]=Math.max(-999,Math.min(999,(c.set?0:Number(v.counters[key]||0))+value));}
    if(!summary)summary=v.name+" : "+type+" "+value;
  } else if(type==="score") {
    checkOwner(p);const n=Number(c.value);
    if(!Number.isInteger(n)||Math.abs(n)>100)throw Error("Score invalide");
    s.players[p].score=Math.max(0,c.set?n:s.players[p].score+n);
    summary=(p==="ai"?"IA":"Joueur")+" : "+s.players[p].score+" points";
  } else if(type==="hand-count") {
    checkOwner(p);const count=Number(c.value);
    if(!Number.isInteger(count)||count<0||count>100)throw Error("Compte main invalide");
    s.players[p].handCount=count;summary="Main "+p+" : "+count;
  } else if(type==="draw"||type==="channel") {
    checkOwner(p);const n=Math.max(1,Math.min(12,Number(c.count)||1));
    if(s.started&&p===s.active){
      if(type==="channel")s.turnActions={...s.turnActions,channeled:(s.turnActions?.channeled||0)+n};
      else s.turnActions={...s.turnActions,drawn:(s.turnActions?.drawn||0)+n};
    }
    const stock=type==="draw"?"main":"runes",dst=type==="draw"?"hand":"runes";
    if(p==="ai"){
      for(let i=0;i<n;i++){
        const card=s.decks.ai[stock].shift();if(!card)break;
        // The preview planner and committed reducer MUST agree on generated
        // UIDs. Stable IDs prevent a later paid play referencing an unknown
        // card drawn/channelled earlier in the same atomic batch.
        const stableUid="c_auto_"+p+"_"+type+"_"+s.revision+"_"+i;
        place(s,p,card,dst,undefined,false,stableUid);
        if(dst==="hand")s.players.ai.handCount++;
      }
      s.players.ai.deckCount=s.decks.ai.main.length;
      s.players.ai.runeCount=s.decks.ai.runes.length;
    } else if(type==="draw"){
      s.players.human.handCount+=n;
      if(Number.isInteger(s.players.human.deckCount))s.players.human.deckCount=Math.max(0,s.players.human.deckCount-n);
    }else {
      const actual=Math.min(n,s.players.human.runeCount);
      for(let i=0;i<actual;i++)place(s,"human",{code:"PHYSICAL-RUNE",name:"Rune physique",type:"Rune"},"runes");
      s.players.human.runeCount=Math.max(0,s.players.human.runeCount-actual);
    }
    summary=p+" : "+(type==="draw"?"pioche ":"canalise ")+n+" (sans arbitrage automatique)";
    if(type==="draw"){
      const triggered=processCardEvent(s,{trigger:"draw",actor:p},{place,deckCard});
      if(triggered.length)summary+=" · "+triggered.join(" · ");
    }
  } else if(type==="mulligan") {
    checkOwner(p);
    if(p!=="ai")throw Error("Mulligan physique à effectuer avec les vraies cartes");
    const uids=Array.isArray(c.uids)?c.uids:[];
    if(uids.length>2)throw Error("2 cartes maximum au mulligan");
    const exchanged=[];
    for(const uid of uids){const v=getCard(s,uid);if(v.owner!=="ai"||v.zone!=="hand")throw Error("Carte IA hors main");
      exchanged.push(v);s.cards=s.cards.filter(x=>x.uid!==uid);}
    for(let i=0;i<exchanged.length;i++){const card=s.decks.ai.main.shift();if(card)place(s,"ai",card,"hand");}
    s.decks.ai.main.push(...exchanged.map(v=>deckCard(v)));
    s.players.ai.deckCount=s.decks.ai.main.length;
    summary="IA : mulligan de "+exchanged.length+" carte(s)";
  } else if(type==="note") {
    summary=string(c.text,600);
  } else throw Error("Type de commande inconnu : "+type);
  // A unit creates automatic Conquer only when it establishes uncontested
  // control and this field has not scored for that player this turn.
  if(s.started&&!s.pendingCombat&&["add","move","remove","play-paid","combat-attack"].includes(type)){
   for(let i=0;i<s.battlefields.length;i++){
    const owner=battlefieldController(s,i);
    if(owner===s.active){
     const scored=scoreNewControl(old,s,owner,i);
     if(scored){
      summary+=" · "+scored;
      const triggered=processCardEvent(s,{trigger:"conquer",actor:owner,field:i},{place,deckCard});
      if(triggered.length)summary+=" · "+triggered.join(" · ");
     }
    }
   }
  }
  maybeRecord(s,summary);
  return s;
}
export const COMMANDS=["reset","setup-human","setup-ai","start","next-turn","phase","add","move","remove","exhaust","ready","exhaust-runes","play-paid","flip","counter","damage","score","hand-count","draw","channel","mulligan","note","combat-attack","combat-pass","combat-resolve","combat-order","combat-confirm-effects","stun","heal","effect-confirm"];
