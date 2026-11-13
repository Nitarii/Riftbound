// Portable manager for the authenticated loopback server. All downloads stay
// in the selected root. Launching is blocked when an update is confirmed.
import fs from "node:fs";
import path from "node:path";
import {downloadVerified} from "./free-ai.mjs";
import {inside,readMarker,updateScript,launchMaintenance} from "./portable.mjs";
import {launchUninstallHelper} from "./uninstall-helper.mjs";
import {readUpdateStatus,writeUpdateStatus,updateLogPath} from "./update-transaction.mjs";
import {CURRENT_VERSION,OFFICIAL_RELEASE,compareVersions} from "./release-policy.mjs";
import {launchUpdateHelper} from "./update-helper.mjs";
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
 download=downloadVerified,launch=launchUninstallHelper,launchUpdate=launchUpdateHelper,shutdown=()=>{},
 current=CURRENT_VERSION,skipStartupCheck=false,onOutdated=()=>{},sessionToken="",port=8787
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
  mustUpdate:mustUpdate(),canLaunch:canLaunch(),offlineApproved,
  lastUpdate:readUpdateStatus(root)
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
    if(available)onOutdated();
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
  let handedOff=false;
  try{
   await download(asset.browser_download_url,staged,hash,(n,total)=>{
    progress=Math.min(100,Math.round(n/Math.max(1,total||asset.size||1)*100));
   },fetchImpl);
   phase="restarting";
   const request={root,exePath,staged,expectedSha256:hash,
    version:candidate.version,port,pid:process.pid};
   writeUpdateStatus(root,"launching",candidate.version,
    "Téléchargement vérifié, démarrage du processus de maintenance.");
   const env={...process.env,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp"),
    TMPDIR:path.join(root,"temp"),
    ...(sessionToken?{RIFTBOUND_TOKEN:sessionToken}:{})};
   const launched=launchUpdate(request,{root,env});
   if(!launched?.pid)throw Error("Le processus de mise à jour n'a pas démarré.");
   // Handshake: NEVER kill the old companion if PowerShell could not start.
   // The updater itself must write 'waiting' before the old server exits.
   let acknowledged=false;
   for(let i=0;i<70;i++){
    const report=readUpdateStatus(root);
    if(report?.version===candidate.version&&["waiting","verifying","replacing","restarting","success"].includes(report.phase)){
     acknowledged=true;break;
    }
    if(report?.version===candidate.version&&["failed","rolled-back"].includes(report.phase))
     throw Error("Le programme de mise à jour a échoué au démarrage : "+report.message);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   if(!acknowledged)throw Error("Le programme de mise à jour Windows ne démarre pas. L'ancien compagnon reste ouvert ; consulte le journal.");
   handedOff=true;
   shuttingDown=true;
   // The separate updater waits for this exact PID to exit. Do not close the
   // current server before confirming the updater was successfully spawned.
   setTimeout(shutdown,900);
   return {...status(),message:"Téléchargement SHA256 vérifié. Remplacement et redémarrage en cours ; le gestionnaire se reconnectera automatiquement."};
  }catch(e){
   phase="error";error=String(e.message||e);
   try{writeUpdateStatus(root,"failed",candidate.version,"Échec avant le redémarrage : "+error);}catch{}
   throw e;
  }finally{if(!handedOff)updating=false;}
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
 async function uninstall({confirm,folder}={}){
  if(!portable)throw Error("Désinstallation disponible seulement pour l'application Windows.");
  if(confirm!=="DELETE_RIFTBOUND_DATA"||folder!==root)
   throw Error("Désinstallation annulée : confirmation du dossier incorrecte.");
  if(shuttingDown||updating)throw Error("Une maintenance est déjà en cours.");
  readMarker(root);
  // A successful spawn alone does not prove that PowerShell will run the
  // cleanup. Wait for an actual acknowledgement while the server is alive.
  const receipt=path.join(root,"updates","uninstall-status.json");
  fs.mkdirSync(path.dirname(receipt),{recursive:true});
  const go=path.join(root,"updates","uninstall-go.signal");
  fs.rmSync(receipt,{force:true});
  fs.rmSync(go,{force:true});
  const launched=launch({root,exePath,pid:process.pid},{
   env:{...process.env,TEMP:path.join(root,"temp"),
    TMP:path.join(root,"temp"),TMPDIR:path.join(root,"temp")}});
  if(!Number.isSafeInteger(launched?.pid)||launched.pid<1)
   throw Error("Le programme de désinstallation n'a pas démarré. Le gestionnaire reste ouvert.");
  let acknowledged=false;
  for(let i=0;i<80;i++){
   let info=null;
   try{info=JSON.parse(fs.readFileSync(receipt,"utf8"));}catch{}
   if(info?.phase==="waiting"){acknowledged=true;break;}
   if(info?.phase==="failed")
    throw Error("Échec du désinstalleur : "+String(info.message||"erreur inconnue").slice(0,200));
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!acknowledged)
   throw Error("Le désinstalleur ne répond pas. Application conservée : consulte le dossier updates.");
  // The independent helper MUST NOT delete even one file until the HTTP
  // server has observed its acknowledgement and explicitly sent GO.
  fs.writeFileSync(go,"GO",{mode:0o600});
  shuttingDown=true;
  // Stop the local AI, speech and tunnel; the helper waits for this PID to
  // exit before deleting the executable and the chosen install directory.
  setTimeout(shutdown,650);
  return {ok:true,uninstalling:true,message:
   "Désinstallation confirmée. Fermeture des moteurs, puis suppression des fichiers gérés."};
 }
 return {status,checkUpdate,startupCheck,continueOffline,applyUpdate,requestStop,uninstall};
}
