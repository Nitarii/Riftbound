// Shared, dependency-free board state. Never auto-adjudicates Riftbound card text.
// Both the browser and the optional local relay use this exact reducer.
const ZONES = new Set(["legend","champion","hand","deck","base","battlefield","trash","banished","runes","rune-deck","rune-trash"]);
const OWNERS = new Set(["human","ai"]);
export const VERSION = 1;
export const PHASES = ["Awaken","Beginning","Channel","Draw","Main","Ending"];
const cp = x => JSON.parse(JSON.stringify(x));
const player = () => ({legend:null,champion:null,score:0,handCount:4,deckCount:null,runeCount:12,notes:""});
export function createState() {
  return {version:VERSION,revision:0,createdAt:new Date().toISOString(),turn:1,active:"human",phase:"Setup",started:false,
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
    image:/^https:\/\/[a-z0-9.-]+\//i.test(card.image||"")?card.image:"",domain:Array.isArray(card.domains)?card.domains.slice(0,3).map(String):[],
    text:String(card.text||"").slice(0,2500),energy:Number.isFinite(+card.energy)?+card.energy:null,
    power:Number.isFinite(+card.power)?+card.power:null,might:Number.isFinite(+card.might)?+card.might:null,
    tags:Array.isArray(card.tags)?card.tags.slice(0,12).map(String):[]};
}
function place(state, p, c, zone, battlefield, faceDown) {
  if(!ZONES.has(zone)) throw Error("Zone inconnue");
  const instance={uid:id(),owner:p,...validateCard(c),zone,battlefield:zone==="battlefield"?Math.max(0,Math.min(1,Number(battlefield)||0)):null,
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
export function applyCommand(old, command) {
  if(!command||typeof command!=="object"||Array.isArray(command)) throw Error("Commande JSON attendue");
  const s=cp(old||createState()), c=command, type=string(c.type,40);
  const p=c.player||"ai";
  let summary="";
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
    s.battlefields[who==="human"?0:1].card=validateCard(c.battlefield);
    s.cards=s.cards.filter(v=>!(v.owner===who && (v.zone==="legend"||v.zone==="champion")));
    place(s,who,c.legend,"legend");
    place(s,who,c.champion,"champion");
    if(who==="ai") {
      if(!Array.isArray(c.main)||!Array.isArray(c.runes)) throw Error("Deck IA : main[] et runes[] requis");
      if(c.main.length>150||c.runes.length>36)throw Error("Deck trop grand");
      s.decks.ai.main=c.main.map(deckCard);
      s.decks.ai.runes=c.runes.map(deckCard);
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
    checkOwner(p);s.active=p;s.phase="Awaken";s.turn=1;s.started=true;
    summary="Début de partie. Premier joueur : "+(p==="ai"?"IA":"joueur");
  } else if(type==="next-turn") {
    s.active=s.active==="human"?"ai":"human";
    if(s.active==="human")s.turn++;
    s.phase="Awaken";s.started=true;
    summary="Tour "+s.turn+" : "+(s.active==="human"?"joueur":"IA")+". Phases à résoudre manuellement.";
  } else if(type==="phase") {
    const phase=string(c.phase,30);
    if(!PHASES.includes(phase))throw Error("Phase inconnue");
    s.phase=phase;summary="Phase "+phase;
  } else if(type==="add") {
    checkOwner(p);const v=place(s,p,c.card,c.zone||"base",c.battlefield,c.faceDown);
    if(v.zone==="hand")s.players[p].handCount++;
    summary=(p==="ai"?"IA":"Joueur")+" : "+v.name+" → "+v.zone;
  } else if(type==="move") {
    const v=getCard(s,string(c.uid,80)),zone=string(c.zone,40);
    if(!ZONES.has(zone))throw Error("Zone inconnue");
    if(v.zone==="hand")s.players[v.owner].handCount=Math.max(0,s.players[v.owner].handCount-1);
    if(zone==="hand")s.players[v.owner].handCount++;
    v.zone=zone;v.battlefield=zone==="battlefield"?Math.max(0,Math.min(1,Number(c.battlefield)||0)):null;
    if(typeof c.faceDown==="boolean")v.faceDown=c.faceDown;
    summary=v.name+" → "+(zone==="battlefield"?"champ de bataille "+(v.battlefield+1):zone);
  } else if(type==="remove") {
    const v=getCard(s,string(c.uid,80));
    s.cards=s.cards.filter(x=>x.uid!==v.uid);
    if(v.zone==="hand")s.players[v.owner].handCount=Math.max(0,s.players[v.owner].handCount-1);
    summary=v.name+" retirée de la table";
  } else if(type==="exhaust"||type==="ready") {
    if(c.uid){const v=getCard(s,string(c.uid,80));v.exhausted=type==="exhaust";summary=v.name+" : "+(v.exhausted?"épuisée":"redressée");}
    else{checkOwner(p);const affected=s.cards.filter(v=>v.owner===p);for(const v of affected)v.exhausted=type==="exhaust";summary=(p==="ai"?"IA":"Joueur")+" : "+type+" toutes ses cartes";}
  } else if(type==="flip") {
    const v=getCard(s,string(c.uid,80));v.faceDown=!v.faceDown;summary=v.name+" retournée";
  } else if(type==="counter"||type==="damage") {
    const v=getCard(s,string(c.uid,80));
    const value=Number(c.value);
    if(!Number.isInteger(value)||value < -999||value>999)throw Error("Valeur entière entre -999 et 999");
    if(type==="damage")v.damage=Math.max(0,(c.set?0:v.damage)+value);
    else{const key=string(c.key||"bonus",32);v.counters[key]=Math.max(-999,Math.min(999,(c.set?0:Number(v.counters[key]||0))+value));}
    summary=v.name+" : "+type+" "+value;
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
    const stock=type==="draw"?"main":"runes",dst=type==="draw"?"hand":"runes";
    if(p==="ai"){
      for(let i=0;i<n;i++){
        const card=s.decks.ai[stock].shift();if(!card)break;
        place(s,p,card,dst);if(dst==="hand")s.players.ai.handCount++;
      }
      s.players.ai.deckCount=s.decks.ai.main.length;
      s.players.ai.runeCount=s.decks.ai.runes.length;
    } else if(type==="draw")s.players.human.handCount+=n;
    else s.players.human.runeCount=Math.max(0,s.players.human.runeCount-n);
    summary=p+" : "+(type==="draw"?"pioche ":"canalise ")+n+" (sans arbitrage automatique)";
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
  maybeRecord(s,summary);
  return s;
}
export const COMMANDS=["reset","setup-human","setup-ai","start","next-turn","phase","add","move","remove","exhaust","ready","flip","counter","damage","score","hand-count","draw","channel","mulligan","note"];
