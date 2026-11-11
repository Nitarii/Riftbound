// Authenticated localhost portable manager. Every staging file stays in root.
import fs from "node:fs";
import path from "node:path";
import {downloadVerified} from "./free-ai.mjs";
import {inside,readMarker,uninstallScript,updateScript,launchMaintenance} from "./portable.mjs";
export const CURRENT_VERSION="0.21.0";
export const OFFICIAL_RELEASE="https://api.github.com/repos/Nitarii/Riftbound/releases/tags/companion-latest";
const ver=value=>String(value||"").split(".").map(n=>Number(n)||0);
export function compareVersions(a,b){
 const x=ver(a),y=ver(b);
 for(let i=0;i<3;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;
 return 0;
}
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
 download=downloadVerified,launch=launchMaintenance,shutdown=()=>{},current=CURRENT_VERSION
}){
 let phase="idle",progress=0,error="",available=null,updating=false;
 const status=()=>({version:current,portable,path:root,executable:exePath,phase,
  progress,error,availableVersion:available?.version||null,updating});
 async function fetchRelease(){
  const response=await fetchImpl(OFFICIAL_RELEASE,{headers:{
   "Accept":"application/vnd.github+json","User-Agent":"Riftbound-Portable-Companion"
  },signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("GitHub indisponible (HTTP "+response.status+").");
  return response.json();
 }
 async function checkUpdate(){
  if(!portable)return { ...status(),message:"Les mises à jour intégrées nécessitent l'exécutable Windows."};
  available=selectOfficialUpdate(await fetchRelease(),current);
  error="";
  return {...status(),message:available?"Mise à jour "+available.version+" disponible.":"Version déjà à jour."};
 }
 async function applyUpdate(){
  if(!portable)throw Error("Mise à jour Windows portable uniquement.");
  if(updating)throw Error("Mise à jour déjà en cours.");
  const candidate=available||selectOfficialUpdate(await fetchRelease(),current);
  if(!candidate)return {...status(),message:"Déjà à jour."};
  readMarker(root);
  const staged=path.join(root,"updates","RiftboundCompanion-"+candidate.version+".exe");
  if(!inside(path.resolve(root),path.resolve(staged)))throw Error("Destination incorrecte.");
  fs.mkdirSync(path.dirname(staged),{recursive:true});
  const asset=candidate.asset,raw=String(asset.digest||"");
  let hash=/^sha256:([a-f0-9]{64})$/i.exec(raw)?.[1]?.toLowerCase()||"";
  if(!hash){
   const check=(await fetchRelease()).assets.find(a=>a.name===asset.name+".sha256");
   if(!check||!check.browser_download_url?.startsWith("https://github.com/Nitarii/Riftbound/"))
    throw Error("Empreinte SHA256 officielle de la mise à jour introuvable.");
   const reply=await fetchImpl(check.browser_download_url,{signal:AbortSignal.timeout(20000)});
   if(!reply.ok)throw Error("Contrôle SHA256 non accessible.");
   const content=await reply.text();
   hash=/[a-f0-9]{64}/i.exec(content)?.[0]?.toLowerCase()||"";
   if(!hash)throw Error("Empreinte SHA256 invalide.");
  }
  updating=true;phase="downloading";progress=0;error="";
  try{
   await download(asset.browser_download_url,staged,hash,(n,total)=>{
    progress=total?Math.round(n/total*100):Math.round(n/(asset.size||1)*100);
   },fetchImpl);
   phase="restarting";
   const script=updateScript({root,exePath,staged});
   launch(script,{env:{...process.env,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp")}});
   setTimeout(shutdown,350);
   return {...status(),message:"Mise à jour vérifiée. Redémarrage du compagnon."};
  }catch(e){phase="error";error=String(e.message||e);throw e;}
  finally{updating=false;}
 }
 function uninstall({confirm,folder}={}){
  if(!portable)throw Error("Désinstallation disponible seulement pour l'application Windows.");
  if(confirm!=="DELETE_RIFTBOUND_DATA"||folder!==root)
   throw Error("Désinstallation annulée : confirmation du dossier incorrecte.");
  const script=uninstallScript({root,exePath});
  launch(script,{env:{...process.env,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp")}});
  setTimeout(shutdown,350);
  return {ok:true,message:"Le compagnon va se fermer et supprimer uniquement les fichiers qu'il gère."};
 }
 return {status,checkUpdate,applyUpdate,uninstall};
}
