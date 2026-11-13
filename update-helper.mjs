// Self-hosted, transactional Windows updater. The downloaded verified SEA
// executable runs as the independent helper, avoiding brittle PowerShell
// script launching, quoting and permission failures.
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {inside,readMarker} from "./portable.mjs";
import {readUpdateStatus,writeUpdateStatus,updateLogPath} from "./update-transaction.mjs";
import {stopOwnedProcess} from "./process-lifecycle.mjs";
import crypto from "node:crypto";

const wait=delay;
const shaPattern=/^[a-f0-9]{64}$/i;
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const sha256=file=>{
 const digest=crypto.createHash("sha256");
 const fd=fs.openSync(file,"r");
 try{
  const chunk=Buffer.allocUnsafe(1024*1024);
  for(;;){const n=fs.readSync(fd,chunk,0,chunk.length,null);if(!n)break;digest.update(chunk.subarray(0,n));}
 }finally{fs.closeSync(fd);}
 return digest.digest("hex");
};
function check(request,{self=false}={}){
 if(!request||typeof request!=="object")throw Error("Paramètres de mise à jour manquants.");
 const {root,exePath,staged,expectedSha256,version,port,pid}=request;
 if(!root||!exePath||!staged)throw Error("Chemins manquants.");
 const base=path.resolve(root),target=path.resolve(exePath),candidate=path.resolve(staged);
 if(!inside(base,target)||!inside(path.join(base,"updates"),candidate)||samePath(target,candidate))
  throw Error("Le remplacement doit rester dans le dossier sélectionné.");
 const marker=readMarker(base);
 if(path.basename(target)!==marker.executable)throw Error("Cible différente du manifeste du compagnon.");
 if(!shaPattern.test(String(expectedSha256||"")))throw Error("SHA256 attendu incorrect.");
 if(!/^\d+\.\d+(?:\.\d+)?$/.test(String(version||"")))throw Error("Version de mise à jour incorrecte.");
 if(!Number.isSafeInteger(Number(pid))||Number(pid)<1||(self&&Number(pid)===process.pid))
  throw Error("PID du compagnon à remplacer invalide.");
 if(!Number.isSafeInteger(Number(port))||Number(port)<1||Number(port)>65535)
  throw Error("Port local invalide.");
 if(self&&!samePath(candidate,process.execPath))
  throw Error("L'assistant doit s'exécuter depuis le fichier téléchargé.");
 return {root:base,exePath:target,staged:candidate,expectedSha256:expectedSha256.toLowerCase(),
  version,port:Number(port),pid:Number(pid)};
}
function log(root,message){
 try{fs.appendFileSync(updateLogPath(root),new Date().toISOString()+" "+message+"\n",{encoding:"utf8"});}catch{}
}
function record(root,phase,version,message){
 writeUpdateStatus(root,phase,version,message);
 log(root,"["+phase+"] "+message);
}
export function launchUpdateHelper(request,{env=process.env,spawnImpl=spawn}={}){
 const r=check(request);
 // A helper is a full copy of our signed-by-SHA release, not an arbitrary
 // executable from PATH, and must be in the selected installation folder.
 if(!fs.existsSync(r.staged))throw Error("Exécutable téléchargé introuvable.");
 const params=Buffer.from(JSON.stringify(r),"utf8").toString("base64");
 const ownEnv={...env,RIFTBOUND_UPDATE_REQUEST:params,RIFTBOUND_DATA_DIR:r.root,
  TEMP:path.join(r.root,"temp"),TMP:path.join(r.root,"temp"),
  TMPDIR:path.join(r.root,"temp")};
 fs.mkdirSync(path.join(r.root,"updates"),{recursive:true});
 fs.mkdirSync(path.join(r.root,"temp"),{recursive:true});
 const child=spawnImpl(r.staged,["--riftbound-update-helper"],{
  cwd:r.root,env:ownEnv,windowsHide:true,detached:true,stdio:"ignore"
 });
 if(!child||!Number.isSafeInteger(child.pid)||child.pid<=0)
  throw Error("Impossible de démarrer la nouvelle version comme assistant de mise à jour.");
 child.once?.("error",e=>log(r.root,"Erreur de lancement de l'assistant : "+e.message));
 child.unref?.();
 return {pid:child.pid};
}
function pidAlive(pid){
 try{process.kill(pid,0);return true;}catch(e){return e?.code==="EPERM";}
}
async function waitForExit(pid,timeout=90000){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(!pidAlive(pid))return;await wait(250);}
 throw Error("L'ancien programme ne s'est pas arrêté (90 secondes).");
}
async function awaitHealthy(port,version,expectedPid,token){
 const end=Date.now()+45000;
 while(Date.now()<end){
  if(!pidAlive(expectedPid))throw Error("La nouvelle version s'est fermée sans démarrer.");
  try{
   const url="http://127.0.0.1:"+port;
   const r=await fetch(url+"/api/health",{signal:AbortSignal.timeout(1200),cache:"no-store"});
   if(r.ok){
    const health=await r.json();
    if(health.ok&&health.packaged&&health.version===version){
     const status=await fetch(url+"/api/manager/processes",{
      headers:{"Authorization":"Bearer "+token},signal:AbortSignal.timeout(1200)});
     if(status.ok&&(await status.json())?.companion?.pid===expectedPid)return;
    }
   }
  }catch{}
  await wait(450);
 }
 throw Error("Le nouveau gestionnaire n'a pas confirmé son redémarrage dans le délai imparti.");
}
function spawnCompanion(r,env){
 const child=spawn(r.exePath,[],{cwd:r.root,env,windowsHide:false,
  detached:true,stdio:"ignore"});
 if(!Number.isSafeInteger(child.pid)||child.pid<=0)throw Error("Impossible de relancer le compagnon.");
 child.unref?.();
 return child;
}
export async function runUpdateHelper({env=process.env}={}){
 if(process.platform!=="win32")throw Error("Assistant de mise à jour réservé à Windows.");
 const value=env.RIFTBOUND_UPDATE_REQUEST;
 if(!value||value.length>24000)throw Error("Demande de mise à jour absente.");
 let request;
 try{request=JSON.parse(Buffer.from(value,"base64").toString("utf8"));}
 catch{throw Error("Demande de mise à jour illisible.");}
 const r=check(request,{self:true});
 const backup=path.join(r.root,"updates","previous-companion.exe");
 const failed=path.join(r.root,"updates","failed-companion.exe");
 const restartEnv={...env,RIFTBOUND_DATA_DIR:r.root,
  TEMP:path.join(r.root,"temp"),TMP:path.join(r.root,"temp"),
  TMPDIR:path.join(r.root,"temp")};
 delete restartEnv.RIFTBOUND_UPDATE_REQUEST;
 let oldExited=false,replaced=false,started=null;
 record(r.root,"waiting",r.version,"Assistant indépendant démarré, attente de fermeture de l'ancienne version.");
 try{
  await waitForExit(r.pid);oldExited=true;
  record(r.root,"verifying",r.version,"Vérification de l'intégrité du nouveau fichier.");
  if(sha256(r.staged)!==r.expectedSha256)throw Error("Empreinte SHA256 incorrecte.");
  record(r.root,"replacing",r.version,"Sauvegarde puis remplacement de l'exécutable.");
  if(!fs.existsSync(r.exePath))throw Error("Exécutable précédent introuvable.");
  if(fs.existsSync(backup))fs.rmSync(backup,{force:true});
  // Rename an unlocked EXE first. The helper runs from staged, so it is not
  // trying to replace its own executing image.
  let renamed=false,lastError="";
  for(let i=0;i<40;i++){
   try{fs.renameSync(r.exePath,backup);renamed=true;break;}
   catch(e){
    lastError=String(e.message||e);
    if(!["EACCES","EPERM","EBUSY"].includes(e.code))throw e;
    await wait(300);
   }
  }
  if(!renamed)throw Error("L'ancien EXE reste verrouillé : "+lastError);
  try{fs.copyFileSync(r.staged,r.exePath,fs.constants.COPYFILE_EXCL);}
  catch(e){fs.renameSync(backup,r.exePath);throw e;}
  replaced=true;
  if(sha256(r.exePath)!==r.expectedSha256)throw Error("Contrôle SHA256 après installation échoué.");
  record(r.root,"restarting",r.version,"Vérification du gestionnaire avec le nouveau processus.");
  started=spawnCompanion(r,restartEnv);
  await awaitHealthy(r.port,r.version,started.pid,restartEnv.RIFTBOUND_TOKEN||"");
  record(r.root,"success",r.version,"Mise à jour réussie : nouveau gestionnaire prêt.");
  try{fs.rmSync(backup,{force:true});}catch{}
  return {ok:true,version:r.version,pid:started.pid};
 }catch(error){
  const reason=String(error?.message||error).slice(0,250);
  record(r.root,"failed",r.version,reason);
  if(started){stopOwnedProcess(started);await wait(700);}
  if(replaced&&fs.existsSync(backup)){
   try{
    if(fs.existsSync(failed))fs.rmSync(failed,{force:true});
    if(fs.existsSync(r.exePath))fs.renameSync(r.exePath,failed);
    fs.renameSync(backup,r.exePath);
   }catch(e){record(r.root,"failed",r.version,"Restauration manuelle nécessaire : "+e.message);}
  }else if(!fs.existsSync(r.exePath)&&fs.existsSync(backup)){
   try{fs.renameSync(backup,r.exePath);}catch{}
  }
  if(oldExited&&fs.existsSync(r.exePath)){
   try{spawnCompanion(r,restartEnv);
    record(r.root,"rolled-back",r.version,"Ancienne version redémarrée après échec : "+reason);}
   catch(e){record(r.root,"failed",r.version,"Relance manuelle nécessaire : "+e.message);}
  }else{
   record(r.root,"failed",r.version,"Ancien programme conservé : "+reason);
  }
  return {ok:false,error:reason};
 }
}
