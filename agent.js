"use strict";
const $=id=>document.getElementById(id);
const SESSION_KEY="riftbound-remote-agent-token";
let token="",lastState=null,busy=false;
try{
 const hash=new URLSearchParams(location.hash.slice(1));
 token=hash.get("access")||sessionStorage.getItem(SESSION_KEY)||"";
 if(hash.has("access")){
  history.replaceState(null,"",location.pathname+location.search);
  if(token)sessionStorage.setItem(SESSION_KEY,token);
 }
}catch{}
function message(value,error=false){
 $("error").textContent=error?value:"";
 $("status").textContent=error?"Connexion indisponible":value;
 $("status").style.color=error?"#f5aea7":"#b9e5c7";
}
async function call(route,method="GET",data){
 if(!token)throw Error("Aucun jeton de session fourni. Demande au joueur le lien d'accès temporaire depuis son site.");
 const response=await fetch(route,{
  method,cache:"no-store",
  headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
  ...(method==="POST"?{body:JSON.stringify(data)}:{})
 });
 let result={};
 try{result=await response.json();}catch{}
 if(!response.ok)throw Error(result.error||"Erreur HTTP "+response.status);
 return result;
}
function showState(state){
 lastState=state;
 const human=state.players?.human||{},ai=state.players?.ai||{};
 $("stats").replaceChildren();
 for(const title of [
   "Tour "+(state.turn||"—"),"Phase : "+(state.phase||"—"),
   "Actif : "+(state.active==="ai"?"IA":"Humain"),
   "IA : "+(ai.score||0)+" points","Joueur : "+(human.score||0)+" points"
 ]){
  const item=document.createElement("span");item.textContent=title;$("stats").append(item);
 }
 const list=$("zone-list");list.replaceChildren();
 for(const card of state.cards||[]){
  if(card.zone==="hand"&&card.owner==="human")continue;
  if(card.zone==="hand"&&card.owner==="ai"&&card.faceDown)continue;
  const li=document.createElement("li");
  li.textContent=[card.owner==="ai"?"IA":"Joueur",card.name||"Carte inconnue",
   card.zone,card.uid||"",card.exhausted?"épuisé":""].filter(Boolean).join(" · ");
  list.append(li);
 }
 $("state").textContent=JSON.stringify(state,null,2);
 message("Partie connectée et synchronisée (révision "+state.revision+").");
}
async function refresh(){
 if(busy)return;
 busy=true;
 try{showState((await call("/api/state")).state);}
 catch(e){message(e.message,true);}
 finally{busy=false;}
}
async function command(data){
 try{
  const response=await call("/api/command","POST",data);
  showState(response.state);
 }catch(e){message(e.message,true);}
}
$("refresh").onclick=refresh;
$("guide").onclick=async()=>{
 try{
  const guide=await call("/api/guide");
  $("reference").hidden=false;
  $("reference-json").textContent=JSON.stringify(guide,null,2);
 }catch(e){message(e.message,true);}
};
$("send").onclick=async()=>{
 try{await command(JSON.parse($("command").value));}
 catch(e){message("JSON invalide : "+e.message,true);}
};
$("draw").onclick=()=>command({type:"draw",player:"ai",count:1});
$("channel").onclick=()=>command({type:"channel",player:"ai",count:1});
$("next").onclick=()=>command({type:"next-turn"});
$("pickdeck").onclick=()=>{
 if(confirm("Préparer un nouveau deck préconstruit IA au hasard ?"))command({type:"select-precon",id:"random"});
};
$("scoreplus").onclick=()=>command({type:"score",player:$("player").value,value:1});
$("scoreminus").onclick=()=>command({type:"score",player:$("player").value,value:-1});
let agentChatCursor=0,agentChatEntries=[],agentChatBusy=false;
async function refreshAgentChat(){
 if(agentChatBusy)return;
 agentChatBusy=true;
 try{
  const result=await call("/api/messages?after="+agentChatCursor);
  const known=new Set(agentChatEntries.map(x=>x.id));
  for(const entry of result.messages||[]){
   if(!entry||!Number.isInteger(entry.id)||!["human","ai"].includes(entry.role))continue;
   if(!known.has(entry.id)){agentChatEntries.push(entry);known.add(entry.id);}
   agentChatCursor=Math.max(agentChatCursor,entry.id);
  }
  agentChatEntries=agentChatEntries.slice(-60);
  const list=$("agent-chat-log");list.replaceChildren();
  for(const entry of agentChatEntries){
   const bubble=document.createElement("div");
   bubble.className="agent-chat-entry "+(entry.role==="ai"?"from-agent":"from-human");
   const header=document.createElement("small");
   header.textContent=(entry.role==="ai"?"IA":"Joueur")+" · "+new Date(entry.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
   const text=document.createElement("p");text.textContent=entry.text;
   bubble.append(header,text);list.append(bubble);
  }
  if(!agentChatEntries.length){
   const placeholder=document.createElement("p");
   placeholder.textContent="Le joueur n'a pas encore envoyé de message.";
   list.append(placeholder);
  }
  list.scrollTop=list.scrollHeight;
 }catch(e){message("Messages indisponibles : "+e.message,true);}
 finally{agentChatBusy=false;}
}
async function replyToPlayer(){
 const editor=$("agent-reply"),text=editor.value.trim();
 if(!text)return;
 $("agent-reply-send").disabled=true;
 try{
  await call("/api/messages","POST",{text});
  editor.value="";
  await refreshAgentChat();
 }catch(e){message("Réponse non envoyée : "+e.message,true);}
 finally{$("agent-reply-send").disabled=false;}
}
$("agent-reply-send").onclick=replyToPlayer;
$("agent-reply").addEventListener("keydown",e=>{
 if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();replyToPlayer();}
});
refresh();refreshAgentChat();
// Quick tunnels do not carry SSE. Keep a low-frequency, single-flight poll.
setInterval(()=>{if(!document.hidden){refresh();refreshAgentChat();}},2500);
