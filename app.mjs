import {createState,applyCommand,PHASES} from "./core.mjs";
import {loadCatalog,importCatalog,searchCards} from "./catalog.mjs";
import {PRECONS,resolvePrecon} from "./precons.mjs";
import {parseNarration} from "./narration.mjs";
const $=id=>document.getElementById(id);
const storage="riftbound-companion-state-v1";
const onboardingStorage="riftbound-onboarding-v1";
let onboarding;
try{onboarding=JSON.parse(localStorage.getItem(onboardingStorage))||{};}catch{onboarding={};}
function saveOnboarding(){try{localStorage.setItem(onboardingStorage,JSON.stringify(onboarding));}catch{}}
let wizardStep=Number.isInteger(onboarding.wizardStep)?Math.max(1,Math.min(4,onboarding.wizardStep)):1;
let state;try{state=JSON.parse(localStorage.getItem(storage))||createState()}catch{state=createState()}
let undo=[],catalog=[],selected=null,relay=null,sse=null,lastSync=0;
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
function cardHTML(c,show=true,large=false) {
  if(!c)return '<div class="empty-card">Non défini</div>';
  const title=esc(c.name),img=c.image?'<img loading="lazy" alt="'+title+'" src="'+esc(imageForDisplay(c.image,large))+'" data-fallback="'+esc(imageForDisplay(c.imageFallback,large))+'">':'<div class="empty-card">'+title+'</div>';
  return '<div class="card-tile '+(c.type?.toLowerCase().includes("battlefield")?"landscape ":"")+(c.exhausted?"exhausted ":"")+(c.faceDown?"face-down":"")+'" title="'+title+'" data-uid="'+esc(c.uid||"")+'">'+(c.faceDown?'<div class="card-back">R</div>':img)+'<div class="card-label">'+(show?title:"")+'</div>'+(c.damage?'<b class="damage">−'+c.damage+'</b>':'')+Object.entries(c.counters||{}).filter(([,n])=>n).map(([k,v])=>'<b class="counter">'+esc(k)+': '+esc(v)+'</b>').join("")+'</div>';
}
function render(){
  $("turn").textContent=state.started?"TOUR "+state.turn+" · "+(state.active==="human"?"JOUEUR":"IA")+" · "+state.phase.toUpperCase():"PARTIE NON COMMENCÉE";
  $("phases").innerHTML=PHASES.map(p=>'<button class="phase '+(state.phase===p?"current":"")+'" data-phase="'+p+'">'+p+'</button>').join("");
  for(const p of ["human","ai"]){
    const player=state.players[p];
    $(p+"-score").textContent=player.score+" PV";
    $(p+"-meta").textContent=player.handCount+" en main · "+(player.deckCount??"?")+" deck · "+player.runeCount+" runes restantes";
    for(const z of ["legend","champion"]){$(p+"-"+z).innerHTML=cardHTML(state.cards.find(c=>c.owner===p&&c.zone===z)||player[z]);}
    const cards=z=>state.cards.filter(c=>c.owner===p&&c.zone===z);
    $(p+"-hand").innerHTML=p==="human"?'<span class="physical">'+player.handCount+' cartes physiques non révélées</span>':cards("hand").map(c=>cardHTML({...c,faceDown:true},false)).join("")||'<span class="muted">Main vide</span>';
    $(p+"-runes").innerHTML=cards("runes").map(c=>cardHTML(c)).join("")||'<span class="muted">Aucune rune placée</span>';
    $(p+"-base").innerHTML=cards("base").map(c=>cardHTML(c)).join("")||'<span class="muted">Aucune unité en base</span>';
  }
  state.battlefields.forEach((b,i)=>{
    $("battlefield-name-"+i).textContent=b.card?.name||"À sélectionner";
    $("bf-image-"+i).innerHTML=cardHTML(b.card);
    $("units-"+i).innerHTML=state.cards.filter(c=>c.zone==="battlefield"&&c.battlefield===i).map(c=>cardHTML(c)).join("");
  });
  $("history-log").innerHTML=state.history.map(h=>'<li><small>#'+h.revision+' · '+new Date(h.at).toLocaleTimeString("fr-FR")+'</small> '+esc(h.text)+'</li>').join("");
  save();
  renderWelcome();
}
async function dispatch(command){
  try{
    if(relay){
      const res=await fetch(relay.url+"/api/command",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+relay.token},body:JSON.stringify(command)});
      const reply=await res.json();if(!res.ok)throw Error(reply.error||"Erreur du relais");
      state=reply.state;lastSync=state.revision;render();
    }else{undo.push(structuredClone(state));undo=undo.slice(-50);state=applyCommand(state,command);render();}
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
document.addEventListener("click",e=>{
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
  bar.innerHTML='<button data-action="exhaust">Épuiser</button><button data-action="ready">Redresser</button><button data-action="damage">+1 dégât</button><button data-action="remove">Retirer</button>';
  $("card-dialog").showModal();
}
$("detail-close").onclick=()=>$("card-dialog").close();
$("detail-add").onclick=()=>{
  if(!selected)return;
  const cmd=selected.uid?{type:"move",uid:selected.uid,zone:$("detail-zone").value,battlefield:+$("detail-bf").value}:
    {type:"add",player:$("detail-owner").value,card:selected,zone:$("detail-zone").value,battlefield:+$("detail-bf").value};
  $("card-dialog").close();dispatch(cmd);
};
$("card-dialog").addEventListener("close",()=>{const bar=$("detail-card-actions");if(bar)bar.remove();$("detail-add").textContent="Placer";});
$("card-dialog").addEventListener("click",e=>{
  const action=e.target.dataset.action;if(!action||!selected?.uid)return;
  $("card-dialog").close();dispatch({type:action,uid:selected.uid,...(action==="damage"?{value:1}:{})});
});
function setActiveTab(name){
 const target=$("tab-"+name);
 if(!target)return;
 document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
 document.querySelectorAll(".tabcontent").forEach(t=>t.classList.toggle("hidden",t!==target));
}
function showHome(){document.body.classList.add("home-visible");renderWelcome();window.scrollTo({top:0,behavior:"smooth"});}
function showGame(tab="setup"){setActiveTab(tab);document.body.classList.remove("home-visible");window.scrollTo({top:0,behavior:"smooth"});}
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
    $("deck-info").textContent=deck.label+" · 40 cartes, 12 runes, 3 terrains · choisi aléatoirement : "+deck.battlefield.name;
    dispatch({type:"setup-ai",legend:deck.legend,champion:deck.champion,battlefield:deck.battlefield,
      main:deck.main,runes:deck.runes,battlefields:deck.battlefields,
      mainIncludesChampion:true,format:"preconstructed",deckName:deck.label});
  }catch(e){notify(e.message,true);}
};
$("start-human").onclick=()=>dispatch({type:"start",player:"human"});
$("start-ai").onclick=()=>dispatch({type:"start",player:"ai"});
$("next-turn").onclick=()=>dispatch({type:"next-turn"});
$("score-plus").onclick=()=>dispatch({type:"score",player:$("who").value,value:1});
$("score-minus").onclick=()=>dispatch({type:"score",player:$("who").value,value:-1});
$("draw").onclick=()=>dispatch({type:"draw",player:$("who").value,count:1});
$("channel").onclick=()=>dispatch({type:"channel",player:$("who").value,count:1});
$("send-note").onclick=()=>{if($("notes").value.trim())dispatch({type:"note",text:$("notes").value.trim()});$("notes").value="";};
function interpretNote(auto=false){
 const transcript=$("notes").value.trim();
 if(!transcript)return notify("Écris ou dicte d'abord ton action.",true);
 const parsed=parseNarration(transcript,catalog,state);
 if(!parsed)return notify("Action non reconnue. Utilise Ajouter au journal ou précise la carte et sa zone.",true);
 if(parsed.error)return notify(parsed.error,true);
 if(!auto&&!confirm("Confirmer la modification du plateau ?\n"+parsed.label))return;
 $("notes").value="";
 dispatch(parsed.command);
}
$("interpret-note").onclick=()=>interpretNote(false);

