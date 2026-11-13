import {createState,applyCommand,PHASES} from "./core.mjs";
import {loadCatalog,importCatalog,searchCards} from "./catalog.mjs";
import {PRECONS,resolvePrecon} from "./precons.mjs";
import {parseNarration} from "./narration.mjs";
import {filteredPickerCards,randomExampleCards,championIdentity,legendSearchName,isChosenChampion} from "./picker.mjs";
import {manualAgentRequest,previewManualActions} from "./manual-bridge.mjs";
import {createVoiceConversation} from "./voice-session.mjs";
import {createLocalVoiceConversation} from "./local-voice.mjs";
import {isChatAtBottom,restoredChatPosition} from "./chat-scrolling.mjs";
import {battlefieldController} from "./battlefield-rules.mjs";
import {previewCombat} from "./combat-engine.mjs";
import {CURRENT_VERSION,MINIMUM_COMPANION_VERSION,DOWNLOAD_URL,companionNeedsUpdate} from "./release-policy.mjs";
const $=id=>document.getElementById(id);
const i18n={
 "Accueil":"Home","Annuler":"Undo","Exporter":"Export","Importer partie":"Import game","Nouvelle partie":"New game",
 "Gestionnaire":"Manager","Ouvrir le gestionnaire":"Open manager",
 "Mise à jour du compagnon nécessaire":"Companion update required",
 "Télécharger la version récente":"Download latest version",
 "Historique":"History","Outils":"Tools","Sans quitter le plateau":"Without leaving the board",
 "Configuration":"Setup","Catalogue":"Card catalog","Agent IA":"AI agent",
 "ADVERSAIRE IA":"AI OPPONENT","TON PLATEAU · CARTES PHYSIQUES":"YOUR BOARD · PHYSICAL CARDS",
 "LÉGENDE":"LEGEND","LEGENDE":"LEGEND","CHAMPION":"CHAMPION","MAIN":"HAND",
 "MAIN PHYSIQUE":"PHYSICAL HAND","RUNES":"RUNES","BASE IA":"AI BASE","BASE JOUEUR":"YOUR BASE",
 "CHAMP DE BATAILLE · JOUEUR":"BATTLEFIELD · PLAYER","CHAMP DE BATAILLE · IA":"BATTLEFIELD · AI",
 "Discussion avec l'IA":"AI chat","Annonce tes actions ou parle à ton adversaire.":"Announce actions or talk to your opponent.",
 "Ton message":"Your message","Passer mon tour":"End turn","Envoyer":"Send","Mode vocal":"Voice mode",
 "L'IA me répond à voix haute":"Speak AI replies aloud","Commandes de plateau manuelles":"Manual board commands",
 "Piocher":"Draw","Canaliser":"Channel","Interpréter le texte en action":"Interpret text as action",
 "Aucune unité en base":"No units in base","Aucune rune placée":"No runes placed",
 "Prêt.":"Ready.","Plein écran":"Fullscreen","Tour suivant":"Next turn",
 "Création de partie":"Set up a game","Installation":"Installation",
 "Copier l'état pour l'IA":"Copy state for AI","Déplacer":"Move","Placer":"Place",
 "Fermer":"Close","Joueur":"Player","Propriétaire":"Owner","Défausse":"Discard",
 "Bannissement":"Banishment","Main":"Hand","Champ de bataille":"Battlefield",
 "Aucune action enregistrée.":"No recorded actions.","Configurer l'accès distant":"Configure remote access",
 "Installer une partie":"Set up a game","Joueur physique":"Physical player",
 "Deck préconstruit":"Preconstructed deck","Mélanger et préparer l'IA":"Shuffle and prepare AI",
 "Catalogue de cartes":"Card catalog","Actualiser":"Refresh","Charger cartes JSON":"Load card JSON",
 "Contrôle par agent":"Agent control","Déconnecter":"Disconnect","Connecter":"Connect",
 "Instructions pour n'importe quel agent":"Instructions for any agent",
 "Activer le plein écran":"Enter fullscreen","Désactiver":"Disable",
 "Envoyer mon message":"Send my message","Passer mon tour":"End turn",
 "Configurer":"Configure","Réduire le panneau historique":"Collapse history"
};
let uiLanguage="fr";
try{uiLanguage=localStorage.getItem("riftbound-language")==="en"?"en":"fr";}catch{}
const originalText=new WeakMap(),originalAttributes=new WeakMap();
function applyUILanguage(){
 document.documentElement.lang=uiLanguage;
 const tree=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let node;
 while((node=tree.nextNode())){
  const host=node.parentElement;
  if(!host||host.closest("script,style,#chat-messages,#live-history-log,.cards,.cardholder,.card-tile,.results,.picker-results,.picker-selected,#notice,#home-feedback,#ai-status,#voice-live-text"))continue;
  const val=node.nodeValue;
  if(!originalText.has(node))originalText.set(node,val);
  const origin=originalText.get(node);
  const trimmed=origin.trim();
  const translation=i18n[trimmed];
  if(!translation)continue;
  const lead=origin.match(/^\s*/)?.[0]||"",trail=origin.match(/\s*$/)?.[0]||"";
  const replacement=uiLanguage==="en"?translation:trimmed;
  const desired=lead+replacement+trail;
  if(val!==desired)node.nodeValue=desired;
 }
 for(const el of document.querySelectorAll("input[placeholder],textarea[placeholder],button[title]")){
  let base=originalAttributes.get(el);
  if(!base){base={placeholder:el.getAttribute("placeholder"),title:el.getAttribute("title")};originalAttributes.set(el,base);}
  for(const attr of ["placeholder","title"]){
   if(!base[attr])continue;
   const translated=i18n[base[attr]];
   if(translated)el.setAttribute(attr,uiLanguage==="en"?translated:base[attr]);
  }
 }
}

// Declare the loopback destination so Chrome/Edge can request the right permission.
// Browsers that do not implement the option simply ignore it.
const localFetchOptions=url=>/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(url)
 ? {targetAddressSpace:"loopback"} : {};
