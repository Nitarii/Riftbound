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
refresh();
// Quick tunnels do not carry SSE. Keep a low-frequency, single-flight poll.
setInterval(()=>{if(!document.hidden)refresh();},3000);