const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SpeechAPI){$("voice-note").disabled=true;$("voice-note").title="Reconnaissance vocale non disponible sur ce navigateur";}
else {
 let recognizer=null,recording=false;
 $("voice-note").onclick=()=>{
   if(recording&&recognizer){recognizer.stop();return;}
   recognizer=new SpeechAPI();recognizer.lang="fr-FR";recognizer.interimResults=false;recognizer.continuous=false;
   recognizer.onresult=e=>{const transcript=Array.from(e.results).map(r=>r[0]?.transcript||"").join(" ").trim();$("notes").value=[$("notes").value.trim(),transcript].filter(Boolean).join(" ");if($("voice-auto").checked)interpretNote(true);else notify("Dictée ajoutée. Vérifie puis clique sur Interpréter & placer.");};
   recognizer.onerror=e=>notify("Dictée indisponible : "+e.error,true);
   recognizer.onend=()=>{recording=false;$("voice-note").textContent="🎙 Dicter une action";};
   try{recognizer.start();recording=true;$("voice-note").textContent="■ Terminer la dictée";}catch(e){notify(e.message,true);}
 };
}

$("send-command").onclick=()=>{try{dispatch(JSON.parse($("command-input").value))}catch(e){notify(e.message,true)}};
async function copyAgentPrompt(){
 const base=relay?.url||"http://127.0.0.1:8787";
 const prompt=[
   "Tu es mon adversaire dans une partie physique de Riftbound. Je manipule mes cartes physiques.",
   "Ne réclame pas ma main cachée. Attends mes déclarations de jeu oralement ou par écrit.",
   "Ne suppose jamais l'existence d'une carte ou la résolution d'un effet que tu n'as pas vérifié dans les règles officielles.",
   "Tu peux consulter l'état du plateau via le relais local "+base+" (si ton environnement informatique y a accès).",
   "Endpoints: GET /api/guide, GET /api/state, GET /api/catalog?q=..., POST /api/command.",
   "Chaque requête nécessite l'en-tête Authorization: Bearer <JETON_LOCAL>.",
   "Demande-moi le jeton via un canal privé approprié si tu en as besoin; ne le révèle jamais et ne le poste jamais sur GitHub.",
   "Commence par GET /api/guide puis GET /api/state. Si l'IA n'est pas configurée, sélectionne un deck préconstruit avec POST /api/command {\"type\":\"select-precon\",\"id\":\"random\"}.",
   "Annonce tes actions avec les noms, textes et effets précis des cartes, puis synchronise chaque changement sur le plateau.",
   "Si tu n'as pas d'outil HTTP capable d'accéder au relais, donne-moi simplement les commandes JSON à coller dans l'onglet Agent IA.",
   "Utilise le jeu comme compagnon de table, pas comme un logiciel d'arbitrage automatique."
 ].join("\n");
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(prompt);
  else{
   const helper=document.createElement("textarea");helper.value=prompt;helper.setAttribute("readonly","");
   helper.style.position="fixed";helper.style.left="-10000px";document.body.appendChild(helper);
   helper.select();const ok=document.execCommand("copy");helper.remove();
   if(!ok)throw Error("Le navigateur a refusé la copie");
  }
  onboarding.prompt=true;saveOnboarding();renderWelcome();
  notify("Prompt IA copié, sans jeton privé.");return true;
 }catch(e){notify("Copie impossible : "+e.message,true);return false;}
}
$("copy-agent-prompt").onclick=copyAgentPrompt;