const storage="riftbound-companion-state-v1";
const onboardingStorage="riftbound-onboarding-v1";
let onboarding;
try{onboarding=JSON.parse(localStorage.getItem(onboardingStorage))||{};}catch{onboarding={};}
function saveOnboarding(){try{localStorage.setItem(onboardingStorage,JSON.stringify(onboarding));}catch{}}
let wizardStep=Number.isInteger(onboarding.wizardStep)?Math.max(1,Math.min(4,onboarding.wizardStep)):1;
let state;try{state=JSON.parse(localStorage.getItem(storage))||createState()}catch{state=createState()}
let undo=[],catalog=[],selected=null,relay=null,sse=null,lastSync=0;
let companionGate=null,companionGateBusy=false;
const isLoopbackRelay=url=>/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(url||"");
function openCompanionManager(){
 if(relay?.token&&isLoopbackRelay(relay.url)){
  // A real user gesture opens the authenticated loopback manager.
  // Fragment credentials never reach the web server or external websites.
  window.open(relay.url+"/manager.html#access="+encodeURIComponent(relay.token),
   "_blank","noopener");
  return true;
 }
 showHome();
 wizardStep=1;renderWelcome();
 notify("Connecte d'abord le compagnon Windows pour accéder à son gestionnaire.",true);
 return false;
}
for(const id of ["manager-open","manager-open-play","version-open-manager"]){
 $(id)?.addEventListener("click",openCompanionManager);
}
$("version-download").href=DOWNLOAD_URL;
const save=()=>{try{localStorage.setItem(storage,JSON.stringify(state))}catch{}};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Thumbnail requests reduce bandwidth; full-resolution art remains available in the detail view.
function imageForDisplay(url,large=false){
 if(!url||typeof url!=="string")return "";
 try{
  const u=new URL(url);
  if(["cmsassets.rgpub.io","cdn.sanity.io"].includes(u.hostname)){
    u.searchParams.set("w",large?"640":"180");
    u.searchParams.set("q",large?"86":"70");
    u.searchParams.set("fm","webp");
  }else if(u.hostname==="cdn.piltoverarchive.com"){
    u.searchParams.set("width",large?"640":"180");
  }
  return u.toString();
 }catch{return url;}
}
function notify(message,bad=false){
 $("notice").textContent=message;$("notice").style.color=bad?"#f5a8a3":"#a7d9bd";
 const home=$("home-feedback");
 if(home){home.textContent=message;home.classList.toggle("error",bad);}
}
function cardHTML(c,show=true,large=false){
 if(!c)return '<div class="empty-card">—</div>';
 const faceDown=Boolean(c.faceDown),turned=Boolean(c.exhausted);
 const title=faceDown?(uiLanguage==="en"?"Hidden card":"Carte cachée"):esc(c.name);
 const art=!faceDown&&c.image?'<img loading="lazy" alt="'+title+'" src="'+esc(imageForDisplay(c.image,large))+'" data-fallback="'+esc(imageForDisplay(c.imageFallback,large))+'">':
   '<div class="empty-card">'+title+'</div>';
 const label=show&&!faceDown?'<div class="card-label">'+title+'</div>':'';
 const status=faceDown?' data-card-state="hidden" aria-label="'+title+'"':
  turned?' data-card-state="exhausted" aria-label="'+title+' — exhausted"':
  ' data-card-state="ready" aria-label="'+title+' — ready"';
 const tile='<div class="card-tile '+(c.type?.toLowerCase().includes("battlefield")?"landscape ":"")+
   (turned?"exhausted ":"")+(faceDown?"face-down":"")+'" title="'+title+'" data-uid="'+esc(c.uid||"")+'" data-card-type="'+esc((c.type||"").toLowerCase())+'" data-stunned="'+Boolean(c.stunned||c.counters?.stunned)+'"'+status+'>'+
   '<div class="card-art">'+(faceDown?'<div class="card-back">R</div>':art)+'</div>'+label+
   (c.damage?'<b class="damage">−'+c.damage+'</b>':'')+
   Object.entries(c.counters||{}).filter(([,n])=>n).map(([k,v])=>'<b class="counter">'+esc(k)+': '+esc(v)+'</b>').join("")+
   '</div>';
 return tile;
}
function adjustRuneCards(){
 for(const p of ["human","ai"]){
  const holder=$(p+"-runes"),panel=holder?.closest(".panel");
  if(!panel)continue;
  const runes=state.cards.filter(c=>c.owner===p&&c.zone==="runes");
  const width=holder.clientWidth;
  if(!width||!runes.length)continue;
  const weighted=runes.reduce((n,c)=>n+(c.exhausted?1.3965:1),0);
  const cell=Math.floor((width-12-Math.max(0,runes.length-1)*4)/Math.max(1,weighted));
  const target=Math.max(24,Math.min(64,cell));
  panel.style.setProperty("--game-card-width",target+"px");
  panel.style.setProperty("--playmat-card-height",Math.round(target*1.3965)+"px");
 }
}
window.addEventListener("resize",()=>requestAnimationFrame(adjustRuneCards),{passive:true});
function renderCombatPanel(){
 const panel=$("combat-panel"),battle=state.pendingCombat,attackBtn=$("combat-attack-button");
 if(!panel)return;
 const canAttack=state.started&&state.active==="human"&&state.phase==="Main"&&
  state.cards.some(c=>c.owner==="human"&&c.zone==="base"&&
   /^unit$/i.test(c.type||"")&&!c.exhausted);
 panel.hidden=!battle&&!canAttack;
 attackBtn.hidden=!!battle;attackBtn.disabled=!canAttack;
 $("combat-pass-button").hidden=!battle||battle.passes?.human;
 $("combat-effects-button").hidden=!battle||!battle.warnings?.length||battle.confirmedEffects;
 $("combat-order-button").hidden=!battle;
 if(!battle){
  $("combat-title").textContent=uiLanguage==="en"?"BATTLEFIELDS":"CHAMPS DE BATAILLE";
  $("combat-details").textContent=uiLanguage==="en"?
   "Select ready units to launch a simultaneous attack.":"Déclare un assaut avec plusieurs unités prêtes en une seule action.";
  $("combat-preview").textContent="";
  return;
 }
 $("combat-choices").hidden=true;
 $("combat-title").textContent="⚔ "+(state.battlefields[battle.battlefield]?.card?.name||"Combat");
 let result;
 try{result=previewCombat(state,battle.battlefield,battle.attacker,battle.orders);}
 catch(e){result={ready:false,error:e.message};}
 $("combat-preview").textContent=result.ready?
  result.attackingMight+" Might ATK / "+result.defendingMight+" Might DEF":
  result.error||"Dégâts à vérifier";
 const waiting=battle.passes?.human?
  "Réaction du joueur passée. ":"Réactions possibles : annonce un effet, puis passe. ";
 const risk=(battle.warnings||[]).length?
   "Vérification avant résolution : "+battle.warnings.join(" · "):
   "Attribution des dégâts simultanée, Tank et Backline respectés.";
 const dead=result.ready&&result.dead.length?
  " · "+result.dead.length+" unité(s) seraient vaincues":"";
 $("combat-details").textContent=waiting+risk+dead;
}
function selectCombatTargets(){
 const container=$("combat-choices");
 const units=state.cards.filter(c=>c.owner==="human"&&c.zone==="base"&&
  /^unit$/i.test(c.type||"")&&!c.exhausted);
 if(!units.length){notify("Aucune unité prête dans ta base.",true);return;}
 container.replaceChildren();
 const field=document.createElement("select");field.id="combat-target-field";
 for(const [i,b] of state.battlefields.entries()){
  if(!b.card)continue;
  const option=document.createElement("option");option.value=String(i);
  option.textContent=b.card.name;field.append(option);
 }
 container.append(field);
 for(const unit of units){
  const label=document.createElement("label");label.className="combat-unit-choice";
  const checkbox=document.createElement("input");checkbox.type="checkbox";
  checkbox.value=unit.uid;checkbox.checked=units.length===1;
  label.append(checkbox,document.createTextNode(unit.name+" ("+(unit.might??"?")+" Might)"));
  container.append(label);
 }
 const confirm=document.createElement("button");confirm.type="button";confirm.className="primary";
 confirm.textContent=uiLanguage==="en"?"Declare attack":"Déclarer l'assaut";
 confirm.onclick=()=>{
  const uids=[...container.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
  if(!uids.length){notify("Choisis au moins une unité.",true);return;}
  container.hidden=true;dispatch({type:"combat-attack",player:"human",
   battlefield:Number(field.value),uids});
 };
 container.append(confirm);container.hidden=false;
}
$("combat-attack-button").onclick=selectCombatTargets;
$("combat-pass-button").onclick=()=>dispatch({type:"combat-pass",player:"human"});
$("combat-effects-button").onclick=()=>{
 if(!state.pendingCombat)return;
 const warnings=state.pendingCombat.warnings||[];
 const confirmed=confirm("Les effets de cartes sont-ils réellement résolus ?\\n"+
  warnings.join("\\n")+"\\n\\nConfirme uniquement après avoir appliqué les capacités et réactions.");
 if(confirmed)dispatch({type:"combat-confirm-effects",confirm:true});
};
$("combat-order-button").onclick=()=>{
 const battle=state.pendingCombat;
 if(!battle)return;
 const enemies=state.cards.filter(c=>c.zone==="battlefield"&&
  c.battlefield===battle.battlefield&&c.owner==="ai"&&/^unit$/i.test(c.type||""));
 if(!enemies.length)return;
 const container=$("combat-choices");
 container.replaceChildren();
 const select=document.createElement("select");
 for(const enemy of enemies){
  const option=document.createElement("option");option.value=enemy.uid;
  option.textContent=enemy.name+" ("+(enemy.might??"?")+" Might)";
  select.append(option);
 }
 const confirm=document.createElement("button");confirm.type="button";
 confirm.textContent="Prioriser cette cible";confirm.className="primary";
 confirm.onclick=()=>{
  const uids=[select.value,...enemies.map(x=>x.uid).filter(uid=>uid!==select.value)];
  container.hidden=true;dispatch({type:"combat-order",player:"human",uids});
 };
 container.append(select,confirm);container.hidden=false;
};
let previousCardLocations=new Map();
function render(){
  $("turn").textContent=state.started?(uiLanguage==="en"?"TURN ":"TOUR ")+state.turn+" · "+(state.active==="human"?(uiLanguage==="en"?"PLAYER":"JOUEUR"):"AI")+" · "+state.phase.toUpperCase():(uiLanguage==="en"?"GAME NOT STARTED":"PARTIE NON COMMENCÉE");
  $("phases").innerHTML=PHASES.map(p=>'<button class="phase '+(state.phase===p?"current":"")+'" data-phase="'+p+'">'+p+'</button>').join("");
  for(const p of ["human","ai"]){
    const player=state.players[p];
    $(p+"-score").textContent=player.score+" PV";
    $(p+"-meta").textContent=player.handCount+(uiLanguage==="en"?" in hand":" en main");
    const piles=$(p+"-decks");
    if(piles)piles.innerHTML='<button class="pile" data-pile-owner="'+p+'" data-pile-action="draw" '+((p!==state.active||state.turnActions?.drawn||player.deckCount===0)?"disabled ":"")+'title="Draw / Piocher"><span class="pile-back">R</span><span class="pile-label">DECK · '+(player.deckCount??"?")+'</span></button>'+
      '<button class="pile rune-pile" data-pile-owner="'+p+'" data-pile-action="channel" '+((p!==state.active||state.turnActions?.channeled||player.runeCount===0)?"disabled ":"")+'title="Channel / Canaliser"><span class="pile-back">◇</span><span class="pile-label">RUNES · '+player.runeCount+'</span></button>';
    for(const z of ["legend","champion"]){$(p+"-"+z).innerHTML=cardHTML(state.cards.find(c=>c.owner===p&&c.zone===z)||player[z]);}
    const cards=z=>state.cards.filter(c=>c.owner===p&&c.zone===z);
    $(p+"-hand").innerHTML=p==="human"?
      Array.from({length:Math.min(12,Math.max(0,player.handCount))},(_,i)=>
       cardHTML({uid:"physical-hand-"+i,name:"Carte physique cachée",type:"Unit",faceDown:true},false)).join("")+
       (player.handCount>12?'<span class="hand-extra">+'+(player.handCount-12)+'</span>':""):
      cards("hand").map(c=>cardHTML({...c,faceDown:true},false)).join("")||'<span class="muted">Main vide</span>';
    $(p+"-runes").innerHTML=cards("runes").map(c=>cardHTML(c)).join("")||'<span class="muted">—</span>';
    $(p+"-base").innerHTML=cards("base").map(c=>cardHTML(c)).join("")||'<span class="muted">—</span>';
    $(p+"-trash").innerHTML=cards("trash").slice(-15).map(c=>cardHTML(c)).join("")||'<span class="muted">—</span>';
  }
  state.battlefields.forEach((b,i)=>{
    $("battlefield-name-"+i).textContent=b.card?.name||"À sélectionner";
    const holder=$("field-control-"+i);
    if(holder){
     const controller=battlefieldController(state,i);
     const units=state.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===i);
     const contested=units.some(c=>c.owner==="human")&&units.some(c=>c.owner==="ai");
     holder.dataset.control=controller|| (contested?"contested":"none");
     holder.textContent=controller==="human"?"● JOUEUR":controller==="ai"?"● IA":contested?"● CONTESTÉ":"";
    }
    $("bf-image-"+i).innerHTML=cardHTML(b.card);
    $("units-"+i).innerHTML=state.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===i).map(c=>cardHTML(c)).join("");
  });
  renderCombatPanel();
  const historyEntries=Array.isArray(state.history)?state.history:[];
  const historyHTML=h=>'<li><small>#'+h.revision+' · '+
    new Date(h.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})+
    '</small> '+esc(h.text)+'</li>';

  $("live-history-log").innerHTML=historyEntries.slice(0,60).map(historyHTML).join("")||
    '<li class="history-empty">Aucune action enregistrée.</li>';
  $("live-history-count").textContent=historyEntries.length+" "+(uiLanguage==="en"?"actions":"actions");
  const nextPositions=new Map();
  for(const card of state.cards){
   const where=card.zone+":"+(card.battlefield??"");
   nextPositions.set(card.uid,where);
   if(previousCardLocations.size&&previousCardLocations.get(card.uid)!==where)
    document.querySelectorAll('.board .card-tile[data-uid]').forEach(tile=>{
     if(tile.dataset.uid===card.uid)tile.classList.add("card-transition");
    });
  }
  previousCardLocations=nextPositions;
  requestAnimationFrame(adjustRuneCards);
  save();
  renderWelcome();
  applyUILanguage();
}
async function dispatch(command){
  if(companionGate){
   showHome();wizardStep=1;renderWelcome();
   notify("Compagnon obsolète ou non vérifié : ouvre le gestionnaire pour continuer.",true);
   return false;
  }
  try{
    if(relay){
      const res=await fetch(relay.url+"/api/command",{...localFetchOptions(relay.url),method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+relay.token},body:JSON.stringify(command)});
      const reply=await res.json();if(!res.ok)throw Error(reply.error||"Erreur du relais");
      state=reply.state;lastSync=state.revision;render();
    }else{undo.push(structuredClone(state));undo=undo.slice(-50);state=applyCommand(state,command);render();}
    if(command.type==="reset"||command.type==="start")resetChatView();
    notify(state.message);
    return true;
  }catch(e){notify(e.message,true);return false;}
}
const guess=(query,type)=>{
  const q=query.toLowerCase().trim();
  if(!q)return null;
  const byName=catalog.filter(c=>(!type||c.type.toLowerCase().includes(type))&&(c.name+" "+c.subtitle).toLowerCase()===q);
  return byName[0]||catalog.find(c=>(!type||c.type.toLowerCase().includes(type))&&(c.name+" "+c.subtitle).toLowerCase().includes(q))||null;
};
function cardFromInput(id,type){
  const q=$(id).value.trim();if(!q)return null;
  return guess(q,type)||{code:"manual-"+q.toLowerCase().replace(/\W/g,"-"),name:q,type:type==="legend"?"Legend":type==="battlefield"?"Battlefield":"Unit",image:""};
}
function selectCard(c){
  selected=c;$("detail-name").textContent=c.name;$("detail-text").textContent=c.text||"Aucun texte enregistré.";
  $("detail-image").innerHTML=cardHTML(c,true,true);$("card-dialog").showModal();
}
function showBattlefieldDetails(index){
 const raw=state.battlefields?.[index]?.card;
 if(!raw)return notify("Aucun champ de bataille sélectionné.",true);
 const match=catalog.find(c=>c.code&&c.code===raw.code)||
  catalog.find(c=>c.name?.toLowerCase()===raw.name?.toLowerCase()&&c.type?.toLowerCase().includes("battlefield"));
 const card={...raw,...match,text:match?.text||raw.text||""};
 selectCard(card);
 selected=null;
 $("detail-add").parentElement.hidden=true;
 $("card-dialog").classList.add("battlefield-readonly");
 $("detail-text").textContent=card.text||"Texte de l'effet non disponible dans ce catalogue. Actualise les cartes.";
}
document.addEventListener("keydown",e=>{
 const field=e.target.closest('[data-battlefield-inspect][role="button"]');
 if(field&&(e.key==="Enter"||e.key===" ")){
  e.preventDefault();showBattlefieldDetails(Number(field.dataset.battlefieldInspect));
 }
});
document.addEventListener("click",e=>{
  const field=e.target.closest("[data-battlefield-inspect]");
  if(field){showBattlefieldDetails(Number(field.dataset.battlefieldInspect));return;}
  const tile=e.target.closest(".card-tile");
  if(tile?.dataset.uid){
    const c=state.cards.find(c=>c.uid===tile.dataset.uid);
    if(c&&!(c.zone==="hand"&&c.owner==="ai")){showInstance(c);return;}
  }
  const result=e.target.closest("[data-code]");
  if(result){const c=catalog.find(c=>c.code===result.dataset.code);if(c)selectCard(c);}
  const phase=e.target.closest("[data-phase]");
  if(phase)dispatch({type:"phase",phase:phase.dataset.phase});
});
function showInstance(c) {
  selected=c;$("detail-name").textContent=c.name;$("detail-text").textContent=c.text||"Clique sur les commandes ci-dessous pour changer l'état.";
  $("detail-image").innerHTML=cardHTML(c,true,true);$("detail-owner").value=c.owner;
  $("detail-zone").value=["base","battlefield","hand","trash","banished","runes"].includes(c.zone)?c.zone:"base";
  $("detail-bf").value=String(c.battlefield||0);$("detail-add").textContent="Déplacer";
  let bar=$("detail-card-actions");if(!bar){bar=document.createElement("div");bar.id="detail-card-actions";bar.className="line";$("detail-add").parentElement.after(bar);}
  bar.innerHTML='<button data-action="exhaust">Épuiser</button><button data-action="ready">Redresser</button><button data-action="damage">+1 dégât</button><button data-action="heal">Soigner 1</button><button data-action="stun">Étourdir</button><button data-action="remove">Retirer</button>';
  $("card-dialog").showModal();
}
$("detail-close").onclick=()=>$("card-dialog").close();
$("detail-add").onclick=()=>{
  if(!selected)return;
  const cmd=selected.uid?{type:"move",uid:selected.uid,zone:$("detail-zone").value,battlefield:+$("detail-bf").value}:
    {type:"add",player:$("detail-owner").value,card:selected,zone:$("detail-zone").value,battlefield:+$("detail-bf").value};
  $("card-dialog").close();dispatch(cmd);
};
$("card-dialog").addEventListener("close",()=>{
 const bar=$("detail-card-actions");if(bar)bar.remove();
 $("detail-add").parentElement.hidden=false;
 $("card-dialog").classList.remove("battlefield-readonly");
 $("detail-add").textContent="Placer";
});
$("card-dialog").addEventListener("click",e=>{
  const action=e.target.dataset.action;if(!action||!selected?.uid)return;
  $("card-dialog").close();dispatch({type:action,uid:selected.uid,...(["damage","heal"].includes(action)?{value:1}:{})});
});
function setActiveTab(name){
 const target=$("tab-"+name);
 if(!target)return;
 document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
 document.querySelectorAll(".tabcontent").forEach(t=>t.classList.toggle("hidden",t!==target));
}
// A permanent, viewport-sized workspace during play. Narrow screens show
// one full-size panel at a time rather than squeezing cards below readability.
function selectWorkspacePanel(view){
 if(!["board","history","chat"].includes(view))return;
 const area=$("game-app");
 area.dataset.workspaceView=view;
 for(const b of document.querySelectorAll(".workspace-mobile [data-workspace-view]")){
  b.setAttribute("aria-pressed",String(b.dataset.workspaceView===view));
 }
}
selectWorkspacePanel("board");
for(const control of document.querySelectorAll(".workspace-mobile [data-workspace-view]")){
 control.addEventListener("click",()=>selectWorkspacePanel(control.dataset.workspaceView));
}
const fullscreenButton=$("layout-fullscreen");
fullscreenButton.addEventListener("click",async()=>{
 try{
  if(document.fullscreenElement=== $("game-app"))await document.exitFullscreen();
  else if($("game-app").requestFullscreen)await $("game-app").requestFullscreen();
  else notify("Le plein écran n'est pas disponible dans ce navigateur.",true);
 }catch(e){notify("Le navigateur a refusé le plein écran : "+e.message,true);}
});
document.addEventListener("fullscreenchange",()=>{
 const active=document.fullscreenElement===$("game-app");
 fullscreenButton.textContent=active?"⛶ Quitter le plein écran":"⛶ Plein écran";
 fullscreenButton.setAttribute("aria-label",active?"Quitter le plein écran":"Activer le plein écran");
 fullscreenButton.title=active?"Retour à la fenêtre":"Étendre le plateau sur tout l'écran";
});
function showHome(){document.body.classList.add("home-visible");renderWelcome();window.scrollTo({top:0,behavior:"smooth"});}
function showGame(tab="setup"){
 if(companionGate){
  showHome();wizardStep=1;renderWelcome();
  notify("Termine la vérification ou la mise à jour du compagnon avant de lancer le plateau.",true);
  return;
 }
 setActiveTab(tab);
 document.body.classList.remove("home-visible");
 window.scrollTo({top:0,behavior:"smooth"});
}
$("go-home").onclick=showHome;
for(const tab of document.querySelectorAll(".tab"))tab.onclick=()=>setActiveTab(tab.dataset.tab);
$("setup-human").onclick=()=>{
  const legend=cardFromInput("human-legend-input","legend"),champion=cardFromInput("human-champion-input","unit"),battlefield=cardFromInput("human-battlefield-input","battlefield");
  if(!legend||!champion||!battlefield){notify("Légende, champion et champ de bataille nécessaires.",true);return;}
  dispatch({type:"setup-human",legend,champion,battlefield});
};
$("setup-ai").onclick=()=>{
  try{
    const id=$("precon-select").value;
    const deck=resolvePrecon(catalog,id);
    $("deck-info").textContent=deck.label+" · 40 cartes, 12 runes, 3 terrains · terrain sélectionné : "+deck.battlefield.name+(deck.warning?" · ATTENTION : "+deck.warning:"");
    dispatch({type:"setup-ai",legend:deck.legend,champion:deck.champion,battlefield:deck.battlefield,
      main:deck.main,runes:deck.runes,battlefields:deck.battlefields,
      mainIncludesChampion:true,format:"preconstructed",deckName:deck.label});
  }catch(e){notify(e.message,true);}
};
$("start-human").onclick=()=>dispatch({type:"start",player:"human"});
$("start-ai").onclick=()=>dispatch({type:"start",player:"ai"});
let chatItems=[],chatCursor=0,chatBusy=false,agentLastSeen=null,sendingChat=false;
let chatSession=null,chatFollowBottom=true,chatUnread=false,pendingChatResponse=false;
function updateChatJump(){
 const list=$("chat-messages"),jump=$("chat-jump");
 jump.hidden=!chatUnread||chatFollowBottom||!chatItems.length;
}
$("chat-jump").onclick=()=>{
 const list=$("chat-messages");
 list.scrollTop=list.scrollHeight;
 chatFollowBottom=true;chatUnread=false;updateChatJump();
};
$("chat-messages").addEventListener("scroll",()=>{
 const list=$("chat-messages");
 chatFollowBottom=isChatAtBottom(list);
 if(chatFollowBottom)chatUnread=false;
 updateChatJump();
 },{passive:true});
