// Portable manager for the authenticated loopback server. All downloads stay
// in the selected root. Launching is blocked when an update is confirmed.
import fs from "node:fs";
import path from "node:path";
import {downloadVerified} from "./free-ai.mjs";
import {inside,readMarker,uninstallScript,updateScript,launchMaintenance} from "./portable.mjs";
import {CURRENT_VERSION,OFFICIAL_RELEASE,compareVersions} from "./release-policy.mjs";
export {CURRENT_VERSION,OFFICIAL_RELEASE,compareVersions} from "./release-policy.mjs";

export function selectOfficialUpdate(release,current=CURRENT_VERSION){
 const candidates=(release?.assets||[]).map(a=>{
  const match=/^RiftboundCompanion-v(\d+\.\d+(?:\.\d+)?)\.exe$/i.exec(a.name||"");
  return match?{version:match[1].split(".").length===2?match[1]+".0":match[1],asset:a}:null;
 }).filter(Boolean).sort((a,b)=>compareVersions(b.version,a.version));
 const item=candidates[0];
 if(!item||compareVersions(item.version,current)<=0)return null;
 if(!item.asset.browser_download_url?.startsWith(
  "https://github.com/Nitarii/Riftbound/releases/download/companion-latest/"))
  throw Error("Adresse de mise à jour non officielle.");
 return item;
}

export function createPortableManager({
 root,exePath=process.execPath,portable=false,fetchImpl=fetch,
 download=downloadVerified,launch=launchMaintenance,shutdown=()=>{},
 current=CURRENT_VERSION,skipStartupCheck=false
}={}){
 let phase="idle",progress=0,error="",available=null,updating=false,shuttingDown=false;
 let updateState=portable&&!skipStartupCheck?"checking":"current";
 let checkedAt=null,offlineApproved=false,checking=null;
 const mustUpdate=()=>updateState==="outdated";
 const canLaunch=()=>!shuttingDown&&!updating&&
  (updateState==="current"||(updateState==="unavailable"&&offlineApproved));
 const status=()=>({
  version:current,portable,path:root,executable:exePath,phase,progress,error,
  availableVersion:available?.version||null,updateState,checkedAt,updating,shuttingDown,
  mustUpdate:mustUpdate(),canLaunch:canLaunch(),offlineApproved
 });
 async function fetchRelease(){
  const response=await fetchImpl(OFFICIAL_RELEASE,{headers:{
   "Accept":"application/vnd.github+json",
   "User-Agent":"Riftbound-Portable-Companion"
  },signal:AbortSignal.timeout(10000),cache:"no-store"});
  if(!response.ok)throw Error("GitHub indisponible (HTTP "+response.status+").");
  return response.json();
 }
 async function checkUpdate(){
  if(!portable)return {...status(),message:"Le contrôle automatique concerne l'exécutable Windows."};
  if(checking)return checking;
  checking=(async()=>{
   updateState="checking";
   error="";offlineApproved=false;
   try{
    available=selectOfficialUpdate(await fetchRelease(),current);
    checkedAt=new Date().toISOString();
    updateState=available?"outdated":"current";
    return {...status(),message:available?
      "Version "+available.version+" obligatoire avant de lancer une partie.":
      "Compagnon à jour. Tu peux lancer le plateau."};
   }catch(e){
    updateState="unavailable";available=null;
    error=String(e.message||e).slice(0,250);
    return {...status(),message:"Vérification impossible : "+error+
      ". Réessaie ou choisis explicitement le mode hors ligne."};
   }
  })().finally(()=>{checking=null;});
  return checking;
 }
 async function startupCheck(){
  if(skipStartupCheck){
   updateState="current";
   checkedAt=new Date().toISOString();
   return status();
  }
  return checkUpdate();
 }
 function continueOffline(){
  if(!portable||updateState!=="unavailable"||mustUpdate())
   throw Error("Le lancement hors ligne n'est proposé que si GitHub ne répond pas.");
  offlineApproved=true;
  return {...status(),message:"Démarrage autorisé sans vérification réseau. Recontrôle la version dès que possible."};
 }
 async function applyUpdate(){
  if(!portable)throw Error("Mise à jour Windows portable uniquement.");
  if(updating||shuttingDown)throw Error("Opération de maintenance déjà en cours.");
  if(updateState!=="outdated"||!available){
   const checked=await checkUpdate();
   if(!checked.mustUpdate||!available)return {...status(),message:"Aucune mise à jour disponible."};
  }
  readMarker(root);
  const candidate=available;
  const staged=path.join(root,"updates","RiftboundCompanion-"+candidate.version+".exe");
  if(!inside(path.resolve(root),path.resolve(staged)))throw Error("Destination incorrecte.");
  fs.mkdirSync(path.dirname(staged),{recursive:true});
  const asset=candidate.asset,raw=String(asset.digest||"");
  let hash=/^sha256:([a-f0-9]{64})$/i.exec(raw)?.[1]?.toLowerCase()||"";
  if(!hash){
   const check=(await fetchRelease()).assets.find(a=>a.name===asset.name+".sha256");
   if(!check||!check.browser_download_url?.startsWith(
    "https://github.com/Nitarii/Riftbound/releases/download/companion-latest/"))
    throw Error("Empreinte SHA256 officielle introuvable.");
   const reply=await fetchImpl(check.browser_download_url,{signal:AbortSignal.timeout(20000)});
   if(!reply.ok)throw Error("Contrôle SHA256 inaccessible.");
   hash=/[a-f0-9]{64}/i.exec(await reply.text())?.[0]?.toLowerCase()||"";
   if(!hash)throw Error("Empreinte SHA256 invalide.");
  }
  updating=true;phase="downloading";progress=0;error="";
  try{
   await download(asset.browser_download_url,staged,hash,(n,total)=>{
    progress=Math.min(100,Math.round(n/Math.max(1,total||asset.size||1)*100));
   },fetchImpl);
   phase="restarting";
   launch(updateScript({root,exePath,staged}),{
    env:{...process.env,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp")}
   });
   setTimeout(shutdown,350);
   return {...status(),message:"Mise à jour vérifiée. Redémarrage dans le même dossier."};
  }catch(e){
   phase="error";error=String(e.message||e);
   throw e;
  }finally{updating=false;}
 }
 function requestStop({confirm}={}){
  if(confirm!=="STOP_RIFTBOUND")throw Error("Confirmation d'arrêt manquante.");
  if(shuttingDown)return {ok:true,stopping:true};
  shuttingDown=true;
  // Give the HTTP response time to reach the browser before closing the listener.
  setTimeout(shutdown,300);
  return {ok:true,stopping:true,message:
   "Arrêt du compagnon, de Qwen, de Whisper et du tunnel éventuel. Les données sont conservées."};
 }
 function uninstall({confirm,folder}={}){
  if(!portable)throw Error("Désinstallation disponible seulement pour l'application Windows.");
  if(confirm!=="DELETE_RIFTBOUND_DATA"||folder!==root)
   throw Error("Désinstallation annulée : confirmation du dossier incorrecte.");
  if(shuttingDown||updating)throw Error("Une maintenance est déjà en cours.");
  const script=uninstallScript({root,exePath});
  shuttingDown=true;
  launch(script,{env:{...process.env,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp")}});
  setTimeout(shutdown,350);
  return {ok:true,message:"Le compagnon va s'arrêter et supprimer uniquement ses fichiers."};
 }
 return {status,checkUpdate,startupCheck,continueOffline,applyUpdate,requestStop,uninstall};
}
