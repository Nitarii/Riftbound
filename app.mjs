import {createState,applyCommand,PHASES} from "./core.mjs";
import {loadCatalog,importCatalog,searchCards} from "./catalog.mjs";
import {PRECONS,resolvePrecon} from "./precons.mjs";
const $=id=>document.getElementById(id);
const storage="riftbound-companion-state-v1";
let state;try{state=JSON.parse(localStorage.getItem(storage))||createState()}catch{state=createState()}
let undo=[],catalog=[],selected=null,relay=null,sse=null,lastSync=0;
const save=()=>{try{localStorage.setItem(storage,JSON.stringify(state))}catch{}};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function notify(message,bad=false){$("notice").textContent=message;$("notice").style.color=bad?"#f5a8a3":"#a7d9bd";}
function cardHTML(c,show=true) {
  if(!c)return '<div class="empty-card">Non défini</div>';
  const title=esc(c.name),img=c.image?'<img loading="lazy" alt="'+title+'" src="'+esc(c.image)+'" data-fallback="'+esc(c.imageFallback||"")+'">':'<div class="empty-card">'+title+'</div>';
  return '<div class="card-tile '+(c.exhausted?"exhausted ":"")+(c.faceDown?"face-down":"")+'" title="'+title+'" data-uid="'+esc(c.uid||"")+'">'+(c.faceDown?'<div class="card-back">R</div>':img)+'<div class="card-label">'+(show?title:"")+'</div>'+(c.damage?'<b class="damage">−'+c.damage+'</b>':'')+Object.entries(c.counters||{}).filter(([,n])=>n).map(([k,v])=>'<b class="counter">'+esc(k)+': '+esc(v)+'</b>').join("")+'</div>';
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
}
async function dispatch(command){
  try{
    if(relay){
      const res=await fetch(relay.url+"/api/command",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+relay.token},body:JSON.stringify(command)});
      const reply=await res.json();if(!res.ok)throw Error(reply.error||"Erreur du relais");
      state=reply.state;lastSync=state.revision;render();
    }else{undo.push(structuredClone(state));undo=undo.slice(-50);state=applyCommand(state,command);render();}
    notify(state.message);
  }catch(e){notify(e.message,true);}
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
  $("detail-image").innerHTML=cardHTML(c);$("card-dialog").showModal();
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
  $("detail-image").innerHTML=cardHTML(c);$("detail-owner").value=c.owner;
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
for(const tab of document.querySelectorAll(".tab")){
  tab.onclick=()=>{document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));
    document.querySelectorAll(".tabcontent").forEach(t=>t.classList.toggle("hidden",t.id!=="tab-"+tab.dataset.tab));};
}
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
const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SpeechAPI){$("voice-note").disabled=true;$("voice-note").title="Reconnaissance vocale non disponible sur ce navigateur";}
else {
 let recognizer=null,recording=false;
 $("voice-note").onclick=()=>{
   if(recording&&recognizer){recognizer.stop();return;}
   recognizer=new SpeechAPI();recognizer.lang="fr-FR";recognizer.interimResults=false;recognizer.continuous=false;
   recognizer.onresult=e=>{const transcript=Array.from(e.results).map(r=>r[0]?.transcript||"").join(" ").trim();$("notes").value=[$("notes").value.trim(),transcript].filter(Boolean).join(" ");notify("Dictée ajoutée. Vérifie puis clique sur Ajouter au journal.");};
   recognizer.onerror=e=>notify("Dictée indisponible : "+e.error,true);
   recognizer.onend=()=>{recording=false;$("voice-note").textContent="🎙 Dicter une action";};
   try{recognizer.start();recording=true;$("voice-note").textContent="■ Terminer la dictée";}catch(e){notify(e.message,true);}
 };
}

$("send-command").onclick=()=>{try{dispatch(JSON.parse($("command-input").value))}catch(e){notify(e.message,true)}};
$("copy-agent-prompt").onclick=async()=>{
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
 try{await navigator.clipboard.writeText(prompt);notify("Instructions de l'agent copiées. Aucun jeton inclus.");}
 catch(e){notify("Copie impossible : "+e.message,true);}
};

$("undo").onclick=()=>{if(relay){notify("Annulation seulement en mode navigateur.",true);return;}if(undo.length){state=undo.pop();render();notify("Dernière action annulée.");}};
$("reset").onclick=()=>{if(confirm("Effacer la partie en cours ?"))dispatch({type:"reset"});};
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
 $("search-results").innerHTML=results.map(c=>'<button class="result" data-code="'+esc(c.code)+'">'+(c.image?'<img loading="lazy" src="'+esc(c.image)+'" alt="">':'<span class="mini-placeholder">✦</span>')+'<span>'+esc(c.name)+'<small>'+esc(c.subtitle||c.type)+' · '+esc(c.set)+'</small></span></button>').join("");
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
function disconnect(){if(sse)sse.close();sse=null;relay=null;signalStatus("● Mode navigateur");notify("Relais déconnecté.");}
$("disconnect-relay").onclick=disconnect;
$("connect-relay").onclick=async()=>{
 const url=$("relay-url").value.trim().replace(/\/$/,""),token=$("relay-token").value.trim();
 if(!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)){notify("Le panneau n'accepte qu'un relais sur localhost pour éviter d'envoyer le jeton à un serveur tiers.",true);return;}
 try{
  const res=await fetch(url+"/api/state",{headers:{Authorization:"Bearer "+token}});
  if(!res.ok)throw Error("Accès refusé au relais");
  state=(await res.json()).state;relay={url,token};undo=[];render();signalStatus("● Relais local connecté");
  // EventSource doesn't allow auth headers; use the one-time short-lived SSE session token.
  const stream=await fetch(url+"/api/events-ticket",{method:"POST",headers:{Authorization:"Bearer "+token}});
  if(stream.ok){
    const {ticket}=await stream.json();sse=new EventSource(url+"/api/events?ticket="+encodeURIComponent(ticket));
    sse.onmessage=e=>{const data=JSON.parse(e.data);if(data.state&&data.state.revision>=lastSync){state=data.state;lastSync=state.revision;render();}};
    sse.onerror=()=>signalStatus("● Relais : reconnexion…");
    sse.onopen=()=>signalStatus("● Relais local connecté");
  }
  notify("Relais synchronisé. Ne publie jamais ton jeton.");
 }catch(e){disconnect();notify(e.message,true);}
};
render();
loadCatalog().then(cards=>{catalog=cards;renderCatalog();}).catch(e=>{$("catalog-status").textContent=e.message;});