$("undo").onclick=()=>{if(relay){notify("Annulation seulement en mode navigateur.",true);return;}if(undo.length){state=undo.pop();render();notify("Dernière action annulée.");}};
$("reset").onclick=async()=>{
 if(!confirm("Effacer la partie en cours ?"))return;
 if(await dispatch({type:"reset"}))showHome();
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
 if(sse)sse.close();
 if(sseRetry)clearTimeout(sseRetry);
 sse=null;sseRetry=null;relay=null;signalStatus("● Mode navigateur");
 notify("Relais déconnecté.");renderWelcome();
}
async function syncRelaySnapshot(session){
 if(relay!==session)return;
 try{
  const res=await fetch(session.url+"/api/state",{headers:{Authorization:"Bearer "+session.token}});
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
  const stream=await fetch(session.url+"/api/events-ticket",{method:"POST",
    headers:{Authorization:"Bearer "+session.token}});
  if(!stream.ok)throw Error("Flux HTTP "+stream.status);
  const {ticket}=await stream.json();
  if(relay!==session)return;
  if(sse)sse.close();
  sse=new EventSource(session.url+"/api/events?ticket="+encodeURIComponent(ticket));
  sse.onmessage=e=>{
   if(relay!==session)return;
   const data=JSON.parse(e.data);
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
  const res=await fetch(url+"/api/state",{headers:{Authorization:"Bearer "+token}});
  if(!res.ok)throw Error("Accès refusé au relais");
  state=(await res.json()).state;lastSync=state.revision;relay={url,token};undo=[];render();
  signalStatus("● Relais local connecté");
  attachLiveEvents(relay);
  notify("Relais synchronisé. Ne publie jamais ton jeton.");renderWelcome();return true;
 }catch(e){disconnect();notify(e.message,true);return false;}
}
$("connect-relay").onclick=connectRelay;

function wizardStatus(){
 return [
  Boolean(onboarding.installed||onboarding.installSkipped),
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
 $("home-installed").checked=Boolean(onboarding.installed);
 const status=$("home-relay-status");
 status.textContent=relay?"✓ Connecté":onboarding.preview?"Mode aperçu":"Non connecté";
 $("home-connection-label").textContent=relay?"✓ Module connecté automatiquement":onboarding.preview?"Aperçu sans serveur":"En attente du module Windows";
 status.classList.toggle("complete",steps[1]);
 $("home-game-status").textContent=steps[2]?"● Partie prête":"À préparer";
 $("home-game-status").classList.toggle("complete",steps[2]);
 $("home-prompt-status").textContent=steps[3]?"✓ Prompt copié":"À copier";
 $("home-prompt-status").classList.toggle("complete",steps[3]);
 $("home-resume").hidden=!state.started;
 $("home-resume").textContent=state.started?"Reprendre ma partie":"Voir le plateau";

 $("home-back").disabled=wizardStep===1;
 $("home-next").disabled=!steps[wizardStep-1];
 $("home-next").textContent=wizardStep===4?"Terminer et ouvrir le plateau →":"Valider et continuer →";
 const prompts=[
   "Lance le fichier .exe puis confirme, ou choisis un aperçu sans installation.",
   "Connecte réellement le serveur, ou choisis le mode aperçu.",
   "Renseigne les trois cartes et clique sur « Créer et démarrer ma partie ».",
   "Clique sur « Copier le prompt IA » pour valider la dernière étape."
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
function fillHomeCardSuggestions(){
 const lists=[
  ["home-legends",catalog.filter(c=>c.type.toLowerCase()==="legend")],
  ["home-champions",catalog.filter(c=>c.type.toLowerCase()==="unit")],
  ["home-battlefields",catalog.filter(c=>c.type.toLowerCase().includes("battlefield"))]
 ];
 for(const [id,cards] of lists){
  const target=$(id);target.textContent="";const fragment=document.createDocumentFragment(),seen=new Set();
  for(const card of cards){
   if(card.isVariant||seen.has(card.name))continue;
   seen.add(card.name);fragment.appendChild(new Option(card.name,card.name));
  }
  target.appendChild(fragment);
 }
 $("home-catalog-count").textContent=catalog.length?catalog.length+
  " cartes disponibles. Choisis les noms dans les suggestions pour afficher les visuels.":"Catalogue indisponible : importe un JSON depuis l'onglet Catalogue.";
}
function homeCard(id,type){
 const value=$(id).value.trim();
 if(!value)throw Error("Complète les trois champs de ton deck physique.");
 return guess(value,type)||{code:"manual-"+value.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
  name:value,type:type==="legend"?"Legend":type==="battlefield"?"Battlefield":"Unit",image:""};
}
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
  const champion=homeCard("home-human-champion","unit");
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
  notify("Partie créée ! Deck IA : "+deck.label+". Tu peux maintenant copier le prompt, puis ouvrir le plateau.");
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
   wizardStep=3;onboarding.wizardStep=3;
   saveOnboarding();renderWelcome();
   notify("Application Windows connectée automatiquement. Configure maintenant ta partie.");
 }else{
   try{sessionStorage.removeItem(key);}catch{}
   notify("Connexion automatique impossible. Relance le compagnon Windows.",true);
 }
}
render();
renderWelcome();
autoBootstrapCompanion();
loadCatalog().then(cards=>{catalog=cards;renderCatalog();fillHomeCardSuggestions();}).catch(e=>{
 $("catalog-status").textContent=e.message;
 $("home-catalog-count").textContent="Impossible de charger les cartes : "+e.message;
});
