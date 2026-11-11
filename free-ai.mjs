// One-click, entirely local opponent runtime for Windows.
// Downloads verified official Ollama packages and free open-weight models once.
// No paid API, subscription, cloud account, or inbound public tunnel is required.
import fs from "node:fs";
import {createReadStream} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {once} from "node:events";

const RELEASE="v0.40.16";
const HOST="127.0.0.1",PORT=11435;
const ENGINE_URL="http://"+HOST+":"+PORT;
const ENGINE_PACKAGES=[
 {name:"ollama-windows-amd64.zip",sha256:"50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e"},
 {name:"ollama-windows-amd64-rocm.zip",sha256:"0daf19f77f678a02264b5fa398d6988dece19832ca1682f1f7b8f81450d1f574"}
];
const AVAILABLE_MODELS={
 "qwen3:4b-instruct":{label:"Rapide et gratuit · Qwen3 4B",size:"2,5 Go",profile:"fast"},
 "qwen3.5:9b":{label:"Plus performant · Qwen3.5 9B",size:"6,6 Go",profile:"quality"}
};
export const FREE_MODELS=Object.entries(AVAILABLE_MODELS).map(([id,v])=>({id,...v}));
export const FREE_ENGINE_VERSION=RELEASE;
export const FREE_ENGINE_PORT=PORT;
export const FREE_ENGINE_ORIGIN=ENGINE_URL;
export function freeModelID(value){
 const id=String(value||"qwen3:4b-instruct").trim();
 if(!Object.hasOwn(AVAILABLE_MODELS,id))throw Error("Modèle local non pris en charge.");
 return id;
}
export function verifiedDownloadHash(bytes,expected){
 return crypto.createHash("sha256").update(bytes).digest("hex")===expected;
}
export async function downloadVerified(url,target,expected,report=()=>{},fetchImpl=fetch){
 const temporary=target+".part";
 fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target)){
  // Never load a multi-gigabyte archive into RAM just to verify its digest.
  const hash=crypto.createHash("sha256");
  for await(const chunk of createReadStream(target,{highWaterMark:1024*1024}))hash.update(chunk);
  if(hash.digest("hex")===expected)return fs.statSync(target).size;
  fs.rmSync(target,{force:true});
 }
 let completed=0;
 try{
  const response=await fetchImpl(url,{redirect:"follow",signal:AbortSignal.timeout(2*60*60*1000)});
  if(!response.ok||!response.body)throw Error("Téléchargement officiel HTTP "+response.status);
  const total=Number(response.headers.get("content-length"))||0;
  const digest=crypto.createHash("sha256");
  const stream=fs.createWriteStream(temporary,{flags:"w",mode:0o600});
  try{
   for await(const chunk of response.body){
    const part=Buffer.from(chunk);
    digest.update(part);completed+=part.length;
    if(!stream.write(part))await once(stream,"drain");
    report(completed,total);
   }
   await new Promise((resolve,reject)=>stream.end(err=>err?reject(err):resolve()));
  }catch(e){stream.destroy();throw e;}
  if(digest.digest("hex")!==expected)throw Error("Fichier téléchargé invalide (empreinte SHA-256 différente).");
  fs.renameSync(temporary,target);
  return completed;
 }catch(e){
  try{fs.rmSync(temporary,{force:true});}catch{}
  throw e;
 }
}
function findExecutable(folder,depth=4){
 if(!fs.existsSync(folder)||depth<0)return "";
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(entry.isFile()&&entry.name.toLowerCase()==="ollama.exe")return path.join(folder,entry.name);
 }
 for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(entry.isDirectory()){
   const result=findExecutable(path.join(folder,entry.name),depth-1);
   if(result)return result;
  }
 }
 return "";
}
function formatError(error){
 const message=String(error?.message||error||"Erreur de l'IA locale");
 if(error?.code==="ENOENT")return "L'utilitaire Windows tar est introuvable (Windows 10/11 nécessaire).";
 return message.slice(0,350);
}
export function createFreeLocalAI({
 userData,
 onReady=async()=>{},
 fetchImpl=fetch,
 spawnImpl=spawn,
 extract=async(archive,directory)=>{
  const proc=spawn("tar",["-xf",archive,"-C",directory],{windowsHide:true,stdio:"ignore"});
  const [code]=await once(proc,"close");
  if(code!==0)throw Error("Extraction de l'IA locale impossible (tar : code "+code+").");
 },
 platform=process.platform
}){
 const root=path.join(userData,"free-opponent");
 const runtime=path.join(root,"engine-"+RELEASE);
 const downloads=path.join(root,"downloads");
 const marker=path.join(runtime,".riftbound-engine-verified.json");
 const modelDirectory=path.join(root,"models");
 let task=null,child=null,childStarted=false;
 let current={phase:"idle",progress:0,transferred:0,total:0,message:"IA locale non installée.",
  error:"",model:"qwen3:4b-instruct",installed:false,ready:false};
 function update(partial){current={...current,...partial};}
 function status(){
  return {...current,model:current.model,
   models:FREE_MODELS,version:RELEASE,enginePort:PORT,
   running:Boolean(task),free:true};
 }
 function installationOK(){
  try{
   const details=JSON.parse(fs.readFileSync(marker,"utf8"));
   return details.release===RELEASE&&details.packages.every((p,i)=>
     p.name===ENGINE_PACKAGES[i].name&&p.sha256===ENGINE_PACKAGES[i].sha256)&&
     Boolean(findExecutable(runtime));
  }catch{return false;}
 }
 async function probe(url,timeout=1200){
  try{
   const response=await fetchImpl(url,{signal:AbortSignal.timeout(timeout)});
   return response.ok;
  }catch{return false;}
 }
 async function api(route,data,timeout=60_000){
  const response=await fetchImpl(ENGINE_URL+route,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok)throw Error("Le moteur local a répondu HTTP "+response.status);
  return response;
 }
 async function server(){
  if(await probe(ENGINE_URL+"/api/version",1500))return;
  if(!installationOK())throw Error("Le moteur IA gratuit doit être installé.");
  if(platform!=="win32")throw Error("Le lancement autonome est actuellement prévu pour Windows.");
  const binary=findExecutable(runtime);
  if(!binary)throw Error("Moteur IA introuvable après extraction.");
  const settings={
   ...process.env,OLLAMA_HOST:HOST+":"+PORT,OLLAMA_MODELS:modelDirectory,
   OLLAMA_NO_CLOUD:"1",OLLAMA_NUM_PARALLEL:"1",OLLAMA_MAX_LOADED_MODELS:"1"
  };
  fs.mkdirSync(modelDirectory,{recursive:true});
  child=spawnImpl(binary,["serve"],{env:settings,windowsHide:true,stdio:"ignore"});
  childStarted=true;
  child.once("error",error=>update({phase:"error",error:formatError(error)}));
  child.once("exit",()=>{child=null;childStarted=false;});
  for(let i=0;i<110;i++){
   if(await probe(ENGINE_URL+"/api/version",1500))return;
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw Error("Le moteur local ne démarre pas. Mets à jour ton pilote AMD ou vérifie l'antivirus.");
 }
 async function hasModel(id){
  try{
   const response=await fetchImpl(ENGINE_URL+"/api/tags",{signal:AbortSignal.timeout(3000)});
   if(!response.ok)return false;
   const result=await response.json();
   return result.models?.some(x=>x.name===id||x.model===id);
  }catch{return false;}
 }
 async function pull(model){
  update({phase:"model",progress:0,transferred:0,total:0,
   message:"Téléchargement du modèle gratuit "+model+" (une seule fois)…"});
  const response=await api("/api/pull",{model,stream:true},2*60*60*1000);
  let pending="";
  if(!response.body)throw Error("Téléchargement du modèle interrompu.");
  for await(const chunk of response.body){
   pending+=Buffer.from(chunk).toString("utf8");
   if(pending.length>200000)throw Error("Réponse du moteur local trop volumineuse.");
   let pos;
   while((pos=pending.indexOf("\n"))>=0){
    const row=pending.slice(0,pos);pending=pending.slice(pos+1);
    if(!row.trim())continue;
    const line=JSON.parse(row);
    if(line.error)throw Error(line.error);
    if(Number.isFinite(line.total)&&line.total>0){
     const completed=line.completed||0;
     update({transferred:completed,total:line.total,
      progress:Math.min(99,Math.round(completed/line.total*100))});
    }
    if(typeof line.status==="string")update({message:line.status});
   }
  }
  if(!await hasModel(model))throw Error("Modèle non disponible après le téléchargement.");
 }
 async function installEngine(){
  if(installationOK())return;
  if(platform!=="win32")throw Error("Installation automatique prévue pour Windows 10/11.");
  fs.mkdirSync(downloads,{recursive:true});
  fs.rmSync(runtime,{force:true,recursive:true});
  fs.mkdirSync(runtime,{recursive:true});
  for(let index=0;index<ENGINE_PACKAGES.length;index++){
   const pkg=ENGINE_PACKAGES[index],filename=path.join(downloads,pkg.name);
   update({phase:"engine",progress:0,transferred:0,total:0,
    message:"Téléchargement du moteur gratuit ("+(index+1)+"/"+ENGINE_PACKAGES.length+")…"});
   await downloadVerified("https://github.com/ollama/ollama/releases/download/"+RELEASE+"/"+pkg.name,
    filename,pkg.sha256,(bytes,total)=>update({transferred:bytes,total,
     progress:total?Math.min(100,Math.round(bytes/total*100)):0}),fetchImpl);
   update({phase:"extracting",progress:0,message:"Extraction du moteur local ("+(index+1)+"/"+ENGINE_PACKAGES.length+")…"});
   await extract(filename,runtime);
   try{fs.rmSync(filename,{force:true});}catch{}
  }
  if(!findExecutable(runtime))throw Error("Le programme Ollama est absent de l'archive vérifiée.");
  fs.writeFileSync(marker,JSON.stringify({
   release:RELEASE,packages:ENGINE_PACKAGES.map(x=>({name:x.name,sha256:x.sha256}))
  }),{mode:0o600});
 }
 async function ensure(model,download=true){
  const id=freeModelID(model);
  update({phase:"checking",model:id,error:"",message:"Vérification de l'IA locale…",ready:false});
  if(!installationOK()){
   if(!download)throw Error("Moteur local non installé. Clique sur Installer mon IA gratuite.");
   await installEngine();
  }
  update({phase:"starting",progress:0,message:"Lancement du moteur gratuit sur ton ordinateur…"});
  await server();
  if(!await hasModel(id)){
   if(!download)throw Error("Modèle gratuit absent. Installe-le depuis le site.");
   await pull(id);
  }
  await onReady(id);
  update({phase:"ready",model:id,ready:true,installed:true,progress:100,
   transferred:0,total:0,message:"IA gratuite prête ! Aucun compte ni clé API."});
 }
 function start(model="qwen3:4b-instruct"){
  if(task)return status();
  let id;
  try{id=freeModelID(model);}catch(e){throw e;}
  const job=ensure(id,true).catch(e=>update({
   phase:"error",error:formatError(e),message:"Installation inachevée.",ready:false,
   installed:installationOK()
  })).finally(()=>{if(task===job)task=null;});
  task=job;
  return status();
 }
 function resume(model){
  if(task||!installationOK())return status();
  const id=freeModelID(model);
  const job=ensure(id,false).catch(e=>update({phase:"error",error:formatError(e),
   message:"IA gratuite à réactiver.",ready:false,installed:installationOK()
  })).finally(()=>{if(task===job)task=null;});
  task=job;
  return status();
 }
 function stop(){
  if(child&&childStarted){try{child.kill();}catch{}}
  child=null;childStarted=false;
  update({phase:"idle",ready:false,progress:0,message:"IA locale arrêtée."});
 }
 // Installation persists across Companion launches; do not download without consent.
 update({installed:installationOK(),
  message:installationOK()?"Moteur local installé. Clique pour activer ton IA gratuite.":"IA gratuite non installée."});
 return {start,resume,status,stop};
}
