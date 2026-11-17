// Shared board reducer for the local companion and the browser.
import {battlefieldController,scoreControlledBattlefield,scoreNewControl} from "./battlefield-rules.mjs";
import {planRunePayment,RUNE_DOMAINS} from "./rune-payment.mjs";
import {mandatoryPlayEffects} from "./play-effects.mjs";
import {processCardEvent} from "./effect-runtime.mjs";
import {drawMainCards,burnMainCards} from "./draw-rules.mjs";
import {migrateLegacyPassivePendingEffects} from "./effect-engine.mjs";
import {previewCombat,battleParties,combatWarnings,applyCombatResult, effectiveMight,OPPOSITE} from "./combat-engine.mjs";
import {verifiedSpell,shadowAssassin,mournfulWitness,handHammer,bladeTwirler,soulspinner,
 shadowDisciple,shadowClone,zedLegend,thresholdOfGray,hiddenDisciple,hasHidden} from "./verified-cards.mjs";
// Both the browser and the optional local relay use this exact reducer.
const ZONES = new Set(["legend","champion","hand","deck","base","battlefield","trash","banished","runes","rune-deck","rune-trash","chain","hidden","hidden-reveal"]);
const isHiddenSlot=card=>["hidden","hidden-reveal"].includes(card?.zone);
const OWNERS = new Set(["human","ai"]);
export const VERSION = 1;
export const PHASES = ["Awaken","Beginning","Channel","Draw","Main","Ending"];
const cp = x => JSON.parse(JSON.stringify(x));
function nextRandom(state){
  let seed=(state.rng>>>0)||0x6d2b79f5;
  seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  state.rng=seed>>>0;
  return state.rng/4294967296;
}
function shuffle(a,state) {
  // Fisher-Yates: the chosen champion is removed before drawing the opening hand.
  for(let i=a.length-1;i>0;i--){const j=Math.floor(nextRandom(state)*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
const player = () => ({legend:null,champion:null,score:0,handCount:4,deckCount:35,runeCount:12,notes:""});
export function createState({seed=Math.floor(Math.random()*4294967296)}={}) {
  return {version:VERSION,rng:seed>>>0,cardSerial:0,revision:0,createdAt:new Date().toISOString(),turn:1,active:"human",firstPlayer:"human",turnActions:{channeled:0,drawn:0,played:{human:0,ai:0}},pendingCombat:null,spellChain:null,pendingEffects:[],beginningScoringDue:false,effectMarks:[],winner:null,finished:false,scoredFields:{human:[],ai:[]},phase:"Setup",started:false,
    players:{human:player(),ai:player()},
    battlefields:[{owner:"human",card:null},{owner:"ai",card:null}],
    cards:[], decks:{ai:{main:[],runes:[],battlefields:[]}}, history:[], message:"Nouvelle table. Choisis ta légende et ton champion."};
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
  state.cardSerial=(state.cardSerial||0)+1;
  const instance={uid:stableUid||"c_serial_"+state.cardSerial,owner:p,...validateCard(c),zone,battlefield:zone==="battlefield"?Math.max(0,Math.min(1,Number(battlefield)||0)):null,
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
  const s=migrateLegacyPassivePendingEffects(cp(old||createState())), c=command, type=string(c.type,40);
  s.pendingEffects??=[];s.effectMarks??=[];
  s.energyPool??={human:0,ai:0};
  s.effectWork=0; // New action has its own bounded resolution budget.
  s.turnActions??={channeled:0,drawn:0};
  s.turnActions.played??={human:0,ai:0};
  if(s.pendingEffects.length&&["next-turn","play-paid","combat-attack"].includes(type))
   throw Error("Effet de carte en attente : résous-le avant de poursuivre la partie.");
  const p=c.player||"ai";
  if(s.finished&&["next-turn","play-paid","play-physical","cast","chain-pass","combat-attack","draw","channel","equip","hide","play-hidden"].includes(type))
   throw Error("Partie terminée : le vainqueur est "+s.winner+".");
  let summary="";
  if(s.spellChain&&["next-turn","phase","play-paid","play-physical","combat-attack",
                      "combat-pass","combat-resolve","combat-confirm-effects","equip"].includes(type))
    throw Error("Résous la chaîne de sorts avant de poursuivre.");
  if(s.pendingCombat&&["next-turn","phase","play-paid","combat-attack"].includes(type)&&
    type!=="combat-attack")throw Error("Combat en cours : résous les réactions et les dégâts avant de poursuivre.");
  if(s.pendingCombat&&type==="combat-attack")throw Error("Un combat est déjà en cours.");
  if(["move","remove","flip","counter","damage","exhaust","ready","heal","stun"].includes(type)&&
     s.cards.some(card=>card.uid===c.uid&&isHiddenSlot(card)))
    throw Error("Joue ou révèle la carte via sa zone cachée.");
  if(["add","move"].includes(type)&&["hidden","hidden-reveal"].includes(c.zone))
    throw Error("Utilise l’action Cacher pour cette zone.");
  const participants=index=>s.cards.filter(v=>v.zone==="battlefield"&&v.battlefield===index&&
    /^unit$/i.test(v.type||""));
  const runtime={place,deckCard,random:()=>nextRandom(s)};
  const onBoard=v=>v&&["base","battlefield"].includes(v.zone);
  const turnIndex=()=>s.turn*2+Number(s.active!==s.firstPlayer);
  const fieldController=field=>s.pendingCombat?.battlefield===field?
    s.pendingCombat.previousController:battlefieldController(s,field);
  function hasPriority(owner){
    const chain=s.spellChain,fight=s.pendingCombat;
    if(chain)return chain.priority===owner;
    if(fight)return (fight.focus??"human")===owner&&!fight.passes[owner];
    return s.active===owner;
  }
  function readHidden(owner,uid,revealedCard){
    const slot=getCard(s,string(uid,80));
    if(slot.zone!=="hidden"||slot.owner!==owner||fieldController(slot.battlefield)!==owner)
      throw Error("Carte cachée absente d’un champ que tu contrôles.");
    if(slot.hiddenOnTurn===turnIndex())throw Error("Une carte cachée se joue à partir du prochain tour.");
    const card=slot.type==="Hidden"?validateCard(revealedCard):slot;
    if(!hasHidden(card))throw Error("Cette carte ne possède pas Caché.");
    return {slot,card,field:slot.battlefield};
  }
  function turnFaceUp(slot,card,zone,field=null){
    Object.assign(slot,validateCard(card),{zone,battlefield:field,faceDown:false});
    delete slot.hiddenOnTurn;
  }
  function cleanHidden(){
    const revealed=[];
    for(const slot of s.cards.filter(v=>v.zone==="hidden"&&v.faceDown)){
      if(!s.finished&&fieldController(slot.battlefield)===slot.owner)continue;
      if(slot.type!=="Hidden"){
        if(s.finished)turnFaceUp(slot,slot,"hidden",slot.battlefield);
        else turnFaceUp(slot,slot,"trash");
        revealed.push(slot.name+" révélé"+(s.finished?"":" et défaussé"));
        continue;
      }
      const fieldName=s.battlefields[slot.battlefield]?.card?.name||"champ de bataille";
      slot.zone="hidden-reveal";
      s.pendingEffects.push({id:"hidden-"+slot.uid,sourceUid:slot.uid,player:"human",
       trigger:"hidden-reveal",cardName:"Carte cachée",text:"Révèle la carte cachée à "+fieldName+".",
       reason:s.finished?"Fin de la partie":"Le champ n’est plus contrôlé",finished:s.finished});
      revealed.push("Révélation attendue à "+fieldName);
    }
    return revealed;
  }
  function pay(owner,cost){
    const paid=planRunePayment(s,owner,cost);
    if(paid.error)throw Error(paid.error);
    for(const uid of paid.exhaustUids)getCard(s,uid).exhausted=true;
    s.energyPool[owner]-=paid.poolEnergy;
    for(const uid of paid.recycleUids){
      if(owner==="ai")s.decks.ai.runes.push(deckCard(getCard(s,uid)));
      else s.players.human.runeCount++;
    }
    const recycled=new Set(paid.recycleUids);
    s.cards=s.cards.filter(v=>!recycled.has(v.uid));
    if(owner==="ai")s.players.ai.runeCount=s.decks.ai.runes.length;
    return paid;
  }
  function payLabel(paid){
    return " · "+paid.energy+" énergie · "+paid.power+" Power ("+
      paid.recycleUids.length+" rune(s) recyclée(s))";
  }
  function checkSpellTarget(rule,target,owner,field){
    if(!onBoard(target)||target.faceDown||!/^unit$/i.test(target.type)||
       target.owner!==owner&&target.counters?.tempShroud)return false;
    if(rule.target==="friendly-unit")return target.owner===owner;
    if(rule.target==="field-unit")return target.zone==="battlefield";
    if(rule.target==="friendly-transfer"){
      const controller=fieldController(field);
      return Number.isInteger(field)&&controller===owner&&target.owner===owner&&
        (target.zone!=="battlefield"||target.battlefield!==field);
    }
    return true;
  }
  function defeatBySpell(target,logs){
    const lastKnown={...target};
    target.zone="trash";
    target.battlefield=null;
    target.exhausted=false;
    target.damage=0;
    logs.push(target.name+" éliminé");
    logs.push(...processCardEvent(s,{trigger:"die",actor:target.owner,source:lastKnown},runtime));
  }
  function spellResolution(item){
    const source=getCard(s,item.uid),rule=verifiedSpell(source);
    if(!rule)throw Error("Effet de sort non pris en charge.");
    source.zone=item.flow?"banished":"trash";
    const target=s.cards.find(v=>v.uid===item.targetUid);
    const logs=[];
    if(checkSpellTarget(rule,target,source.owner,item.field)){
      if(rule.target==="friendly-transfer"){
        target.zone="battlefield";target.battlefield=item.field;
        logs.push(target.name+" rejoint "+s.battlefields[item.field].card.name);
        logs.push(...processCardEvent(s,{trigger:"move",actor:target.owner,source:target},{place,deckCard}));
      }
      if(rule.might)target.counters.tempMight=(target.counters.tempMight||0)+rule.might;
      if(rule.prevention)target.counters.preventDamage=(target.counters.preventDamage||0)+rule.prevention;
      if(rule.shroud)target.counters.tempShroud=true;
      if(rule.ready)target.exhausted=false;
      if(rule.assault)target.counters.tempAssault=(target.counters.tempAssault||0)+rule.assault;
      if(rule.baseMight!==undefined)target.counters.tempBaseMight=rule.baseMight;
      if(rule.disempower&&target.counters.empowered>0)target.counters.empowered--;
      if(rule.killAtMost!==undefined){
        const might=effectiveMight(target,"none",s);
        if(might!==null&&might<=rule.killAtMost)defeatBySpell(target,logs);
      }
      if(rule.damage){
        const damage=item.damage,blocked=Math.min(damage,target.counters.preventDamage||0);
        target.counters.preventDamage=(target.counters.preventDamage||0)-blocked;
        target.damage=(target.damage||0)+damage-blocked;
        logs.push((damage-blocked)+" dégât(s) à "+target.name+(blocked?" · "+blocked+" prévenu(s)":""));
        const role=s.pendingCombat?.kind==="combat"&&s.pendingCombat.battlefield===target.battlefield?
          (target.owner===s.pendingCombat.attacker?"attack":"defend"):"none";
        const might=effectiveMight(target,role,s);
        if(might===null)throw Error("Force de la cible inconnue.");
        if(target.damage>0&&target.damage>=might)defeatBySpell(target,logs);
      }
    }else logs.push("cible devenue invalide");
    if(rule.draw){
      const result=drawMainCards(s,source.owner,rule.draw,runtime);
      logs.push("pioche "+result.actual+" carte(s)");
    }
    if(item.flow)logs.push(source.name+" banni après son lancement par Flux");
    return source.name+" résolu"+(logs.length?" · "+logs.join(" · "):"");
  }
  function moveEffects(v,burnPlayer){
    const logs=processCardEvent(s,{trigger:"move",actor:v.owner,source:v},{place,deckCard});
    if(shadowDisciple(v)){
      if(v.owner==="ai"&&s.pendingCombat?.kind==="combat"&&s.decks.ai.main.length>0){
       logs.push(burnMainCards(s,"ai",1,v,runtime));
       v.counters.tempMight=(v.counters.tempMight||0)+1;
      }else if(v.owner==="human"){
       logs.push(burnMainCards(s,"human",1,v,{...runtime,optional:true,buff:1}));
      }
      return logs;
    }
    if(!bladeTwirler(v))return logs;
    const mark="burn:"+s.turn+":"+s.active+":"+v.uid;
    if(s.effectMarks.includes(mark))return logs;
    s.effectMarks.push(mark);
    const choice=burnPlayer??(v.owner==="ai"?(s.decks.ai.main.length>1?"ai":"human"):null);
    if(!OWNERS.has(choice))throw Error("Blade Twirler : choisis le joueur qui subit Burn 1.");
    logs.push(burnMainCards(s,choice,1,v,runtime));
    return logs;
  }
  function beginCombat(field,attacker,arriving=[]){
    if(s.pendingCombat)return;
    const opponents=participants(field).filter(u=>u.owner===OPPOSITE[attacker]);
    const prev=old.cards.filter(v=>v.zone==="battlefield"&&v.battlefield===field&&
      /^unit$/i.test(v.type||""));
    const prevOwners=[...new Set(prev.map(v=>v.owner))];
    const previousController=prevOwners.length===1?prevOwners[0]:null;
    if(!opponents.length&&previousController===attacker)return;
    s.pendingCombat={kind:opponents.length?"combat":"conquest",battlefield:field,attacker,defender:OPPOSITE[attacker],
      previousController,focus:attacker,passes:{human:false,ai:false},orders:{human:[],ai:[]},
      confirmedEffects:false,initiators:arriving,
      warnings:[],createdAt:new Date().toISOString()};
    if(!opponents.length){
      processCardEvent(s,{trigger:"showdown",actor:attacker,field},{place,deckCard});
      return;
    }
    if(thresholdOfGray(s.battlefields[field].card)){
      s.energyPool.human++;s.energyPool.ai++;
    }
    const party=battleParties(s,field,attacker);
    s.pendingCombat.warnings=combatWarnings(s,field,party.attackers,party.defenders);
    const combatEffects=[];
    for(const unit of party.attackers.filter(x=>arriving.includes(x.uid))){
     if(attacker==="ai"&&shadowClone(unit)){
      const food=s.cards.filter(v=>v.owner==="ai"&&v.zone==="trash"&&/^unit$/i.test(v.type))
       .sort((a,b)=>(a.might||0)-(b.might||0))[0];
      if(food){
       food.zone="banished";unit.counters.tempAssault=4;
       for(const legend of s.cards.filter(v=>v.owner==="ai"&&v.zone==="legend"&&zedLegend(v)))
        legend.counters.empowered=1;
       combatEffects.push("Shadow Clone bannit "+food.name+" : Assault 4 ce tour");
      }
     }
     combatEffects.push(...processCardEvent(s,{trigger:"attack",actor:attacker,source:unit},{place,deckCard}));
    }
    for(const unit of party.defenders)
     combatEffects.push(...processCardEvent(s,{trigger:"defend",actor:unit.owner,source:unit},{place,deckCard}));
    if(combatEffects.length)s.pendingCombat.resolvedEffects=combatEffects;
    if(s.pendingEffects.length)s.pendingCombat.warnings.push(
     "Capacité déclenchée non résolue : "+s.pendingEffects[0].cardName);
  }
  function settleCombat(){
    const fight=s.pendingCombat;
    if(s.pendingEffects?.length)throw Error("Effets de cartes en attente avant la résolution du combat.");
    if(!fight||!fight.passes.human||!fight.passes.ai)
      throw Error("Attends que les deux joueurs aient passé leur fenêtre de réactions.");
    if(fight.warnings.length&&!fight.confirmedEffects)
      throw Error("Effets de cartes à vérifier : confirme leur résolution avant le calcul.");
    if(fight.kind==="conquest"&&
       !participants(fight.battlefield).some(u=>u.owner===fight.defender)){
      s.pendingCombat=null;
      const owner=battlefieldController(s,fight.battlefield);
      const previousScore=s.players[fight.attacker].score;
      const scoring=owner===fight.attacker?
       scoreControlledBattlefield(s,owner,fight.battlefield,"conquer",runtime):null;
      const effects=scoring&&s.players[owner].score>previousScore?processCardEvent(s,{trigger:"conquer",actor:owner,
       field:fight.battlefield},{place,deckCard}):[];
      summary=["Confrontation terminée",scoring,...effects].filter(Boolean).join(" · ");
      return;
    }
    const preview=previewCombat(s,fight.battlefield,fight.attacker,fight.orders);
    if(!preview.ready)throw Error(preview.error);
    const dying=preview.dead.map(uid=>s.cards.find(c=>c.uid===uid)).filter(Boolean).map(c=>({...c}));
    const outcome=applyCombatResult(s,preview,{previousController:fight.previousController});
    for(const uid of [...preview.attackers,...preview.defenders]){
      const unit=s.cards.find(v=>v.uid===uid);
      if(onBoard(unit)&&mournfulWitness(unit))unit.counters.empowered=1;
    }
    const triggered=[];
    for(const unit of dying)
      triggered.push(...processCardEvent(s,{trigger:"die",actor:unit.owner,source:unit},{place,deckCard}));
    const resolved=outcome.controller;
    let scoring="";
    if(resolved&&resolved!==outcome.previousController){
      const previousScore=s.players[resolved].score;
      scoring=scoreControlledBattlefield(s,resolved,fight.battlefield,"conquer",runtime)||"";
      if(scoring&&s.players[resolved].score>previousScore)triggered.push(...processCardEvent(s,{
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
  function finishBeginningScoring(){
    if(!s.beginningScoringDue||s.pendingEffects.length)return [];
    const scored=[];
    s.beginningScoringDue=false;
    for(let i=0;i<s.battlefields.length;i++){
     if(battlefieldController(s,i)!==s.active)continue;
     const score=scoreControlledBattlefield(s,s.active,i,"hold",runtime);
     if(!score)continue;
     scored.push(score);
     scored.push(...processCardEvent(s,{trigger:"hold",
      actor:s.active,field:i},{place,deckCard}));
    }
    return scored;
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
      shuffle(s.decks.ai.main,s);
      s.decks.ai.runes=shuffle(c.runes.map(deckCard),s);
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
    checkOwner(p);s.active=p;s.firstPlayer=p;s.turnActions={channeled:0,drawn:0,played:{human:0,ai:0}};s.scoredFields={human:[],ai:[]};s.phase="Awaken";s.turn=1;s.started=true;
    summary="Début de partie. Premier joueur : "+(p==="ai"?"IA":"joueur");
  } else if(type==="next-turn") {
    // End-of-turn cleanup: marked damage heals and stun / temporary buffs expire.
    for(const unit of s.cards)if(/^unit$/i.test(unit.type||"")){
      unit.damage=0;unit.stunned=false;
      if(unit.counters){
       for(const key of ["stunned","tempMight","mightThisTurn","preventDamage","tempAssault","tempBaseMight","tempShroud"])
        delete unit.counters[key];
      }
    }
    s.active=s.active==="human"?"ai":"human";
    if(s.active===(s.firstPlayer||"human"))s.turn++;
    s.turnActions={channeled:0,drawn:0,played:{human:0,ai:0}};
    s.energyPool={human:0,ai:0};
    s.scoredFields??={human:[],ai:[]};
    s.scoredFields[s.active]=[];
    // Awaken precedes Beginning. Ready the active player's cards, then
    // automatically mark obvious uncontested Hold scores; card effects stay manual.
    for(const card of s.cards)if(card.owner===s.active)card.exhausted=false;
    s.phase="Beginning";s.started=true;
    // Temporary units die before beginning-of-turn Hold scoring.
    const temporaryDeaths=[];
    for(const card of s.cards.filter(x=>x.owner===s.active&&
      ["base","battlefield"].includes(x.zone)&&/\[Temporary\]/i.test(x.text||""))){
     const lastKnown={...card};
     card.zone="trash";card.battlefield=null;card.exhausted=false;card.damage=0;
     temporaryDeaths.push(card.name);
     processCardEvent(s,{trigger:"die",actor:card.owner,source:lastKnown},{place,deckCard});
    }
    s.beginningScoringDue=true;
    // Rule order: beginning abilities (including any choices/chain) BEFORE Hold.
    const triggered=processCardEvent(s,{trigger:"beginning",actor:s.active},{place,deckCard});
    const holds=finishBeginningScoring();
    summary="Tour "+s.turn+" : "+(s.active==="human"?"joueur":"IA")+
     (temporaryDeaths.length?" · Temporary : "+temporaryDeaths.join(", "):"")+
     (triggered.length?" · "+triggered.join(" · "):"")+
     (holds.length?" · "+holds.join(" · "):"");
    if(s.beginningScoringDue)summary+=" · effet(s) à résoudre avant le maintien";
  } else if(type==="phase") {
    const phase=string(c.phase,30);
    if(!PHASES.includes(phase))throw Error("Phase inconnue");
    const entering=phase!==s.phase;
    s.phase=phase;summary="Phase "+phase;
    if(entering&&phase==="Main")s.energyPool={human:0,ai:0};
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
     s.turnActions.played[p]=(s.turnActions.played[p]||0)+1;
     if(!s.pendingEffects.length)
      triggered.push(...processCardEvent(s,{trigger:"ally-play",actor:p,source:v},{place,deckCard}));
     if(triggered.length)summary+=" · "+triggered.join(" · ");
    }
  } else if(type==="rune-identify"){
    const v=getCard(s,string(c.uid,80));
    if(v.owner!=="human"||v.zone!=="runes"||v.code!=="PHYSICAL-RUNE")
      throw Error("Choisis une rune physique non identifiée.");
    if(!RUNE_DOMAINS.includes(c.domain))throw Error("Domaine de rune inconnu.");
    v.name=c.domain+" Rune";v.domains=[c.domain];v.code="PHYSICAL-"+c.domain.toUpperCase();
    summary="Rune physique identifiée : "+c.domain;
  } else if(type==="hide"){
    checkOwner(p);
    if(!s.started||s.active!==p||s.phase!=="Main"||s.spellChain||s.pendingCombat||s.pendingEffects.length)
      throw Error("Cache une carte pendant ta phase principale ouverte, hors confrontation.");
    const field=c.battlefield;
    if(!Number.isInteger(field)||!s.battlefields[field]?.card||fieldController(field)!==p)
      throw Error("Choisis un champ de bataille que tu contrôles.");
    if(s.cards.some(v=>isHiddenSlot(v)&&v.battlefield===field))
      throw Error("Une carte est déjà cachée sur ce champ de bataille.");
    const source=c.uid?getCard(s,string(c.uid,80)):null;
    if(source){
      if(source.owner!==p||source.zone!=="champion"&&!(p==="ai"&&source.zone==="hand")||!hasHidden(source))
        throw Error("Il faut une carte avec Caché dans ta main ou ta zone de champion.");
    }else if(p!=="human"||s.players.human.handCount<=0)
      throw Error("Aucune carte à cacher dans ta main.");
    if(c.card)throw Error("Garde l’identité de la carte physique secrète jusqu’à sa révélation.");
    const paid=pay(p,{name:"Caché",energy:0,power:1,anyPower:true,runeUid:c.runeUid});
    const slot=source||place(s,p,{name:"Carte cachée",type:"Hidden"},"hidden",null,true);
    if(!source||source.zone==="hand")s.players[p].handCount--;
    Object.assign(slot,{zone:"hidden",battlefield:field,faceDown:true,hiddenOnTurn:turnIndex()});
    summary=(p==="ai"?"IA":"Joueur")+" : une carte cachée à "+s.battlefields[field].card.name+payLabel(paid);
  } else if(type==="play-hidden"){
    checkOwner(p);
    if(!s.started||s.phase!=="Main"||s.pendingEffects.length||!hasPriority(p))
      throw Error("Attends ta priorité pour jouer la carte cachée.");
    const {slot,card,field}=readHidden(p,c.uid,c.card);
    if(!hiddenDisciple(card))throw Error("Révélation de ce permanent caché à arbitrer manuellement.");
    turnFaceUp(slot,card,"battlefield",field);
    slot.exhausted=true;
    const played=processCardEvent(s,{trigger:"play",actor:p,source:slot},runtime);
    s.turnActions.played[p]++;
    if(!s.pendingEffects.length)played.push(...processCardEvent(s,{trigger:"ally-play",actor:p,source:slot},runtime));
    if(s.spellChain){
      s.spellChain.priority=getCard(s,s.spellChain.items.at(-1).uid).owner;
      s.spellChain.lastPass=null;
    }else if(s.pendingCombat){
      s.pendingCombat.focus=OPPOSITE[p];
      s.pendingCombat.passes={human:false,ai:false};
    }
    summary=slot.name+" révélée et jouée à "+s.battlefields[field].card.name+
      (played.length?" · "+played.join(" · "):"");
  } else if(type==="equip"){
    if(!s.started||s.active!==p||s.phase!=="Main"||s.pendingCombat||s.pendingEffects.length)
      throw Error("Équipement disponible pendant la phase principale ouverte du contrôleur.");
    const gear=getCard(s,string(c.uid,80)),target=getCard(s,string(c.targetUid,80));
    if(!handHammer(gear)||!onBoard(gear)||gear.owner!==p||gear.attachedTo===target.uid||
       !onBoard(target)||!/^unit$/i.test(target.type)||target.owner!==p)
      throw Error("Équipement ou unité cible invalide.");
    const paid=pay(p,{energy:0,power:1,domains:["Calm"],name:gear.name});
    gear.attachedTo=target.uid;gear.zone=target.zone;gear.battlefield=target.battlefield;
    summary=gear.name+" attaché à "+target.name+payLabel(paid);
  } else if(type==="play-physical"){
    const ambush=c.ambush===true;
    if(!s.started||(!ambush&&(s.active!=="human"||s.pendingCombat))||
       s.phase!=="Main"||s.pendingEffects.length)
      throw Error("Annonce ce jeu pendant ta phase principale ouverte.");
    const chosen=c.uid?getCard(s,string(c.uid,80)):null;
    if(chosen&&(chosen.owner!=="human"||chosen.zone!=="champion"))
      throw Error("Ce n’est pas ton champion choisi.");
    const card=chosen||validateCard(c.card);
    if(!chosen&&s.players.human.handCount<1)throw Error("Aucune carte dans ta main physique.");
    if(!/^(unit|gear)$/i.test(card.type))throw Error("Ce type de carte ne peut pas être joué ici.");
    const gear=/^gear$/i.test(card.type),field=c.battlefield;
    if(ambush&&(!soulspinner(card)||!s.pendingCombat||
      (s.pendingCombat.focus??"human")!=="human"||s.pendingCombat.passes.human||
      !Number.isInteger(field)||!participants(field).some(v=>v.owner==="human")))
      throw Error("Embuscade : attends ta priorité et choisis un champ où tu as une unité.");
    if(!ambush&&field!=null&&(gear||!Number.isInteger(field)||battlefieldController(s,field)!=="human"))
      throw Error("Joue cette unité en base ou sur un champ que tu contrôles.");
    const text=String(card.text||"");
    if(/\b(?:play only|can't play|cannot play|as an additional cost|must pay)\b/i.test(text))
      throw Error("Coût supplémentaire ou restriction non prise en charge.");
    const paid=pay("human",card),zone=field!=null?"battlefield":"base";
    const v=chosen||place(s,"human",card,zone,field,false);
    if(!chosen)s.players.human.handCount--;
    v.zone=zone;v.battlefield=field??null;
    v.exhausted=!gear&&!(shadowAssassin(v)?
     s.cards.some(x=>x.owner==="human"&&x.zone==="trash"&&x.name===v.name):entersNaturallyReady(v));
    const logs=processCardEvent(s,{trigger:"play",actor:"human",source:v,
     choices:{targetUid:c.targetUid}},{place,deckCard});
    s.turnActions.played.human++;
    if(!s.pendingEffects.length)logs.push(...processCardEvent(s,{trigger:"ally-play",actor:"human",source:v},{place,deckCard}));
    if(ambush){
      s.pendingCombat.focus="ai";s.pendingCombat.passes={human:false,ai:false};
    }
    summary="Joueur : "+v.name+" jouée "+(field!=null?"sur "+s.battlefields[field].card.name:"en base")+
      payLabel(paid)+(logs.length?" · "+logs.join(" · "):"");
  } else if(type==="cast"){
    checkOwner(p);
    if(!s.started||s.phase!=="Main"||s.pendingEffects.length)
      throw Error("Aucune fenêtre de sort disponible.");
    const chain=s.spellChain,fight=s.pendingCombat;
    if(!hasPriority(p))
      throw Error("Tu n'as pas la priorité pour lancer ce sort.");
    if(chain?.items.length>=12)throw Error("Chaîne de sorts trop longue.");
    const flow=c.flow===true;
    if(flow&&c.hidden)throw Error("Choisis une seule zone de lancement.");
    const hidden=c.hidden===true?readHidden(p,c.uid,c.card):null;
    const fromBoard=p==="ai"||flow;
    const source=hidden?.card??(fromBoard?getCard(s,string(c.uid,80)):validateCard(c.card));
    if(!hidden&&fromBoard&&(source.owner!==p||source.zone!==(flow?"trash":"hand")))
      throw Error(flow?"Sort absent de ta défausse.":"Sort absent de la main de l'IA.");
    if(p==="human"&&!flow&&!hidden&&s.players.human.handCount<1)throw Error("Aucune carte dans ta main physique.");
    const rule=verifiedSpell(source);
    if(!rule)throw Error("Sort non pris en charge : son effet n'est pas validé par le moteur.");
    if(flow&&!rule.flow)throw Error("Ce sort ne peut pas être lancé par Flux.");
    if(chain&&rule.timing!=="reaction")throw Error("Ce sort n'est pas une Réaction.");
    if(fight&&!chain&&rule.timing==="main")
      throw Error("Ce sort se lance pendant ta phase principale, hors confrontation.");
    if(hidden&&(rule.target!=="friendly-transfer"||c.battlefield!==hidden.field))
      throw Error("Resonating Strike caché choisit d’abord le champ où il a été caché.");
    const target=getCard(s,string(c.targetUid,80));
    if(!checkSpellTarget(rule,target,p,c.battlefield))throw Error("La cible ou le champ n'est pas légal pour ce sort.");
    if(target.owner!==p&&/\[Deflect\]/i.test(target.text||""))throw Error("Le coût Deflect supplémentaire n'est pas pris en charge pour ce sort.");
    let discard=null;
    if(c.discardUid){
      discard=getCard(s,string(c.discardUid,80));
      if(p!=="ai"||!rule.discardDamage||discard.uid===source.uid||discard.owner!==p||discard.zone!=="hand")
        throw Error("Défausse supplémentaire invalide.");
    }
    const paid=pay(p,{...(hidden?{energy:0,power:0}:flow?rule.flow:rule),name:source.name});
    if(discard){discard.zone="trash";s.players[p].handCount--;}
    const v=hidden?.slot??(fromBoard?source:place(s,p,source,"chain"));
    if(hidden)turnFaceUp(v,source,"chain");
    v.zone="chain";
    if(!flow&&!hidden)s.players[p].handCount--;
    s.turnActions.played[p]++;
    s.spellChain=chain||{items:[],lastPass:null,opener:p};
    s.spellChain.items.push({uid:v.uid,targetUid:target.uid,field:c.battlefield??null,
      damage:discard?rule.discardDamage:rule.damage??0,...(flow?{flow:true}:{})});
    s.spellChain.priority=p;s.spellChain.lastPass=null;
    summary=v.name+(flow?" par Flux":"")+" sur la chaîne → "+target.name+payLabel(paid)+
      (discard?" · défausse "+discard.name:"");
  } else if(type==="chain-pass"){
    checkOwner(p);
    const chain=s.spellChain;
    if(!chain||chain.priority!==p)throw Error("Tu n'as pas la priorité sur la chaîne.");
    if(s.pendingEffects.length)throw Error("Résous l'effet en attente.");
    if(chain.lastPass===OPPOSITE[p]){
      summary=spellResolution(chain.items.pop());
      if(chain.items.length){
        chain.priority=getCard(s,chain.items.at(-1).uid).owner;chain.lastPass=null;
      }else{
        s.spellChain=null;
        if(s.pendingCombat){
          // A spell reopens the showdown. A prior pass cannot close it.
          s.pendingCombat.focus=OPPOSITE[chain.opener];
          s.pendingCombat.passes={human:false,ai:false};
        }
      }
    }else{
      chain.lastPass=p;chain.priority=OPPOSITE[p];
      summary=(p==="ai"?"IA":"Joueur")+" passe sur la chaîne.";
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
    const restrictedText=String(v.text||"").replace(/^\[Accelerate\][^\n]*$/gim,"");
    if(/\b(?:play only|can't play|cannot play|you may only play|as an additional cost|must pay)\b/i.test(restrictedText))
     throw Error(v.name+" : condition ou coût supplémentaire non vérifiable. La carte reste en main.");
    const onPlay=mandatoryPlayEffects(v,{playedBefore:s.turnActions.played.ai});
    const discardUids=Array.isArray(c.discardUids)?c.discardUids:[];
    // Preflight card text before paying the runes. For unfamiliar abilities
    // the card is playable, but its trigger becomes an unresolved chain item.
    if(discardUids.length!==onPlay.discard||new Set(discardUids).size!==discardUids.length)
     throw Error(v.name+" : défausse obligatoire de "+onPlay.discard+" carte(s) non choisie.");
    const discardCards=discardUids.map(uid=>getCard(s,string(uid,80)));
    if(discardCards.some(x=>x.owner!=="ai"||x.zone!=="hand"||x.uid===v.uid))
     throw Error("La défausse obligatoire doit venir de la main de l'IA.");
    const isSpell=String(v.type).toLowerCase()==="spell";
    if(isSpell&&verifiedSpell(v))throw Error("Lance ce sort avec sa cible par la chaîne.");
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
    const paid=pay("ai",cost);
    if(v.zone==="hand")s.players.ai.handCount--;
    v.zone=dest;v.battlefield=dest==="battlefield"?field:null;
    v.exhausted=isSpell||isGear||accelerate?false:
      !(shadowAssassin(v)?s.cards.some(x=>x.owner==="ai"&&x.zone==="trash"&&x.name===v.name):entersNaturallyReady(v));
    if(!accelerate&&!isGear&&!isSpell&&/\baccelerate\b/i.test(v.text||""))v.exhausted=true;
    const triggered=processCardEvent(s,{trigger:"play",actor:"ai",source:v,
     choices:{discardUids}},{place,deckCard});
    s.turnActions.played.ai++;
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
    if(pending.trigger==="hidden-reveal"){
      const slot=getCard(s,pending.sourceUid),revealed=validateCard(c.card);
      if(slot.zone!=="hidden-reveal"||!hasHidden(revealed))
        throw Error("Indique la carte avec Caché réellement révélée.");
      turnFaceUp(slot,revealed,pending.finished?"hidden":"trash",pending.finished?slot.battlefield:null);
    }else if(pending.trigger==="burn"){
      if(c.decline&&!pending.optional)throw Error("Ce Burn est obligatoire.");
      if(!c.decline){
       const burned=(Array.isArray(c.cards)?c.cards:c.card?[c.card]:[]).map(validateCard);
       if(burned.length!==(pending.burnCount??1)||s.players.human.deckCount<burned.length||
          burned.some(card=>!(/^(unit|gear|spell)$/i.test(card.type))))
         throw Error("Indique exactement les cartes révélées par Burn.");
       s.players.human.deckCount-=burned.length;
       for(const card of burned)place(s,"human",card,"trash");
       const unit=s.cards.find(v=>v.uid===pending.sourceUid);
       if(pending.buff&&onBoard(unit))unit.counters.tempMight=(unit.counters.tempMight||0)+pending.buff;
      }
    }else if(pending.choice?.kind==="discard-draw"){
      if(s.players.human.handCount>0){
       const discarded=validateCard(c.card);
       if(!(/^(unit|gear|spell)$/i.test(discarded.type)))throw Error("Indique la carte physique défaussée.");
       s.players.human.handCount--;
       place(s,"human",discarded,"trash");
      }
      drawMainCards(s,"human",pending.choice.draw,runtime);
    }
    s.pendingEffects.shift();
    summary=pending.trigger==="hidden-reveal"?"Carte cachée révélée : "+getCard(s,pending.sourceUid).name:
      "Effet résolu physiquement : "+pending.cardName+" — "+pending.text;
    const holds=finishBeginningScoring();
    if(holds.length)summary+=" · "+holds.join(" · ");
    if(s.pendingCombat?.passes.human&&s.pendingCombat.passes.ai&&!s.pendingEffects.length&&
       (!s.pendingCombat.warnings.length||s.pendingCombat.confirmedEffects))settleCombat();
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
    const moveLogs=attacking.flatMap(v=>moveEffects(v,c.burnPlayer));
    summary="Assaut "+(p==="ai"?"IA":"joueur")+" : "+attacking.map(v=>v.name).join(", ")+
      " → "+s.battlefields[field].card.name+
      (s.pendingCombat?" · fenêtre de réactions ouverte":"")+
      (moveLogs.length?" · "+moveLogs.join(" · "):"");
  } else if(type==="combat-pass") {
    const combat=s.pendingCombat;
    if(!combat)throw Error("Aucun combat en cours.");
    checkOwner(p);
    if((combat.focus??"human")!==p)throw Error("Ce joueur n'a pas la focalisation.");
    if(s.pendingEffects.length)throw Error("Résous les effets avant de passer la focalisation.");
    if(combat.passes[p])throw Error("Ce joueur a déjà passé la fenêtre de réactions.");
    combat.passes[p]=true;
    combat.focus=OPPOSITE[p];
    summary=(p==="ai"?"IA":"Joueur")+" passe sa réaction.";
    if(combat.passes.human&&combat.passes.ai){
      if(s.pendingEffects.length)
        summary+=" Résous les effets en attente avant de clore la confrontation.";
      else if(combat.warnings.length&&!combat.confirmedEffects)
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
    // The Combat screen already asks the human to resolve every printed
    // triggered Attack/Defend/Showdown effect. Do not ask the same question
    // a second time in the generic effects panel.
    s.pendingEffects=s.pendingEffects.filter(e=>
     !["attack","defend","showdown"].includes(e.trigger));
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
    const standard=!!s.started&&!c.effect&&/^unit$/i.test(v.type||"")&&
      ["base","battlefield"].includes(origin)&&["base","battlefield"].includes(zone)&&
      (origin!==zone||(zone==="battlefield"&&Number(c.battlefield)!==v.battlefield));
    if(standard){
     if(s.pendingCombat||s.spellChain||s.pendingEffects.length)
      throw Error("Déplacement normal impossible pendant une confrontation ou un effet en attente.");
     if(v.exhausted)throw Error("Cette unité est épuisée : elle ne peut pas se déplacer.");
     if(v.owner!==s.active||s.phase!=="Main")
      throw Error("Déplacement standard réservé à la Main Phase du contrôleur.");
     if(origin==="battlefield"&&zone==="battlefield"){
      const fieldText=s.battlefields[v.battlefield]?.card?.text||"";
      const grant=/units (?:at|on|here|there)[^.!]*\[Ganking\]/i.test(fieldText);
      if(!/\[Ganking\]/i.test(v.text||"")&&!grant)
       throw Error("Ganking est nécessaire pour aller directement d'un champ à un autre.");
     }
    }
    if(!c.effect&&origin==="base"&&zone==="battlefield"&&v.exhausted&&/^unit$/i.test(v.type||""))
     throw Error("Cette unité est épuisée : elle ne peut pas se déplacer normalement.");
    if(v.zone==="hand")s.players[v.owner].handCount=Math.max(0,s.players[v.owner].handCount-1);
    if(zone==="hand")s.players[v.owner].handCount++;
    v.zone=zone;v.battlefield=zone==="battlefield"?Math.max(0,Math.min(1,Number(c.battlefield)||0)):null;
    if(/unit/i.test(v.type||"")&&["base","battlefield"].includes(zone)){
      if(["hand","champion"].includes(origin))
        v.exhausted=!entersNaturallyReady(v)||/\[Accelerate\]/i.test(v.text||"");
      else if(standard)v.exhausted=true;
    }
    if(typeof c.faceDown==="boolean")v.faceDown=c.faceDown;
    summary=v.name+" → "+(zone==="battlefield"?"champ de bataille "+(v.battlefield+1):zone);
    if(["base","battlefield"].includes(origin)&&zone==="battlefield"&&
       v.owner===s.active&&standard)beginCombat(v.battlefield,v.owner,[v.uid]);
    if(zone!==origin||(zone==="battlefield"&&v.battlefield!==old.cards.find(x=>x.uid===v.uid)?.battlefield)){
      const triggered=moveEffects(v,c.burnPlayer);
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
        const might=effectiveMight(v,role,s);
        if(might!==null&&v.damage>=might){
          const lastKnown={...v};
          v.zone="trash";v.battlefield=null;v.exhausted=false;v.damage=0;
          summary=v.name+" vaincue par les dégâts.";
          const triggered=processCardEvent(s,{trigger:"die",actor:v.owner,source:lastKnown},{place,deckCard});
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
    const normal=s.started&&p===s.active&&c.cause!=="effect"&&
      (type==="channel"?s.phase==="Channel":s.phase==="Draw");
    let drawn=0,burnOuts=0;
    let channeled=0;
    if(type==="draw"){
     const result=drawMainCards(s,p,n,runtime);
     drawn=result.actual;burnOuts=result.burnOuts;
    }else if(p==="ai"){
     for(let i=0;i<n;i++){
      const card=s.decks.ai.runes.shift();if(!card)break;
      place(s,p,card,"runes",undefined,false,"c_auto_"+p+"_channel_"+s.revision+"_"+i);
      channeled++;
     }
     s.players.ai.runeCount=s.decks.ai.runes.length;
    }else{
     const actual=Math.min(n,s.players.human.runeCount);
     channeled=actual;
     for(let i=0;i<actual;i++)place(s,"human",
      {code:"PHYSICAL-RUNE",name:"Rune physique",type:"Rune"},"runes");
     s.players.human.runeCount=Math.max(0,s.players.human.runeCount-actual);
    }
    if(normal){
      if(type==="draw"){s.turnActions.drawn+=drawn;s.turnActions.drawAttempted=true;}
      else {s.turnActions.channeled+=channeled;s.turnActions.channelAttempted=true;}
    }
    summary=p+" : "+(type==="draw"?"pioche "+drawn:"canalise "+channeled)+
     (burnOuts?" · Burn Out ×"+burnOuts:"");
    if(type==="draw"&&drawn){
     for(let i=0;i<drawn;i++){
      const triggered=processCardEvent(s,{trigger:"draw",actor:p},{place,deckCard});
      if(triggered.length)summary+=" · "+triggered.join(" · ");
      if(s.pendingEffects.length)break;
     }
    }
    if(s.winner)summary+=" · Victoire "+(s.winner==="ai"?"IA":"joueur");
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
  for(const gear of s.cards.filter(v=>v.attachedTo)){
    const host=s.cards.find(v=>v.uid===gear.attachedTo);
    if(!onBoard(host)){
      gear.attachedTo=null;gear.zone="base";gear.battlefield=null;
    }else{gear.zone=host.zone;gear.battlefield=host.battlefield;}
  }
  // A unit creates automatic Conquer only when it establishes uncontested
  // control and this field has not scored for that player this turn.
  if(s.started&&!s.pendingCombat&&["add","move","remove","play-paid","combat-attack"].includes(type)){
   for(let i=0;i<s.battlefields.length;i++){
    const owner=battlefieldController(s,i);
    if(owner===s.active){
     const previousScore=s.players[owner].score;
     const scored=scoreNewControl(old,s,owner,i,runtime);
     if(scored){
      summary+=" · "+scored;
      const triggered=s.players[owner].score>previousScore?
       processCardEvent(s,{trigger:"conquer",actor:owner,field:i},{place,deckCard}):[];
      if(triggered.length)summary+=" · "+triggered.join(" · ");
     }
    }
   }
  }
  // Tokens exist only on the board, never in trash or a recycled Main Deck.
  s.cards=s.cards.filter(card=>
   !(card.tags||[]).some(tag=>String(tag).toLowerCase()==="token")&&
   !/^TOKEN-/i.test(card.code||"")||
   ["base","battlefield"].includes(card.zone));
  if(!s.winner){
   // Victory is decided during cleanup only when the leader has at least
   // the target AND strictly more points than their opponent. An 8–8 tie
   // does not declare either player the winner.
   const a=s.players.ai.score,h=s.players.human.score;
   const owner=a>=8&&a>h?"ai":h>=8&&h>a?"human":null;
   if(owner){
    s.winner=owner;s.finished=true;
    summary+=" · Victoire "+(owner==="ai"?"IA":"joueur");
   }
  }
  if(s.finished)s.pendingEffects=s.pendingEffects.filter(effect=>effect.trigger==="hidden-reveal");
  const hiddenCleanup=cleanHidden();
  if(hiddenCleanup.length)summary+=" · "+hiddenCleanup.join(" · ");
  maybeRecord(s,summary);
  return s;
}
export const COMMANDS=["reset","setup-human","setup-ai","start","next-turn","phase","add","move","remove","exhaust","ready","exhaust-runes","play-paid","play-physical","cast","chain-pass","equip","hide","play-hidden","rune-identify","flip","counter","damage","score","hand-count","draw","channel","mulligan","note","combat-attack","combat-pass","combat-resolve","combat-order","combat-confirm-effects","stun","heal","effect-confirm"];