let voiceController=null,voiceReplyCursor=0;
let messageQueue=Promise.resolve();
let lastVoiceDraft="";
function renderChatStatus(){
 const label=$("chat-connection");
 if(!relay){label.textContent="Serveur déconnecté";label.dataset.status="offline";return;}
 if(integratedAIStatus?.enabled){
  $("chat-typing").hidden=!(integratedAIStatus.processing||pendingChatResponse);
  label.textContent=integratedAIStatus.provider==="free"?
   (integratedAIStatus.processing?"IA gratuite · réfléchit":"IA gratuite · prête"):
   (integratedAIStatus.processing?"IA intégrée · réfléchit":"IA intégrée · prête");
  label.dataset.status="online";return;
 }
 $("chat-typing").hidden=!pendingChatResponse;
 const active=agentLastSeen&&Date.now()-agentLastSeen<30000;
 label.textContent=active?"Activité de l'agent détectée":remoteSession?.url?"Accès IA actif · en attente":"Aucun agent distant actif";
 label.dataset.status=active?"online":remoteSession?.url?"waiting":"offline";
}
function renderChat({newMessages=false}={}){
 const list=$("chat-messages"),before={
  scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight
 };
 const stick=chatFollowBottom&&isChatAtBottom(before);
 const typing=$("chat-typing");
 // Preserve the live typing bubble's DOM identity and animation.
 typing.remove();list.replaceChildren();
 if(!chatItems.length){
  const empty=document.createElement("p");empty.className="chat-empty";
  empty.textContent="Tes messages et les réponses de l'IA apparaîtront ici.";
  list.append(empty);
 }
 for(const m of chatItems.slice(-80)){
  const node=document.createElement("div");
  node.className="chat-bubble "+(m.role==="ai"?"from-ai":"from-human");
  const meta=document.createElement("small");
  meta.textContent=(m.role==="ai"?(uiLanguage==="en"?"AI opponent":"Adversaire IA"):(uiLanguage==="en"?"You":"Toi"))+
   " · "+new Date(m.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const text=document.createElement("p");text.textContent=m.text;node.append(meta,text);list.append(node);
 }
 list.append(typing);
 renderChatStatus();
 const position=restoredChatPosition(before,{scrollHeight:list.scrollHeight,clientHeight:list.clientHeight},
  {stickToBottom:stick||chatItems.length===0});
 list.scrollTop=position;
 if(newMessages&&!stick)chatUnread=true;
 if(stick){chatFollowBottom=true;chatUnread=false;}
 updateChatJump();
}
function resetChatView(){
 chatItems=[];chatCursor=0;chatSession=null;agentLastSeen=null;pendingChatResponse=false;
 chatFollowBottom=true;chatUnread=false;renderChat();
}
async function syncChat(){
 if(chatBusy||!relay)return;
 chatBusy=true;const session=relay;
 try{
  const response=await fetch(session.url+"/api/messages?after="+chatCursor,{
    ...localFetchOptions(session.url),cache:"no-store",headers:{Authorization:"Bearer "+session.token}
  });
  if(!response.ok)throw Error("Messages HTTP "+response.status);
  const result=await response.json();
  if(relay!==session)return;
  if(result.session&&chatSession&&chatSession!==result.session){
   // New game: the server erased its chat and restarted message IDs.
   resetChatView();
  }
  if(result.session)chatSession=result.session;
  agentLastSeen=result.agentSeenAt||null;
  const ids=new Set(chatItems.map(m=>m.id));
  let added=0;
  for(const m of result.messages||[]){
   if(m&&Number.isInteger(m.id)&&!ids.has(m.id)&&["human","ai"].includes(m.role)){
    chatItems.push(m);ids.add(m.id);added++;
    if(m.role==="ai")pendingChatResponse=false;
    // Never read archived replies aloud on reconnect. Speak only new replies
    // that arrived after this voice conversation was explicitly activated.
    if(m.role==="ai"&&voiceController?.state().enabled&&m.id>voiceReplyCursor){
      voiceReplyCursor=m.id;
      voiceController.speak(m.text);
    }
   }
   if(m?.id>chatCursor)chatCursor=m.id;
  }
  chatItems=chatItems.slice(-80);
  if(added||!chatItems.length)renderChat({newMessages:added>0});
  else renderChatStatus();
 }catch{if(relay===session)renderChatStatus();}
 finally{chatBusy=false;}
}
async function sendChatMessage(message){
 const text=String(message||"").trim();
 if(!text)return false;
 if(!relay){notify("Connecte d'abord le serveur pour transmettre ton message à l'IA.",true);return false;}
 try{
  const response=await fetch(relay.url+"/api/messages",{
    ...localFetchOptions(relay.url),method:"POST",
    headers:{"Authorization":"Bearer "+relay.token,"Content-Type":"application/json"},
    body:JSON.stringify({text})
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Message refusé");
  pendingChatResponse=Boolean(integratedAIStatus?.enabled||remoteSession?.url);
  await syncChat();
  renderChatStatus();
  notify("Message transmis au compagnon.");
  return true;
 }catch(e){notify("Message non envoyé : "+e.message,true);return false;}
}
function isTurnAnnouncement(text){
 return /^(?:je\s+)?(?:passe|termine|finis)\s+(?:mon\s+)?tour[\s.!?]*$/i.test(text)||
  /^fin\s+de\s+(?:mon\s+)?tour[\s.!?]*$/i.test(text);
}
// Serialize all voice/text announcements. A slow local model must not cause
// the next recognized utterance to be silently discarded.
function enqueuePlayerAnnouncement(value){
 const text=String(value||"").trim().slice(0,1200);
 if(!text)return Promise.resolve(false);
 const next=messageQueue.then(async()=>{
  // The local server handles turn changes and checks the rules once.
  return sendChatMessage(text);
 });
 messageQueue=next.catch(()=>false);
 return next;
}
async function sendNote(){
 const input=$("notes"),text=input.value.trim();
 if(!text)return;
 $("send-note").disabled=true;
 try{
  const sent=await enqueuePlayerAnnouncement(text);
  if(sent&&input.value.trim()===text){input.value="";lastVoiceDraft="";}
 }finally{$("send-note").disabled=false;}
}
async function passTurn(){
 if(!relay)return notify("Connecte le serveur pour passer le tour à l'IA.",true);
 await enqueuePlayerAnnouncement(uiLanguage==="en"?"I end my turn. Your move.":"Je termine mon tour. À toi de jouer.");
}
$("next-turn").onclick=passTurn;
$("chat-pass-turn").onclick=passTurn;
$("score-plus").onclick=()=>dispatch({type:"score",player:$("who").value,value:1});
$("score-minus").onclick=()=>dispatch({type:"score",player:$("who").value,value:-1});
$("draw").onclick=()=>dispatch({type:"draw",player:$("who").value,count:1});
$("channel").onclick=()=>dispatch({type:"channel",player:$("who").value,count:1});
$("send-note").onclick=sendNote;
$("notes").addEventListener("keydown",event=>{
 if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){
  event.preventDefault();sendNote();
 }
});
function interpretNote(){
 const transcript=$("notes").value.trim();
 if(!transcript)return notify("Écris ou dicte d'abord ton action.",true);
 const parsed=parseNarration(transcript,catalog,state);
 if(!parsed)return notify("Commande locale non reconnue. Envoie-la à l'IA.",true);
 if(parsed.error)return notify(parsed.error,true);
 if(confirm("Appliquer localement cette commande ?\n"+parsed.label))dispatch(parsed.command);
}
$("interpret-note").onclick=interpretNote;
document.addEventListener("click",event=>{
 const pile=event.target.closest("[data-pile-action]");
 if(!pile)return;
 const owner=pile.dataset.pileOwner;
 if(owner!==state.active){notify(uiLanguage==="en"?"Not this player's turn.":"Ce n'est pas le tour de ce joueur.",true);return;}
 const action=pile.dataset.pileAction;
 if(action==="channel"&&state.turnActions?.channeled){notify(uiLanguage==="en"?"Runes already channeled this turn.":"Runes déjà canalisées ce tour.",true);return;}
 if(action==="draw"&&state.turnActions?.drawn){notify(uiLanguage==="en"?"Already drew this turn.":"Pioche normale déjà effectuée.",true);return;}
 const count=action==="channel"?(state.turn===1&&state.active!==(state.firstPlayer||"human")?3:2):1;
 dispatch({type:action,player:owner,count});
});
const collapseButton=$("drawer-collapse"),sidebarKey="riftbound-sidebar-collapsed";
function setSidebarCollapsed(collapsed){
 $("game-app").classList.toggle("history-collapsed",collapsed);
 collapseButton.textContent=collapsed?"▶":"◀";
 collapseButton.setAttribute("aria-expanded",String(!collapsed));
 collapseButton.title=collapsed?"Expand / Déployer":"Collapse / Réduire";
 try{localStorage.setItem(sidebarKey,String(collapsed));}catch{}
}
collapseButton.onclick=()=>setSidebarCollapsed(!$("game-app").classList.contains("history-collapsed"));
try{setSidebarCollapsed(localStorage.getItem(sidebarKey)==="true");}catch{}
const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
const voiceButton=$("voice-note"),voiceIndicator=$("voice-live"),voiceStatus=$("voice-live-text");
const voiceReadReplies=$("voice-read-replies");
let voiceUsingWhisper=false;
const voiceTranscript=$("voice-transcript"),voiceHeard=$("voice-heard");
const voiceTranscriptLabel=$("voice-transcript-label");
const voiceAutoSend=$("voice-auto-send");
try{voiceAutoSend.checked=localStorage.getItem("riftbound-voice-auto-send")!=="false";}catch{voiceAutoSend.checked=true;}
voiceAutoSend.onchange=()=>{
 try{localStorage.setItem("riftbound-voice-auto-send",String(voiceAutoSend.checked));}catch{}
 notify(voiceAutoSend.checked?"Envoi automatique après une pause activé.":"Envoi automatique désactivé : les phrases restent dans le champ de message.");
};
async function handleVoiceTranscript(text){
 displayHeard(text,true);
 const field=$("notes");
 if(!voiceAutoSend.checked){
  field.value=text;lastVoiceDraft=text;
  notify("Phrase entendue : vérifie-la puis appuie sur Envoyer.");
  return true;
 }
 const ok=await enqueuePlayerAnnouncement(text);
 if(ok&&field.value.trim()===text.trim()){
  field.value="";lastVoiceDraft="";
 }
 if(!ok)notify("Phrase reconnue mais non transmise. Vérifie le serveur local.",true);
 return ok;
}
function displayHeard(text,complete=false){
 const heard=String(text||"").trim();
 if(!heard)return;
 voiceTranscript.hidden=false;
 voiceHeard.textContent=heard;
 voiceTranscriptLabel.textContent=complete?
  (uiLanguage==="en"?"Heard · sent":"Entendu · envoyé"):
  (uiLanguage==="en"?"Listening · live transcript":"Micro · transcription en direct");
}
function voiceUI(info){
 const active=Boolean(info.enabled);
 voiceButton.setAttribute("aria-pressed",String(active));
 voiceButton.textContent=active?"■ Couper le micro":"🎙 Mode vocal";
 voiceButton.title=active?"Désactiver la conversation mains libres":"Activer l'écoute continue et l'envoi automatique";
 voiceIndicator.dataset.voiceState=info.phase;
 voiceStatus.textContent=info.detail||(active?"Microphone actif. Parle naturellement.":"Mode vocal éteint.");
}
function showVoiceDraft(transcript){
 const input=$("notes");
 if(!transcript){
  if(lastVoiceDraft&&input.value===lastVoiceDraft)input.value="";
  lastVoiceDraft="";
  return;
 }
 if(!input.value||input.value===lastVoiceDraft){
  input.value=transcript;
  lastVoiceDraft=transcript;
 }
 displayHeard(transcript);
}
voiceController=createVoiceConversation({
 Recognition:SpeechAPI,
 synthesis:window.speechSynthesis||null,
 Utterance:window.SpeechSynthesisUtterance||null,
 onState:voiceUI,
 onPreview:showVoiceDraft,
 onTranscript:handleVoiceTranscript,
 silenceMs:1500,
 restartMs:700
});
voiceController.setSpeechEnabled(voiceReadReplies.checked);
voiceController.setLanguage(uiLanguage);
voiceUI(voiceController.state());
if(!SpeechAPI&&!navigator.mediaDevices?.getUserMedia){
 voiceButton.disabled=true;
 voiceStatus.textContent="Reconnaissance vocale indisponible dans ce navigateur.";
}
voiceButton.onclick=async()=>{
 if(voiceController.state().enabled){
  voiceUsingWhisper=false;
  // A final phrase recognized just before the user clicks "Stop" should
  // still be sent, rather than silently discarded during the delay.
  voiceController.flush();
  voiceController.stop();
  return;
 }
 if(!relay){
  notify("Connecte le programme Windows avant d'activer la conversation vocale.",true);
  return;
 }
 // Initialize the reply cursor with existing chat history, so that opening
 // voice mode doesn't read back previous turns out loud.
 await syncChat();
 voiceReplyCursor=Math.max(chatCursor,...chatItems.map(m=>m.id),0);
 if(!integratedAIStatus?.enabled&&!remoteSession?.url){
  notify("Le micro va fonctionner, mais active ton adversaire IA pour obtenir ses réponses.",true);
 }
 let localReady=false,whisperDisabled=false;
 try{
  const response=await fetch(relay.url+"/api/speech/status",{
   ...localFetchOptions(relay.url),
   headers:{"Authorization":"Bearer "+relay.token},cache:"no-store"
  });
  if(response.ok){
   const current=await response.json();
   whisperDisabled=Boolean(current.installed&&current.enabled===false);
   localReady=Boolean(current.installed&&current.enabled!==false);
  }
 }catch{}
 if(!localReady){
  notify(whisperDisabled?
   "Whisper Small est désactivé depuis le gestionnaire. Réactive-le avant d'ouvrir le micro.":
   "Whisper Small n'est pas installé. Utilise le bouton « Installer IA et Whisper Small ».",true);
  return;
 }
 const useWhisper=true;
 voiceController=createLocalVoiceConversation({
  onState:voiceUI,onPreview:showVoiceDraft,
  onTranscript:handleVoiceTranscript,
  sendAudio:async blob=>{
   const response=await fetch(relay.url+"/api/speech/transcribe",{
    ...localFetchOptions(relay.url),method:"POST",
    headers:{"Authorization":"Bearer "+relay.token,"Content-Type":"audio/wav"},
    body:blob
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Whisper Small n'a pas pu transcrire l'audio.");
   return result;
  }
 });
 voiceController.setSpeechEnabled(voiceReadReplies.checked);
 voiceController.setLanguage(uiLanguage);
 const started=await voiceController.start();
 voiceUsingWhisper=Boolean(started&&useWhisper);
 if(started){voiceTranscript.hidden=true;voiceHeard.textContent="";}
 if(started)notify("Micro Whisper Small activé · parole transcrite uniquement sur ton PC.");
};
voiceReadReplies.onchange=()=>voiceController.setSpeechEnabled(voiceReadReplies.checked);
// The manager may disable Whisper while the browser microphone is listening.
// Close that browser microphone too, rather than silently recording and sending
// audio to an engine that has already been stopped.
let speechLifecycleCheck=false;
setInterval(async()=>{
 if(!voiceUsingWhisper||!relay||!voiceController.state().enabled||speechLifecycleCheck)return;
 speechLifecycleCheck=true;
 try{
  const session=relay;
  const response=await fetch(session.url+"/api/speech/status",{
   ...localFetchOptions(session.url),headers:{"Authorization":"Bearer "+session.token},
   cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  if(response.ok&&relay===session){
   const status=await response.json();
   if(status.enabled===false&&voiceUsingWhisper){
    voiceUsingWhisper=false;voiceController.stop();
    notify("Whisper a été désactivé dans le gestionnaire : le micro local a été coupé.");
   }
  }
 }catch{}finally{speechLifecycleCheck=false;}
},3500);
$("language-select").value=uiLanguage;
$("language-select").addEventListener("change",event=>{
 uiLanguage=event.target.value==="en"?"en":"fr";
 try{localStorage.setItem("riftbound-language",uiLanguage);}catch{}
 voiceController.setLanguage(uiLanguage);
 render();renderChat();
});

document.addEventListener("visibilitychange",()=>voiceController.setHidden(document.hidden));
window.addEventListener("pagehide",()=>voiceController.stop());
setInterval(()=>{if(relay)syncChat();else renderChatStatus();},2500);
setInterval(()=>{if(localAI()&&integratedAIStatus?.enabled)aiQuery();},8000);

$("send-command").onclick=()=>{try{dispatch(JSON.parse($("command-input").value))}catch(e){notify(e.message,true)}};
let integratedAIStatus=null;
const aiModels={openai:"gpt-4.1-mini",ollama:"gpt-oss:20b",lmstudio:"local-model",compatible:""};
const localAI=()=>Boolean(relay?.token&&/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(relay.url));
function aiProviderFields(resetModel=false){
 const provider=$("ai-provider").value;
 $("ai-key-label").hidden=provider==="ollama"||provider==="lmstudio";
 $("ai-endpoint-label").hidden=provider!=="compatible";
 if(resetModel)$("ai-model").value=aiModels[provider]||"";
 $("ai-provider-help").textContent=provider==="openai"?
  "OpenAI API nécessite une clé et une facturation séparées de ChatGPT Plus.":
  provider==="ollama"?"Lance Ollama (localhost:11434) et télécharge un modèle avant de jouer.":
  provider==="lmstudio"?"Charge un modèle et active le serveur de LM Studio (localhost:1234).":
  "Fournisseur HTTPS compatible avec /v1/chat/completions. Vérifie ses tarifs et sa confidentialité.";
}
function aiDisplay(message=""){
 const active=!!integratedAIStatus?.enabled;
 $("ai-disable").disabled=!active;
 $("ai-save").textContent=active?"✓ IA activée · Enregistrer":"Activer l'IA intégrée";
 $("ai-status").textContent=message||(active?
  "✓ IA intégrée "+integratedAIStatus.model+" prête. Écris-lui directement dans la discussion.":
  integratedAIStatus?.configured?"IA enregistrée mais désactivée.":"Configure ton modèle, puis active l'IA.");
 if(integratedAIStatus?.lastError)$("ai-status").textContent+=" · "+integratedAIStatus.lastError;
 // Keep the inline typing bubble inside the message flow.
 if($("chat-typing").hidden!==!(integratedAIStatus?.processing||pendingChatResponse))
  renderChat();
 else renderChatStatus();
}
async function aiQuery(){
 if(!localAI()){integratedAIStatus=null;aiDisplay("Connecte d'abord l'exécutable Windows.");return;}
 try{
  const response=await fetch(relay.url+"/api/ai/status",{...localFetchOptions(relay.url),
   headers:{Authorization:"Bearer "+relay.token}});
  if(!response.ok)throw Error("API indisponible");
  const data=await response.json();integratedAIStatus=data;
  if(data.configured){
   $("ai-provider").value=data.provider;$("ai-model").value=data.model;
   if(data.provider==="compatible")$("ai-endpoint").value=data.endpoint||"";
   $("ai-key").value="";
   $("ai-key").placeholder=data.hasKey?"Clé conservée (champ vide)":"Clé API";
   aiProviderFields();
   if(data.enabled){onboarding.prompt=true;saveOnboarding();}
  }
  aiDisplay();
 }catch(e){aiDisplay("Impossible de lire l'état IA : "+e.message);}
}
async function aiPost(action,settings={}){
 if(!localAI())throw Error("Connecte d'abord le module Windows.");
 const response=await fetch(relay.url+"/api/ai/"+action,{...localFetchOptions(relay.url),
  method:"POST",headers:{Authorization:"Bearer "+relay.token,"Content-Type":"application/json"},
  body:JSON.stringify(settings)});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||"Impossible de configurer l'IA.");
 return data;
}
$("ai-provider").onchange=()=>aiProviderFields(true);
$("ai-save").onclick=async()=>{
 $("ai-save").disabled=true;
 try{
  integratedAIStatus=await aiPost("config",{
   provider:$("ai-provider").value,model:$("ai-model").value.trim(),
   endpoint:$("ai-endpoint").value.trim(),apiKey:$("ai-key").value.trim(),enabled:true
  });
  $("ai-key").value="";
  onboarding.prompt=true;saveOnboarding();aiDisplay();renderWelcome();
  notify("IA intégrée activée : elle recevra tes messages dans le chat.");
  showGame("setup");
 }catch(e){aiDisplay("Impossible d'activer l'IA : "+e.message);notify(e.message,true);}
 finally{$("ai-save").disabled=false;}
};
$("ai-disable").onclick=async()=>{
 try{integratedAIStatus=await aiPost("disable");aiDisplay();notify("IA intégrée désactivée.");}
 catch(e){notify(e.message,true);}
};
$("ai-open-board").onclick=()=>showGame("setup");
aiProviderFields(true);

// One-click free local opponent. All downloads and generation run inside the
// Windows Companion, never through a paid provider or a Cloudflare tunnel.
let knowledgeRequest=null;
async function refreshKnowledgeStatus(){
 const label=$("ai-knowledge-cards");
 if(!localAI()){
  label.textContent="Règles du jeu et fonctionnement du plateau préconfigurés. Connecte l'application pour charger les cartes.";
  return;
 }
 if(knowledgeRequest)return knowledgeRequest;
 const session=relay;
 knowledgeRequest=(async()=>{
  try{
   const response=await fetch(session.url+"/api/ai/reference?q=règles",{
    ...localFetchOptions(session.url),
    headers:{"Authorization":"Bearer "+session.token},
    signal:AbortSignal.timeout(30000),cache:"no-store"
   });
   if(!response.ok)throw Error("référence indisponible");
   const data=await response.json();
   if(relay!==session)return;
   label.textContent="✓ Règles du "+(data.sources?.coreRevision||"09/10/2026")+
    " • "+data.catalogCount+" cartes consultables • Guide du plateau intégré."+
    (data.notice?" Catalogue : "+data.notice:"");
  }catch(e){
   if(relay===session)label.textContent=
    "✓ Mémo de règles et guide du site intégrés. Catalogue complet inaccessible : vérifier la connexion ou les cartes enregistrées.";
  }
 })().finally(()=>{knowledgeRequest=null;});
 return knowledgeRequest;
}
let freeAIInfo=null,freeAILoading=false,speechInfo=null;
const runningPhases=new Set(["checking","engine","extracting","starting","model"]);
function freeReadableBytes(n){
 if(!Number.isFinite(n)||n<=0)return "0 Mo";
 return n>=1024*1024*1024?(n/(1024*1024*1024)).toFixed(1)+" Go":
  Math.round(n/(1024*1024))+" Mo";
}
function renderFreeAI(message=""){
 const info=freeAIInfo;
 const active=Boolean(integratedAIStatus?.enabled&&integratedAIStatus.provider==="free");
 const voiceReady=Boolean(speechInfo?.installed&&speechInfo.enabled!==false);
 const busy=Boolean(freeAILoading||info?.running||runningPhases.has(info?.phase)||speechInfo?.running);
 const complete=active&&voiceReady;
 const button=$("free-ai-install"),stop=$("free-ai-stop"),stage=$("free-ai-stage"),bar=$("free-ai-progress");
 button.disabled=!localAI()||busy||complete;
 button.textContent=busy?"Installation en cours…":complete?"✓ IA et voix prêtes":
  active?"Installer Whisper Small":info?.installed?"Activer IA et voix":"Installer IA et Whisper Small";
 stop.disabled=!active;
 $("free-ai-model").disabled=busy||complete;
 const percent=Number(info?.progress)||0;
 const speechPercent=Number(speechInfo?.progress)||0;
 bar.hidden=!busy;bar.value=Math.min(100,Math.max(0,speechInfo?.running&&!info?.running?speechPercent:percent));
 const amount=info?.total>0?" • "+freeReadableBytes(info.transferred)+
  " / "+freeReadableBytes(info.total):"";
 stage.textContent=message||(
  info?.phase==="error"?"Installation IA interrompue : "+(info.error||"Erreur inconnue")+" · Réessaie avec le même bouton.":
  speechInfo?.phase==="error"?"Installation vocale interrompue : "+(speechInfo.error||"Erreur inconnue")+" · Réessaie avec le même bouton.":
  complete?"✓ Qwen3 4B et Whisper Small sont prêts.":
  speechInfo?.running&&!info?.running?"Whisper Small : "+speechInfo.message+" ("+speechPercent+" %)":
  busy?(info?.message||"Préparation de l'IA gratuite…")+(info?.total?" ("+percent+" %"+amount+")":""):
  active?"✓ Adversaire IA actif. Clique pour terminer l'installation de Whisper Small.":
  !localAI()?"Connecte ton exécutable Windows avant d'installer l'IA et la voix.":
  info?.installed?"IA installée. Clique pour l'activer avec Whisper Small.":
  "Un seul clic installe Qwen3 4B et Whisper Small dans le dossier choisi."
 );
}
async function pollFreeAI(){
 if(!localAI())return;
 try{
  const reply=await fetch(relay.url+"/api/ai/free/status",{
   ...localFetchOptions(relay.url),headers:{"Authorization":"Bearer "+relay.token},cache:"no-store"
  });
  if(!reply.ok)throw Error("Statut du moteur local indisponible");
  const previous=freeAIInfo?.phase;
  freeAIInfo=await reply.json();
  if(previous!==freeAIInfo.phase&&freeAIInfo.phase==="ready"){
   refreshKnowledgeStatus();
   await aiQuery();
   onboarding.prompt=true;saveOnboarding();renderWelcome();
   notify("✓ Ton IA gratuite est installée ! Tu peux jouer sans payer de requêtes.");
  }
  renderFreeAI();
 }catch(e){renderFreeAI("Impossible de lire la progression : "+e.message);}
}
$("free-ai-install").onclick=async()=>{
 if(!localAI()){notify("Connecte le programme Windows depuis l'étape 2.",true);return;}
 if(freeAILoading)return;
 let folder="";
 try{
  const r=await fetch(relay.url+"/api/manager/status",{
   ...localFetchOptions(relay.url),
   headers:{"Authorization":"Bearer "+relay.token},cache:"no-store"
  });
  if(!r.ok)throw Error("Dossier portable introuvable.");
  folder=(await r.json()).path;
 }catch(e){notify(e.message,true);return;}
 if(!confirm("Installer Qwen3 4B (2,5 Go) et Whisper Small (488 Mo) exclusivement dans ce dossier ?\n"+folder))return;
 freeAILoading=true;renderFreeAI();
 try{
  const reply=await fetch(relay.url+"/api/ai/free/install",{
   ...localFetchOptions(relay.url),method:"POST",
   headers:{"Authorization":"Bearer "+relay.token,"Content-Type":"application/json"},
   body:JSON.stringify({model:$("free-ai-model").value,confirmFolder:folder})
  });
  const data=await reply.json();
  if(!reply.ok)throw Error(data.error||"Installation impossible");
  freeAIInfo=data;
  if(data.speech)speechInfo=data.speech;
  renderFreeAI();
 }catch(e){notify(e.message,true);renderFreeAI(e.message);}
 finally{freeAILoading=false;renderFreeAI();}
};
$("free-ai-stop").onclick=async()=>{
 try{
  integratedAIStatus=await aiPost("disable");
  await pollFreeAI();renderFreeAI();
  notify("IA gratuite arrêtée. Les modèles restent sur ton PC pour la prochaine partie.");
 }catch(e){notify(e.message,true);}
};
renderFreeAI();
setInterval(()=>{if(localAI()&&(freeAIInfo?.running||freeAIInfo?.ready))pollFreeAI();},1200);
async function refreshSpeech(){
 if(!localAI())return;
 try{
  const result=await fetch(relay.url+"/api/speech/status",{
   ...localFetchOptions(relay.url),headers:{"Authorization":"Bearer "+relay.token},cache:"no-store"
  });
  if(!result.ok)return;
  speechInfo=await result.json();
  const isBusy=Boolean(speechBusy||speechInfo.running);
  const stage=$("speech-stage"),bar=$("speech-progress");
  stage.textContent=speechInfo.message+(speechInfo.error?" "+speechInfo.error:"")+
   (speechInfo.installed?" · Disponible dans Mode vocal.":"");
  bar.hidden=!isBusy;bar.value=Number(speechInfo.progress)||0;
  renderFreeAI();
 }catch(e){$("speech-stage").textContent="Whisper : "+e.message;}
}
setInterval(()=>{if(localAI())refreshSpeech();},6000);
let remoteSession=null;
let remoteStarting=false;
let remoteCopyArmed=null;
async function checkRemoteSession(){
 if(!relay?.token)return;
 try{
  const data=await requestRemote("status");
  const wasActive=Boolean(remoteSession?.url);
  remoteSession=data.active?data:null;
  updateRemoteUI();
  if(wasActive&&!data.active)notify("L'accès distant IA est terminé.");
 }catch{/* Local module offline; reconnect normally. */}
}
function clearManualPrompt(){
 $("home-prompt-text").value="";
 $("home-prompt-manual").hidden=true;
}
function updateRemoteUI(message=""){
 const button=$("home-start-remote"),stop=$("home-stop-remote"),status=$("home-remote-status");
 const running=Boolean(remoteSession?.url&&remoteSession.agentToken);
 button.disabled=remoteStarting||!relay?.token||running;
 button.textContent=remoteStarting?"Création de l'accès sécurisé…":
  running?"✓ Accès distant activé":"✦ Activer l'accès et copier le prompt IA";
 stop.disabled=!running;
 $("home-remote-ready").hidden=!running;

 if(running){
  $("home-remote-expiry").textContent="Jusqu'à "+new Date(remoteSession.expiresAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 }
 if(message){status.textContent=message;return;}
 status.textContent=running?"● Accès distant actif. Coupe-le après la partie.":
  relay?"Accès distant fermé. Le module est prêt.":"Connecte d'abord l'application locale.";
}
async function requestRemote(path,method="GET"){
 if(!relay?.token||!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(relay.url))
  throw Error("Connecte d'abord le compagnon local.");
 const response=await fetch(relay.url+"/api/remote/"+path,{
  ...localFetchOptions(relay.url),method,
  headers:{"Authorization":"Bearer "+relay.token,"Content-Type":"application/json"},
  body:method==="POST"?"{}":undefined
 });
 let payload={};
 try{payload=await response.json();}catch{}
 if(!response.ok)throw Error(payload.error||"Impossible de lancer l'accès distant.");
 return payload;
}
function agentPromptText(includeAccess=true){
 const connected=includeAccess&&Boolean(remoteSession?.url&&remoteSession?.agentToken);
 const base=connected?remoteSession.url:(relay?.url||"http://127.0.0.1:8787");
 return [
  "Tu es mon adversaire dans une partie physique de Riftbound. Je manipule mes cartes physiques.",
  "Ne me demande jamais de révéler ma main cachée. Attends mes actions orales ou écrites, puis maintiens le plateau visuel à jour.",
  "N'invente pas de cartes ou d'effets : utilise les textes des cartes et consulte les règles officielles pour toute incertitude.",
  connected?"URL HTTPS temporaire de mon plateau : "+base:
    "Le plateau est local : "+base+". Tu ne peux pas l'atteindre depuis un environnement distant sans accès temporaire.",
  connected?"Console web accessible avec un navigateur agent : "+base+"/agent/#access="+encodeURIComponent(remoteSession.agentToken):
    "Aucune console distante n'est activée. Ne prétends pas être connecté.",
  "Si tu as un navigateur interactif, ouvre la console agent pour consulter le plateau et commander les cartes.",
  "API : GET /api/guide, GET /api/state, GET /api/messages?after=0, POST /api/messages {text}, GET /api/catalog?q=..., GET /api/decks, POST /api/command.",
  "La chatbox du joueur envoie ses textes et transcriptions vocales dans GET /api/messages. Relis-la régulièrement en augmentant after avec le dernier id.",
  "Réponds au joueur par POST /api/messages avec le JSON {\"text\":\"Ta réponse\"}, puis utilise POST /api/command pour afficher les déplacements et autres changements réels.",
  "Le bouton « Passer mon tour » fait avancer le plateau et envoie une annonce dans les messages.",
  "Documentation standard de l'API pour les agents compatibles : "+(connected?base+"/openapi.json":"URL distante indisponible"),
  connected?"Authentification de CETTE session : Authorization: Bearer "+remoteSession.agentToken:
    "Aucun jeton temporaire disponible. Propose des commandes JSON au joueur si tu n'as pas d'accès direct.",
  "Si tu es autorisé et capable d'envoyer des requêtes HTTP, commence par GET /api/guide puis GET /api/state. Utilise la console web sinon.",
  "Si l'IA n'est pas configurée, choisis un deck : POST /api/command {\"type\":\"select-precon\",\"id\":\"random\"}.",
  "À chaque changement, annonce les cartes réellement jouées, leurs effets vérifiés, puis envoie les commandes de placement correspondantes.",
  "Ne confonds pas ce compagnon de suivi avec un arbitre automatique complet des règles.",
  "Si ton environnement n'a ni navigateur agent ni outil HTTP, dis-le clairement et donne des commandes à copier manuellement.",
  "N'expose pas ces informations en public et ne les publie pas sur GitHub."
 ].join("\n");
}
function showManualPrompt(text){
 $("home-prompt-text").value=text;
 $("home-prompt-manual").hidden=false;
 $("home-prompt-text").focus({preventScroll:true});
 $("home-prompt-text").select();
}
async function writePrompt(text,armed=null){
 if(armed){
  armed.resolve(new Blob([text],{type:"text/plain"}));
  const result=await armed.write;
  if(result)return true;
 }
 try{
  if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(text);
   return true;
  }
 }catch{}
 try{
  const node=document.createElement("textarea");
  node.value=text;node.readOnly=true;
  node.style.position="fixed";node.style.left="-10000px";
  document.body.appendChild(node);node.select();
  const worked=document.execCommand("copy");node.remove();
  if(worked)return true;
 }catch{}
 return false;
}
function armClipboardOnClick(){
 // Chromium/Edge can preserve the one-click gesture while tunnel creation
 // completes. If it denies permission, the visible manual copy fallback works.
 if(!window.ClipboardItem||!navigator.clipboard?.write)return null;
 let resolve;
 const blob=new Promise(r=>{resolve=r;});
 try{
  const write=navigator.clipboard.write([new ClipboardItem({"text/plain":blob})])
   .then(()=>true).catch(()=>false);
  return {resolve,write};
 }catch{return null;}
}
async function copyAgentPrompt(includeAccess=true,armed=null){
 const text=agentPromptText(includeAccess);
 const copied=await writePrompt(text,armed);
 if(!copied)showManualPrompt(text);
 else clearManualPrompt();
 onboarding.prompt=true;saveOnboarding();renderWelcome();
 notify(copied?
  "Prompt copié. Colle-le dans une conversation privée avec ton IA.":
  "Prompt prêt : sélectionne le texte affiché et copie-le avec Ctrl+C.");
 return copied;
}
$("home-start-remote").onclick=async()=>{
 if(!relay?.token){notify("Connecte d'abord le compagnon Windows.",true);return;}
 // This button itself is the user's opt-in for a time-limited public URL.
 const clipboard=armClipboardOnClick();
 remoteStarting=true;updateRemoteUI();
 try{
  const session=await requestRemote("start","POST");
  if(!session?.url||!session?.agentToken)throw Error("L'accès distant n'est pas prêt.");
  remoteSession=session;remoteStarting=false;
  updateRemoteUI();
  await copyAgentPrompt(true,clipboard);
 }catch(e){
  if(clipboard)clipboard.resolve(new Blob(["L'accès distant n'a pas pu être activé. Aucun jeton n'a été créé."],{type:"text/plain"}));
  remoteStarting=false;remoteSession=null;
  updateRemoteUI("Impossible d'activer l'accès distant : "+e.message);
  notify(e.message,true);
 }
};
$("home-stop-remote").onclick=async()=>{
 if(!remoteSession)return;
 try{
  await requestRemote("stop","POST");
  remoteSession=null;onboarding.prompt=false;saveOnboarding();
  clearManualPrompt();
  updateRemoteUI();renderWelcome();
  notify("✓ Accès à l'IA coupé immédiatement.");
 }catch(e){notify(e.message,true);}
};
$("home-copy-prompt").onclick=()=>copyAgentPrompt(true);
$("home-copy-offline").onclick=()=>{
 showGame("agent");
 document.getElementById("manual-agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});
};
$("home-select-prompt").onclick=()=>{
 const textarea=$("home-prompt-text");textarea.focus();textarea.select();
};
$("open-remote-setup").onclick=()=>{showHome();setWizardStep(4);};
$("copy-agent-prompt").onclick=()=>copyAgentPrompt(true);

// Text-only fallback for agents without a browser or an HTTP connector.
// No console scripts. We never export secret credentials or hidden hands.
let pendingManualActions=null;
const previewBox=$("manual-agent-preview");
function resetManualPreview(message="Aucune réponse importée.",bad=false){
 pendingManualActions=null;
 $("manual-apply").disabled=true;
 previewBox.classList.toggle("is-error",bad);
 previewBox.textContent=message;
}
$("manual-copy-state").onclick=async()=>{
 let request;
 try{request=manualAgentRequest(state);}
 catch(e){notify(e.message,true);return;}
 const copied=await writePrompt(request);
 if(!copied){
  // Browser clipboard permission can be blocked; show/select text locally.
  $("manual-agent-reply").value="";
  const node=$("manual-agent-reply");node.value=request;node.select();
  resetManualPreview("Copie le texte sélectionné avec Ctrl+C, puis efface-le avant de coller la réponse de l'IA.");
  notify("La copie automatique a été refusée : texte sélectionné pour Ctrl+C.");
  return;
 }
 onboarding.prompt=true;saveOnboarding();renderWelcome();
 resetManualPreview("État public copié. Colle-le dans la conversation de l'IA, puis colle ici sa réponse JSON.");
 notify("État public copié. Aucun jeton ou carte cachée inclus.");
};
$("manual-agent-reply").oninput=()=>{
 resetManualPreview("Réponse modifiée. Clique sur « Vérifier les actions ».");
};
$("manual-preview").onclick=()=>{
 try{
  const planned=previewManualActions(state,$("manual-agent-reply").value);
  pendingManualActions=planned;
  $("manual-apply").disabled=false;
  previewBox.classList.remove("is-error");
  previewBox.textContent=(planned.message?planned.message+"\n":"")+
   planned.changes.map((line,i)=>(i+1)+". "+line).join("\n")+
   "\n\n"+planned.commands.length+" commande(s) vérifiée(s). Clique sur « Appliquer au plateau » pour confirmer.";
 }catch(e){resetManualPreview(e.message,true);}
};
$("manual-apply").onclick=async()=>{
 const expected=pendingManualActions;
 if(!expected||expected.revision!==state.revision){
  resetManualPreview("L'état du plateau a changé. Refais vérifier la réponse de l'IA.",true);return;
 }
 $("manual-apply").disabled=true;
 let applied=0;
 for(const cmd of expected.commands){
  const ok=await dispatch({...cmd,ifRevision:state.revision});
  if(!ok){
   resetManualPreview(applied+" commande(s) appliquée(s). La suivante a échoué : actualise l'état avant de poursuivre.",true);
   return;
  }
  applied++;
 }
 pendingManualActions=null;
 $("manual-agent-reply").value="";
 resetManualPreview("✓ "+applied+" commande(s) appliquée(s) au plateau. Copie le nouvel état pour poursuivre.");
 notify(applied+" commande(s) de l'IA appliquée(s).");
};

$("undo").onclick=()=>{if(relay){notify("Annulation seulement en mode navigateur.",true);return;}if(undo.length){state=undo.pop();render();notify("Dernière action annulée.");}};
$("reset").onclick=async()=>{
 if(!confirm("Effacer la partie en cours ?"))return;
 if(await dispatch({type:"reset"})){resetChatView();showHome();}
};
$("export").onclick=()=>{
 const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download="riftbound-partie-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
};
$("import-state").onchange=async e=>{
 try{const v=JSON.parse(await e.target.files[0].text());if(!v.players?.human||!Array.isArray(v.cards))throw Error("Fichier de partie invalide");if(relay)throw Error("Déconnecte le relais avant l'import");undo.push(state);state=v;render();notify("Partie importée.");}
 catch(err){notify(err.message,true)}e.target.value="";
};
function renderCatalog(){
 $("catalog-status").textContent=catalog.length+" cartes chargées · images du CDN Riot avec secours Piltover Archive"+(!catalog.length?" · import JSON ou Internet nécessaire":"");
 const results=searchCards(catalog,$("card-search").value,$("card-type").value,90);
 $("search-results").innerHTML=results.map(c=>'<button class="result" data-code="'+esc(c.code)+'">'+(c.image?'<img loading="lazy" src="'+esc(imageForDisplay(c.image))+'" data-fallback="'+esc(imageForDisplay(c.imageFallback))+'" alt="'+esc(c.name)+'">':'<span class="mini-placeholder">✦</span>')+'<span>'+esc(c.name)+'<small>'+esc(c.subtitle||c.type)+' · '+esc(c.set)+'</small></span></button>').join("");
}
// Network images fail occasionally; try Piltover Archive's CDN only when the official source fails.
document.addEventListener("error",e=>{
 const img=e.target;
 if(!(img instanceof HTMLImageElement))return;
 const next=img.dataset.fallback;
 if(next&&img.src!==next){img.dataset.fallback="";img.src=next;return;}
 img.style.opacity=".3";
 img.alt=img.alt+" (image indisponible)";
},true);
$("card-search").oninput=renderCatalog;$("card-type").onchange=renderCatalog;
$("refresh-cards").onclick=async()=>{try{catalog=await loadCatalog(true);renderCatalog();notify("Catalogue actualisé")}catch(e){notify(e.message,true)}};
$("import-cards").onchange=async e=>{try{catalog=importCatalog(JSON.parse(await e.target.files[0].text()));renderCatalog();notify(catalog.length+" cartes chargées.");}catch(err){notify(err.message,true)}e.target.value="";};
const signalStatus=t=>{$("connection").textContent=t;};
let sseRetry=null;
function disconnect(){
 voiceController?.stop();
 if(sse)sse.close();
 if(sseRetry)clearTimeout(sseRetry);
 sse=null;sseRetry=null;relay=null;signalStatus("● Mode navigateur");
 remoteSession=null;integratedAIStatus=null;freeAIInfo=null;clearManualPrompt();updateRemoteUI();renderFreeAI();
 resetChatView();aiDisplay("Serveur déconnecté.");notify("Relais déconnecté.");renderWelcome();
}
async function syncRelaySnapshot(session){
 if(relay!==session)return;
 try{
  const res=await fetch(session.url+"/api/state",{...localFetchOptions(session.url),headers:{Authorization:"Bearer "+session.token}});
  if(!res.ok)return;
  const fresh=(await res.json()).state;
  if(fresh&&fresh.revision>=lastSync){state=fresh;lastSync=fresh.revision;render();}
 }catch{}
}
async function attachLiveEvents(session){
 if(relay!==session)return;
 // Cloudflare Quick Tunnels do not support SSE. Poll authenticated snapshots instead.
 if(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(session.url)){
   await syncRelaySnapshot(session);
   if(relay!==session)return;
   signalStatus("● Tunnel HTTPS · synchronisation régulière");
   if(sseRetry)clearTimeout(sseRetry);
   sseRetry=setTimeout(()=>attachLiveEvents(session),2300);
   return;
 }
 try{
  const stream=await fetch(session.url+"/api/events-ticket",{...localFetchOptions(session.url),method:"POST",
    headers:{Authorization:"Bearer "+session.token}});
  if(!stream.ok)throw Error("Flux HTTP "+stream.status);
  const {ticket}=await stream.json();
  if(relay!==session)return;
  if(sse)sse.close();
  sse=new EventSource(session.url+"/api/events?ticket="+encodeURIComponent(ticket));
  sse.onmessage=e=>{
   if(relay!==session)return;
   const data=JSON.parse(e.data);
   if(data.shutdown){
    voiceUsingWhisper=false;voiceController.stop();
    disconnect();
    notify("Le compagnon et ses moteurs IA ont été arrêtés depuis le gestionnaire.");
    return;
   }
   if(data.state&&data.state.revision>=lastSync){state=data.state;lastSync=state.revision;render();}
  };
  sse.onopen=()=>signalStatus("● Relais local connecté");
  sse.onerror=()=>{
    if(relay!==session)return;
    sse.close();sse=null;
    signalStatus("● Relais : reconnexion…");
    if(sseRetry)clearTimeout(sseRetry);
    sseRetry=setTimeout(async()=>{await syncRelaySnapshot(session);attachLiveEvents(session);},2200);
  };
 }catch(e){
  if(relay!==session)return;
  signalStatus("● Relais temporairement inaccessible");
  if(sseRetry)clearTimeout(sseRetry);
  sseRetry=setTimeout(async()=>{await syncRelaySnapshot(session);attachLiveEvents(session);},3000);
 }
}
$("disconnect-relay").onclick=disconnect;
function versionGateReason(version,managerStatus){
 if(companionNeedsUpdate(version,MINIMUM_COMPANION_VERSION))
  return {kind:"outdated",installed:version||"?",latest:MINIMUM_COMPANION_VERSION};
 if(managerStatus&&managerStatus.canLaunch===false){
  const kind=managerStatus.mustUpdate||managerStatus.updateState==="outdated"?
   "outdated":managerStatus.updateState==="unavailable"?"unavailable":"checking";
  return {kind,installed:version||CURRENT_VERSION,
   latest:managerStatus.availableVersion||MINIMUM_COMPANION_VERSION,
   error:managerStatus.error||""};
 }
 return null;
}
async function refreshCompanionGate(session=relay){
 if(!session||!isLoopbackRelay(session.url)||companionGateBusy)return;
 companionGateBusy=true;
 try{
  const requestOptions={...localFetchOptions(session.url),cache:"no-store"};
  const [health,managerResponse]=await Promise.all([
   fetch(session.url+"/api/health",requestOptions),
   fetch(session.url+"/api/manager/status",{
    ...requestOptions,headers:{Authorization:"Bearer "+session.token}
   })
  ]);
  if(!health.ok||!managerResponse.ok)return;
  const info=await health.json(),manager=await managerResponse.json();
  if(relay!==session)return;
  const next=versionGateReason(info.version,manager);
  const previous=companionGate;
  companionGate=next;
  if(next){
   if(!previous||previous.kind!==next.kind){
    wizardStep=1;showHome();
   }else if(document.body.classList.contains("home-visible"))renderWelcome();
  }else if(previous)renderWelcome();
 }catch{/* An intermittent local network error is not proof of an old version. */}
 finally{companionGateBusy=false;}
}

async function connectRelay(){
 const url=$("relay-url").value.trim().replace(/\/$/,""),token=$("relay-token").value.trim();
 const local=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
 const quickTunnel=/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(url);
 if(!local&&!quickTunnel){
  notify("URL autorisée : serveur HTTP sur localhost, ou Cloudflare Quick Tunnel HTTPS.",true);return;
 }
 if(quickTunnel&&!confirm("Ce tunnel rend l'API accessible par Internet. Le jeton restera nécessaire pour lire et modifier la partie. Continuer ?"))return;
 try{
  if(relay)disconnect();
  const res=await fetch(url+"/api/state",{...localFetchOptions(url),headers:{Authorization:"Bearer "+token}});
  if(!res.ok)throw Error("Accès refusé au relais");
  state=(await res.json()).state;lastSync=state.revision;relay={url,token};undo=[];render();
  if(local)await refreshCompanionGate(relay);
  resetChatView();syncChat();
  signalStatus("● Relais local connecté");
  attachLiveEvents(relay);
  notify(companionGate?
   "Mise à jour ou vérification nécessaire. Utilise le gestionnaire.":"Relais synchronisé. Ne publie jamais ton jeton.",
   Boolean(companionGate));renderWelcome();
  queueMicrotask(()=>{checkRemoteSession();aiQuery();pollFreeAI();refreshSpeech();refreshKnowledgeStatus();});
  return true;
 }catch(e){disconnect();notify(e.message,true);return false;}
}
$("connect-relay").onclick=connectRelay;

function wizardStatus(){
 return [
  !companionGate&&Boolean(onboarding.installed||onboarding.installSkipped),
  Boolean(relay||onboarding.preview),
  Boolean(state.players?.human?.legend&&state.players?.ai?.legend&&state.started),
  Boolean(onboarding.prompt)
 ];
}
function availableWizardStep(status){
 // A returning user can only resume at the last unlocked step.
 for(let i=0;i<status.length-1;i++)if(!status[i])return i+1;
 return 4;
}
function setWizardStep(index){
 const status=wizardStatus();
 const limit=availableWizardStep(status);
 wizardStep=Math.max(1,Math.min(limit,Math.min(4,Math.max(1,index))));
 onboarding.wizardStep=wizardStep;saveOnboarding();
 renderWelcome();
 const heading=$("welcome-step-"+["one","two","three","four"][wizardStep-1]);
 if(heading){heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true});}
 if(document.body.classList.contains("home-visible"))window.scrollTo({top:0,behavior:"smooth"});
}
function renderWelcome(){
 if(!$("welcome-progress"))return;
 const gate=$("companion-version-gate");
 gate.hidden=!companionGate;
 if(companionGate){
  wizardStep=1;
  const kind=companionGate.kind;
  $("companion-version-title").textContent=kind==="outdated"?
   "Mise à jour du compagnon nécessaire":kind==="checking"?
   "Vérification du compagnon en cours":"Version du compagnon non vérifiée";
  $("companion-version-info").textContent=kind==="outdated"?
   "Compagnon "+companionGate.installed+" détecté · version requise "+
    companionGate.latest+". Ouvre le gestionnaire pour télécharger la mise à jour avant de jouer.":
    kind==="checking"?
    "Le programme consulte les versions officielles. Le plateau ne démarrera pas tant que la vérification n'est pas terminée.":
    "La vérification a échoué ("+(companionGate.error||"réseau indisponible")+
     "). Réessaye ou confirme le mode hors ligne depuis le gestionnaire.";
 }
 const steps=wizardStatus(),limit=availableWizardStep(steps);
 if(wizardStep>limit)wizardStep=limit;
 const count=steps.filter(Boolean).length;
 $("welcome-progress").value=count;
 $("welcome-progress-label").textContent=count+" / 4 validées";
 $("wizard-current-label").textContent="Étape "+wizardStep+" sur 4";
 for(let i=0;i<4;i++){
   $("welcome-progress-"+(i+1)).classList.toggle("done",steps[i]);
   $("welcome-progress-"+(i+1)).classList.toggle("active",wizardStep===i+1);
   const card=document.querySelector('.welcome-step[data-wizard-step="'+(i+1)+'"]');
   if(card){
     card.hidden=wizardStep!==i+1;
     card.setAttribute("aria-hidden",String(wizardStep!==i+1));
     card.classList.toggle("complete",steps[i]);
   }
 }
 updateRemoteUI();
 $("home-installed").checked=Boolean(onboarding.installed);
 const status=$("home-relay-status");
 status.textContent=relay?"✓ Connecté":onboarding.preview?"Mode aperçu":"Non connecté";
 $("home-connection-label").textContent=relay?"✓ Module connecté automatiquement":onboarding.preview?"Aperçu sans serveur":"En attente du module Windows";
 status.classList.toggle("complete",steps[1]);
 $("home-game-status").textContent=steps[2]?"● Partie prête":"À préparer";
 $("home-game-status").classList.toggle("complete",steps[2]);
 $("home-prompt-status").textContent=steps[3]?"✓ Prompt copié":"À copier";
 $("home-prompt-status").classList.toggle("complete",steps[3]);
 $("home-resume").hidden=!state.started||Boolean(companionGate);
 $("home-resume").textContent=state.started?"Reprendre ma partie":"Voir le plateau";

 $("home-back").disabled=wizardStep===1;
 $("home-next").disabled=Boolean(companionGate)||!steps[wizardStep-1];
 $("home-next").textContent=wizardStep===4?"Terminer et ouvrir le plateau →":"Valider et continuer →";
 const prompts=[
   "Lance le fichier .exe puis confirme, ou choisis un aperçu sans installation.",
   "Connecte réellement le serveur, ou choisis le mode aperçu.",
   "Renseigne les trois cartes et clique sur « Créer et démarrer ma partie ».",
   "Autorise l'IA et copie son prompt, ou choisis le mode manuel."
 ];
 $("wizard-next-hint").textContent=steps[wizardStep-1]?
   (wizardStep===4?"Configuration terminée, tu peux rejoindre le plateau.":"Étape validée. Tu peux continuer."):
   prompts[wizardStep-1];
}
$("home-back").onclick=()=>setWizardStep(wizardStep-1);
$("home-next").onclick=()=>{
 const status=wizardStatus();
 if(!status[wizardStep-1]){renderWelcome();return;}
 if(wizardStep===4){showGame(state.started?"history":"setup");return;}
 setWizardStep(wizardStep+1);
};
const pickerKindById={
 "home-human-legend":"legend",
 "home-human-champion":"champion",
 "home-human-battlefield":"battlefield"
};
const pickerSelected=new Map();
const pickerOpen={id:null,results:[],index:0};
const pickerInput=kind=>$("home-human-"+(kind==="battlefield"?"battlefield":kind));
const selectedLegend=()=>pickerSelected.get("home-human-legend")||null;
function hidePicker(id){
 const kind=pickerKindById[id];
 if(!kind)return;
 const panel=$("picker-"+kind+"-results");
 panel.hidden=true;
 $(id).setAttribute("aria-expanded","false");
 $(id).removeAttribute("aria-activedescendant");
 if(pickerOpen.id===id)pickerOpen.id=null;
}
function markPickerSelection(kind,card,advance=true){
 const id="home-human-"+kind;
 pickerSelected.set(id,card);
 const input=$(id);
 const displayName=kind==="legend"?legendSearchName(card):card.name;
 input.value=displayName;
 input.setAttribute("aria-expanded","false");
 const container=$("picker-"+kind+"-selected");
 // Explicit image dimensions protect the layout even if a stale stylesheet is cached.
 const preview=card.image?'<img loading="lazy" decoding="async" width="46" height="64" alt="" src="'+
  esc(imageForDisplay(card.image))+'" data-fallback="'+esc(imageForDisplay(card.imageFallback))+'">':
  '<span class="picker-selected-placeholder" aria-hidden="true">✦</span>';
 container.innerHTML=preview+
  '<div class="picker-selected-copy"><strong>'+esc(displayName)+'</strong><span>'+esc(card.code)+' · '+esc(card.set||card.type)+'</span></div>'+
  '<b class="picker-selected-check" aria-label="Carte choisie">✓</b>';
 container.classList.add("is-selected");
 hidePicker(id);
 if(kind==="legend"){
  pickerSelected.delete("home-human-champion");
  const champion=$("home-human-champion");
  champion.value="";
  champion.disabled=false;
  champion.placeholder="Cherche "+championIdentity(card)+"…";
  const preview=$("picker-champion-selected");
  preview.innerHTML="";preview.classList.remove("is-selected");
  hidePicker("home-human-champion");
  if(advance){
   // Show the selected Legend's compatible champions immediately.
   queueMicrotask(()=>{champion.focus({preventScroll:true});renderPicker("champion","");});
  }
 }else if(kind==="champion"&&advance){
  const battlefield=$("home-human-battlefield");
  if(!pickerSelected.has("home-human-battlefield")){
   queueMicrotask(()=>battlefield.focus({preventScroll:true}));
  }
 }
}
function renderPicker(kind,term=""){
 const id="home-human-"+kind,input=$(id),target=$("picker-"+kind+"-results");
 if(input.disabled){hidePicker(id);return;}
 const legend=kind==="champion"?selectedLegend():null;
 const results=filteredPickerCards(catalog,kind,term,legend,7);
 pickerOpen.id=id;pickerOpen.results=results;pickerOpen.index=0;
 if(!catalog.length){
  target.innerHTML='<div class="picker-empty">Catalogue en cours de chargement…</div>';
 }else if(!results.length){
  target.innerHTML='<div class="picker-empty">'+(kind==="champion"?
  "Aucun champion correspondant dans ce catalogue. Actualise les cartes si nécessaire.":
  "Aucune carte trouvée. Essaie le nom du personnage (ex. Shen, Lillia).")+'</div>';
 }else{
  target.innerHTML=results.map((c,i)=>{
   const preview=c.image?'<img loading="lazy" src="'+esc(imageForDisplay(c.image))+'" data-fallback="'+esc(imageForDisplay(c.imageFallback))+'" alt="">':'<span class="picker-no-image">✦</span>';
   return '<button type="button" class="picker-result '+(i===0?"is-active":"")+'" role="option" aria-selected="'+(i===0)+'" data-index="'+i+'" id="picker-option-'+kind+'-'+i+'">'+preview+
    '<span class="picker-result-text"><strong>'+esc(kind==="legend"?legendSearchName(c):c.name)+'</strong><small>'+esc(c.set||c.type)+' · '+esc(c.code)+'</small></span><span class="picker-result-pick">Choisir</span></button>';
  }).join("");
 }
 target.hidden=false;input.setAttribute("aria-expanded","true");
 if(results.length)input.setAttribute("aria-activedescendant","picker-option-"+kind+"-0");
}
function pickerMove(kind,direction){
 const id="home-human-"+kind,results=pickerOpen.results;
 if(pickerOpen.id!==id||!results.length){renderPicker(kind,$(id).value);return;}
 pickerOpen.index=(pickerOpen.index+direction+results.length)%results.length;
 const target=$("picker-"+kind+"-results");
 for(const button of target.querySelectorAll(".picker-result")){
  const active=Number(button.dataset.index)===pickerOpen.index;
  button.classList.toggle("is-active",active);
  button.setAttribute("aria-selected",String(active));
  if(active)button.scrollIntoView({block:"nearest",behavior:"instant"});
 }
 $(id).setAttribute("aria-activedescendant","picker-option-"+kind+"-"+pickerOpen.index);
}
function initCardPickers(){
 for(const [id,kind] of Object.entries(pickerKindById)){
  const input=$(id),menu=$("picker-"+kind+"-results");
  input.addEventListener("focus",()=>{
   for(const other of Object.keys(pickerKindById))if(other!==id)hidePicker(other);
   renderPicker(kind,input.value);
  });
  input.addEventListener("input",()=>{
   const original=pickerSelected.get(id);
   if(!original||(kind==="legend"?legendSearchName(original):original.name)!==input.value){
    pickerSelected.delete(id);
    const display=$("picker-"+kind+"-selected");
    display.innerHTML="";display.classList.remove("is-selected");
    if(kind==="legend"){
     pickerSelected.delete("home-human-champion");
     $("home-human-champion").value="";
     $("home-human-champion").disabled=true;
     $("picker-champion-selected").innerHTML="";
     $("picker-champion-selected").classList.remove("is-selected");
     hidePicker("home-human-champion");
    }
   }
   renderPicker(kind,input.value);
  });
  input.addEventListener("keydown",event=>{
   if(event.key==="ArrowDown"||event.key==="ArrowUp"){
    event.preventDefault();pickerMove(kind,event.key==="ArrowDown"?1:-1);
   }else if(event.key==="Enter"){
    if(pickerOpen.id===id&&pickerOpen.results[pickerOpen.index]){
     event.preventDefault();markPickerSelection(kind,pickerOpen.results[pickerOpen.index]);
    }
   }else if(event.key==="Escape"){hidePicker(id);}
  });
  menu.addEventListener("click",event=>{
   const option=event.target.closest("button[data-index]");
   if(!option)return;
   const card=pickerOpen.id===id?pickerOpen.results[Number(option.dataset.index)]:null;
   if(card){markPickerSelection(kind,card);}
  });
 }
 document.addEventListener("pointerdown",event=>{
  if(!event.target.closest(".card-search-field"))for(const id of Object.keys(pickerKindById))hidePicker(id);
 });
}
function fillHomeCardSuggestions(){
 if(!catalog.length){$("home-catalog-count").textContent="Catalogue indisponible : réessaye ou importe un fichier JSON depuis Catalogue.";return;}
 const examples=randomExampleCards(catalog);
 const placeholder=(id,card,pre)=>{
  if(!$(id).value&&card)$(id).placeholder=pre+(id==="home-human-legend"?legendSearchName(card):card.name);
 };
 placeholder("home-human-legend",examples.legend,"Ex. ");
 placeholder("home-human-battlefield",examples.battlefield,"Ex. ");
 if(!selectedLegend())$("home-human-champion").placeholder=examples.champion?"Ex. "+examples.champion.name:"Choisis d'abord ta légende…";
 $("home-catalog-count").textContent=catalog.length+" cartes chargées · recherche rapide avec visuels, 7 choix maximum à la fois.";
 const selected={
  legend:state.players?.human?.legend,
  champion:state.players?.human?.champion,
  battlefield:state.battlefields?.[0]?.card
 };
 if(!pickerSelected.size){
  if(selected.legend)markPickerSelection("legend",selected.legend,false);
  if(selected.champion&&isChosenChampion(selected.champion,selected.legend))markPickerSelection("champion",selected.champion,false);
  if(selected.battlefield)markPickerSelection("battlefield",selected.battlefield,false);
 }
}
function homeCard(id,type){
 const chosen=pickerSelected.get(id);
 if(chosen&&(type==="legend"?legendSearchName(chosen):chosen.name)===$(id).value){
  if(type==="champion"&&!isChosenChampion(chosen,selectedLegend()))
   throw Error("Ce champion ne correspond pas à ta légende.");
  return chosen;
 }
 const entered=$(id).value.trim().toLowerCase();
 const matches=filteredPickerCards(catalog,type,entered,type==="champion"?selectedLegend():null,10);
 const exact=matches.find(c=>c.name.toLowerCase()===entered||
  (type==="legend"&&legendSearchName(c).toLowerCase()===entered)||
  c.code.toLowerCase()===entered);
 if(exact){markPickerSelection(type,exact,false);return exact;}
 throw Error("Choisis une carte proposée pour "+(type==="legend"?"ta légende":type==="champion"?"ton champion":"ton champ de bataille")+".");
}
function renderDeckChoices(){
 const ids=["home-ai-deck","precon-select"];
 const groups=new Map();
 for(const deck of PRECONS){
  const set=deck.label.split(" · ")[1]?.split(" (")[0]||"Autres";
  if(!groups.has(set))groups.set(set,[]);
  groups.get(set).push(deck);
 }
 for(const id of ids){
  const el=$(id),previous=el.value;
  el.innerHTML='<option value="random">🎲 Aléatoire parmi les '+PRECONS.length+' decks</option>';
  for(const [group,decks] of groups){
   const optgroup=document.createElement("optgroup");optgroup.label=group;
   for(const deck of decks){const option=document.createElement("option");option.value=deck.id;option.textContent=deck.label.split(" · ")[0]+" · "+deck.label.match(/\(([^)]+)\)/)?.[1];optgroup.append(option);}
   el.append(optgroup);
  }
  el.value=[...el.options].some(o=>o.value===previous)?previous:"random";
 }
 renderDeckPreview();
}
function renderDeckPreview(){
 const id=$("home-ai-deck").value,target=$("home-deck-preview");
 if(id==="random"){
  target.textContent="🎲 L'IA choisira un deck complet au hasard parmi "+PRECONS.length+" listes préconstruites.";
  return;
 }
 const deck=PRECONS.find(p=>p.id===id);
 if(!deck){target.textContent="Deck introuvable.";return;}
 const size=deck.main.reduce((sum,[,qty])=>sum+qty,0);
 target.textContent=deck.label+" · "+size+" cartes, "+deck.runes.reduce((sum,[,qty])=>sum+qty,0)+" runes, "+deck.battlefields.length+" terrains. "+(deck.warning||"");
}
$("home-ai-deck").addEventListener("change",renderDeckPreview);
initCardPickers();
$("home-installed").onchange=e=>{
 onboarding.installed=e.target.checked;
 if(e.target.checked){onboarding.installSkipped=false;}
 else{onboarding.installSkipped=false;}
 saveOnboarding();renderWelcome();
};
$("home-skip-install").onclick=()=>{
 if(!onboarding.installed){
   onboarding.installSkipped=true;
   onboarding.preview=true;
 }
 saveOnboarding();
 setWizardStep(2);
 notify("Mode aperçu sélectionné. Aucun serveur n'est requis pour voir le plateau, mais une IA distante ne pourra pas le piloter.");
};
$("home-download").onclick=()=>notify("Téléchargement du .exe Windows. Double-clique sur ce seul fichier : il ouvre ton plateau local automatiquement.");
$("home-connect").onclick=async()=>{
 $("relay-url").value=$("home-server-url").value.trim();
 $("relay-token").value=$("home-server-token").value.trim();
 const ok=await connectRelay();
 if(ok){onboarding.preview=false;saveOnboarding();renderWelcome();notify("Connexion au module local confirmée.");}
};
$("home-preview").onclick=()=>{
 onboarding.preview=true;saveOnboarding();renderWelcome();
 notify("Mode aperçu activé. Une IA extérieure ne pourra pas piloter la table sans serveur.");
};
$("home-advanced-setup").onclick=()=>showGame("setup");
$("home-resume").onclick=()=>showGame("setup");

$("home-copy-prompt").onclick=async()=>{
 const ok=await copyAgentPrompt();
 if(ok)notify("Instructions copiées. Colle-les dans la conversation avec l'IA de ton choix.");
};
$("home-create-game").onclick=async()=>{
 const button=$("home-create-game");
 if(button.disabled)return;
 try{
  if(catalog.length<20)throw Error("Le catalogue n'est pas chargé. Réessaie après le chargement ou importe le JSON dans Catalogue.");
  const legend=homeCard("home-human-legend","legend");
  const champion=homeCard("home-human-champion","champion");
  const battlefield=homeCard("home-human-battlefield","battlefield");
  const deck=resolvePrecon(catalog,$("home-ai-deck").value);
  if(state.started&&!confirm("Remplacer la partie en cours par une nouvelle partie ?"))return;
  button.disabled=true;button.textContent="Création en cours…";
  if(!await dispatch({type:"reset"}))return;
  if(!await dispatch({type:"setup-human",legend,champion,battlefield}))return;
  if(!await dispatch({type:"setup-ai",legend:deck.legend,champion:deck.champion,battlefield:deck.battlefield,
   main:deck.main,runes:deck.runes,battlefields:deck.battlefields,
   mainIncludesChampion:true,format:"preconstructed",deckName:deck.label}))return;
  if(!await dispatch({type:"start",player:$("home-first-player").value}))return;
  $("human-legend-input").value=legend.name;
  $("human-champion-input").value=champion.name;
  $("human-battlefield-input").value=battlefield.name;
  $("precon-select").value=$("home-ai-deck").value;
  renderWelcome();
  notify("Partie créée ! Deck IA : "+deck.label+(deck.warning?" · "+deck.warning:"")+". Tu peux maintenant copier le prompt puis ouvrir le plateau.");
 }catch(e){notify(e.message,true);}
 finally{button.disabled=false;button.textContent="Créer et démarrer ma partie";}
};
// The Windows single-file app opens this page with a one-time login token
// in the URL fragment (never sent to the server), which is consumed immediately.
async function autoBootstrapCompanion(){
 if(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(location.origin))return;
 const key="riftbound-local-connection-v1";
 let localToken="";
 if(location.hash.startsWith("#companion=")){
   try{localToken=decodeURIComponent(location.hash.slice("#companion=".length));}catch{}
   history.replaceState(null,"",location.pathname+location.search);
   if(localToken)try{sessionStorage.setItem(key,localToken);}catch{}
 }else{
   try{localToken=sessionStorage.getItem(key)||"";}catch{}
 }
 if(!localToken)return;
 $("relay-url").value=location.origin;
 $("relay-token").value=localToken;
 $("home-server-url").value=location.origin;
 $("home-server-token").value=localToken;
 const ok=await connectRelay();
 if(ok){
   onboarding.installed=true;
   onboarding.installSkipped=false;
   onboarding.preview=false;
   wizardStep=companionGate?1:3;onboarding.wizardStep=wizardStep;
   saveOnboarding();renderWelcome();
   if(!companionGate)notify("Application Windows connectée automatiquement. Configure maintenant ta partie.");
 }else{
   try{sessionStorage.removeItem(key);}catch{}
   notify("Connexion automatique impossible. Relance le compagnon Windows.",true);
 }
}
// When the user downloads and launches the EXE from GitHub Pages, pair to the
// ALREADY OPEN tab. No navigation, window.open, or replacement page is needed.
const hostedPage=location.origin==="https://nitarii.github.io"&&
  /^\/Riftbound(?:\/|$)/i.test(location.pathname);
let pairingInProgress=false;
let companionPairTimer=null;
let permissionState="unknown";
let permissionStatusObject=null;
let lastPermissionError="";
const localCompanionURL="http://127.0.0.1:8787";

function permissionMessage(message,problem=false){
 const target=$("home-permission-state");
 target.textContent=message;
 target.classList.toggle("error",problem);
 $("home-permission-help").hidden=!problem;
}
async function queryLoopbackPermission(){
 if(!hostedPage)return "granted";
 if(!navigator.permissions?.query)return "unknown";
 try{
  // Chrome 145+ uses the granular loopback permission. Never use the old
  // 'local-network-access' alias (it can crash older Chrome renderers).
  permissionStatusObject=await navigator.permissions.query({name:"loopback-network"});
  permissionStatusObject.onchange=()=>{
   permissionState=permissionStatusObject.state;
   if(permissionState==="granted")lastPermissionError="";
   refreshBrowserPermissionUI();
   if(permissionState==="granted"&&!relay)pairExistingHostedTab(false);
  };
  return permissionStatusObject.state;
 }catch{return "unknown";}
}
function refreshBrowserPermissionUI(){
 const button=$("home-allow-local");
 if(relay){
  lastPermissionError="";
  button.disabled=true;button.textContent="✓ Connexion autorisée";
  permissionMessage("Le navigateur est autorisé et le serveur est connecté.");
  $("home-permission-help").hidden=true;
 }else if(permissionState==="denied"){
  button.disabled=false;button.textContent="Réessayer la connexion";
  permissionMessage("L'accès au serveur local est bloqué dans les paramètres de ce site.",true);
 }else if(lastPermissionError){
  button.disabled=false;button.textContent="Réessayer l'autorisation";
  permissionMessage(lastPermissionError,true);
 }else if(permissionState==="granted"){
  button.disabled=false;button.textContent="Reconnecter mon compagnon";
  permissionMessage("Autorisation accordée. Lance le fichier .exe s'il n'est pas déjà ouvert.");
 }else{
  button.disabled=false;button.textContent="Autoriser la connexion locale";
  permissionMessage("Lance le programme Windows puis clique ici. Chrome ou Edge peut afficher une autorisation.");
 }
}
async function pairExistingHostedTab(userInitiated=false){
 if(!hostedPage||relay||pairingInProgress)return false;
 // Critical: do not trigger the browser's permission prompt automatically.
 // The first request must come directly from the user's click.
 if(!userInitiated&&permissionState!=="granted")return false;
 pairingInProgress=true;
 const button=$("home-allow-local");
 if(userInitiated){lastPermissionError="";button.disabled=true;button.textContent="Connexion en cours…";}
 try{
  const health=await fetch(localCompanionURL+"/api/health",{
   ...localFetchOptions(localCompanionURL),cache:"no-store",signal:AbortSignal.timeout(3500)
  });
  if(!health.ok)throw Error("Le serveur local n'a pas répondu.");
  const details=await health.json();
  if(!details.ok||details.name!=="Riftbound Companion")throw Error("Ce port n'héberge pas Riftbound Companion.");
  const reply=await fetch(localCompanionURL+"/api/pair",{
   ...localFetchOptions(localCompanionURL),
   method:"POST",
   headers:{"Content-Type":"application/json","X-Riftbound-Pair":"1"},
   body:"{}",cache:"no-store",signal:AbortSignal.timeout(3500)
  });
  if(!reply.ok)throw Error("L'association sécurisée a été refusée.");
  const session=await reply.json();
  if(!session.token||!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.baseUrl))throw Error("Réponse du module incorrecte.");
  $("relay-url").value=session.baseUrl;
  $("relay-token").value=session.token;
  $("home-server-url").value=session.baseUrl;
  $("home-server-token").value=session.token;
  const ok=await connectRelay();
  if(!ok)throw Error("La connexion authentifiée au module a échoué.");
  try{sessionStorage.setItem("riftbound-local-connection-v1",session.token);}catch{}
  onboarding.installed=true;
  onboarding.installSkipped=false;
  onboarding.preview=false;
  permissionState="granted";
  wizardStep=3;
  onboarding.wizardStep=3;
  saveOnboarding();renderWelcome();
  notify("✓ Compagnon connecté dans cet onglet : aucune autre page nécessaire.");
  if(companionPairTimer){clearInterval(companionPairTimer);companionPairTimer=null;}
  return true;
 }catch(e){
  if(userInitiated){
   permissionState=await queryLoopbackPermission();
   const blocked=permissionState==="denied";
   lastPermissionError=blocked
    ?"Ton navigateur bloque l'accès au serveur local. Autorise l'accès au réseau local/bouclage dans les paramètres du site."
    :"Impossible de contacter le compagnon. Vérifie que le .exe est ouvert, puis réessaie. "+e.message;
   permissionMessage(lastPermissionError,true);
   notify("Connexion locale impossible : "+(blocked?"autorisation refusée.":"programme arrêté ou accès refusé."),true);
  }
  return false;
 }finally{pairingInProgress=false;refreshBrowserPermissionUI();}
}
$("home-allow-local").addEventListener("click",()=>{
 // Initiate fetch in the same user gesture to make the native permission prompt
 // eligible in Chromium. Never simulate the prompt with a fake dialog.
 pairExistingHostedTab(true);
});
async function watchForLocalCompanion(){
 if(!hostedPage){
  $("home-allow-local").disabled=true;
  $("home-allow-local").textContent="Connexion depuis le programme local";
  permissionMessage("Cette page locale n'a pas besoin d'autorisation réseau supplémentaire.");
  return;
 }
 permissionState=await queryLoopbackPermission();
 refreshBrowserPermissionUI();
 // If permission was already granted, background reconnection is appropriate.
 // Otherwise wait for an explicit click to avoid intrusive prompts.
 if(permissionState==="granted")pairExistingHostedTab(false);
 companionPairTimer=setInterval(()=>{
  if(!relay&&permissionState==="granted")pairExistingHostedTab(false);
 },2400);
}

render();
renderChat();
renderWelcome();
renderDeckChoices();
updateRemoteUI();
setInterval(()=>{if(relay?.token&&remoteSession)checkRemoteSession();},15000);
setInterval(()=>{if(relay&&isLoopbackRelay(relay.url))refreshCompanionGate(relay);},6500);
autoBootstrapCompanion();
watchForLocalCompanion();
loadCatalog().then(cards=>{catalog=cards;renderCatalog();fillHomeCardSuggestions();}).catch(e=>{
 $("catalog-status").textContent=e.message;
 $("home-catalog-count").textContent="Impossible de charger les cartes : "+e.message;
});
