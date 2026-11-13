// Portable and fully free opponent: llama.cpp CPU-only Windows x64 + Qwen3 4B Instruct 2507.
// The player downloads both once with a single click; no driver, cloud API,
// paid account, setup wizard, external launcher, or always-on network required.
import fs,{createReadStream} from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {stopOwnedProcess} from "./process-lifecycle.mjs";
import {once} from "node:events";

const ENGINE_RELEASE="b12277";
const ENGINE_FILE="llama-b12277-bin-win-cpu-x64.zip";
const ENGINE_SHA256="5943df89ff76289e16fd9c9600a38871b47f20272c589c3b803eca2181f67a08";
const MODEL_FILE="qwen3-4b-instruct-2507-Q4_K_M.gguf";
const MODEL_SHA256="1571ec5115bcfed4b4327fc27b5f44ea284806caf5331eef89326191c9b031d6";
export const LOCAL_AI_MODEL="qwen3:4b-instruct-2507";
const MODEL_NAME=LOCAL_AI_MODEL;
const ENGINE_URL="https://github.com/ggml-org/llama.cpp/releases/download/"+ENGINE_RELEASE+"/"+ENGINE_FILE;
const MODEL_URL="https://huggingface.co/Open4bits/Qwen3-4B-Instruct-2507-GGUF/resolve/main/"+MODEL_FILE+"?download=true";
const HOST="127.0.0.1",PORT=11435;
const ORIGIN="http://"+HOST+":"+PORT;
const EXPECTED_MODEL_SIZE=2_500_000_000;
export const FREE_MODELS=[{id:MODEL_NAME,label:"Qwen3 4B Instruct 2507 · local",
 size:"2,5 Go"}];
export const FREE_ENGINE_VERSION=ENGINE_RELEASE;
export const FREE_ENGINE_PORT=PORT;
export const FREE_ENGINE_ORIGIN=ORIGIN;
export const FREE_ENGINE_DOWNLOAD={url:ENGINE_URL,sha256:ENGINE_SHA256};
export const FREE_MODEL_DOWNLOAD={url:MODEL_URL,sha256:MODEL_SHA256,bytes:EXPECTED_MODEL_SIZE};

export function freeModelID(value){
 if(value===undefined||value===null||value==="")return MODEL_NAME;
 if(value!==MODEL_NAME)throw Error("Un seul modèle local est disponible : Qwen3 4B Instruct 2507.");
 return MODEL_NAME;
}
export function verifiedDownloadHash(bytes,expected){
 return crypto.createHash("sha256").update(bytes).digest("hex")===expected;
}
async function fileSHA256(filename){
 const sha=crypto.createHash("sha256");
 for await(const chunk of createReadStream(filename,{highWaterMark:1024*1024}))sha.update(chunk);
 return sha.digest("hex");
}
// Resume interrupted model downloads into a private .part file. Never promote
// weights to the final filename until the entire SHA-256 has been checked.
export async function downloadVerified(url,target,expected,report=()=>{},fetchImpl=fetch,
 {signal,maxAttempts=3}={}){
 const temporary=target+".part";
 fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target)){
  if(await fileSHA256(target)===expected)return fs.statSync(target).size;
  fs.rmSync(target,{force:true});
 }
 const tries=Math.max(1,Math.min(5,Number(maxAttempts)||3));
 for(let attempt=0;attempt<tries;attempt++){
  if(signal?.aborted)throw Error("Téléchargement annulé.");
  let offset=fs.existsSync(temporary)?fs.statSync(temporary).size:0;
  let stream=null;
  try{
   const headers=offset?{Range:"bytes="+offset+"-"}:{};
   const timeout=AbortSignal.timeout(2*60*60*1000);
   const combined=signal?AbortSignal.any([signal,timeout]):timeout;
   const response=await fetchImpl(url,{redirect:"follow",headers,signal:combined});
   if(response.status===416&&offset){
    fs.rmSync(temporary,{force:true});
    continue;
   }
   if(!response.ok||!response.body){
    const error=Error("Téléchargement officiel HTTP "+response.status);
    if(response.status>=400&&response.status<500&&response.status!==408&&response.status!==429)error.fatal=true;
    throw error;
   }
   if(offset&&response.status===206){
    const range=String(response.headers.get("content-range")||"");
    const match=/^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(range);
    if(!match||Number(match[1])!==offset){
     fs.rmSync(temporary,{force:true});
     throw Error("Réponse HTTP Range incohérente ; reprise à zéro.");
    }
   }else if(offset){
    // Servers that ignore Range may return 200. Restart rather than append.
    fs.rmSync(temporary,{force:true});
    offset=0;
   }else if(response.status===206){
    const range=String(response.headers.get("content-range")||"");
    if(!/^bytes 0-\d+\/(\d+|\*)$/i.test(range))
     throw Error("Réponse HTTP partielle incorrecte.");
   }
   const length=Number(response.headers.get("content-length"))||0;
   const total=length?offset+length:0;
   stream=fs.createWriteStream(temporary,{flags:offset?"a":"w",mode:0o600});
   let received=offset;
   for await(const chunk of response.body){
    if(signal?.aborted)throw Error("Téléchargement annulé.");
    const part=Buffer.from(chunk);
    received+=part.length;
    if(!stream.write(part))await once(stream,"drain");
    report(received,total);
   }
   await new Promise((resolve,reject)=>stream.end(error=>error?reject(error):resolve()));
   stream=null;
   if(await fileSHA256(temporary)!==expected){
    fs.rmSync(temporary,{force:true});
    const error=Error("Échec du contrôle d'intégrité SHA-256. Le fichier a été rejeté.");
    error.fatal=true;throw error;
   }
   if(signal?.aborted)throw Error("Téléchargement annulé.");
   fs.renameSync(temporary,target);
   return received;
  }catch(error){
   stream?.destroy();
   if(signal?.aborted)throw Error("Téléchargement annulé.");
   if(error?.fatal||attempt===tries-1)throw error;
  }
 }
 throw Error("Téléchargement interrompu.");
}
function findServer(folder,depth=4){
 if(depth<0||!fs.existsSync(folder))return "";
 const entries=fs.readdirSync(folder,{withFileTypes:true});
 const found=entries.find(x=>x.isFile()&&x.name.toLowerCase()==="llama-server.exe");
 if(found)return path.join(folder,found.name);
 for(const entry of entries){
  if(entry.isDirectory()){
   const result=findServer(path.join(folder,entry.name),depth-1);
   if(result)return result;
  }
 }
 return "";
}
function failure(error){
 if(error?.code==="ENOENT")return "Windows tar est introuvable. Windows 10/11 64 bits est requis.";
 return String(error?.message||error||"Erreur inconnue").slice(0,350);
}
export function createFreeLocalAI({
 userData,onReady=async()=>{},
 fetchImpl=fetch,spawnImpl=spawn,
 extract=null,
 platform=process.platform
}){
 const root=path.join(userData,"free-opponent");
 const engineFolder=path.join(root,"llama-"+ENGINE_RELEASE);
 const modelFolder=path.join(root,"models");
 const zipFile=path.join(root,"downloads",ENGINE_FILE);
 const modelFile=path.join(modelFolder,MODEL_FILE);
 const marker=path.join(engineFolder,".verified.json");
 let active=null,job=null,extractProcess=null,stopping=false,downloadAbort=null;
 const ensureRunning=()=>{if(stopping)throw Error("Installation IA interrompue : fermeture du compagnon.");};
 async function unpack(archive,directory){
  if(extract){await extract(archive,directory);return;}
  const child=spawnImpl("tar",["-xf",archive,"-C",directory],{
   windowsHide:true,stdio:"ignore",env:process.env
  });
  extractProcess=child;
  try{
   const [code]=await once(child,"close");
   if(code!==0)throw Error("L'extraction du moteur CPU a échoué (code "+code+").");
  }finally{if(extractProcess===child)extractProcess=null;}
 }
 let info={phase:"idle",progress:0,transferred:0,total:0,message:"IA gratuite CPU non installée.",
  error:"",model:MODEL_NAME,installed:false,ready:false};
 function set(partial){info={...info,...partial};}
 function status(){
  const processActive=Boolean(active&&active.exitCode==null&&active.signalCode==null&&!active.killed);
  return {...info,ready:Boolean(info.ready&&processActive),
   installed:installed()&&modelPresent(),engineInstalled:installed(),models:FREE_MODELS,version:ENGINE_RELEASE,enginePort:PORT,
   free:true,running:Boolean(job),installing:Boolean(job&&!processActive),
   processActive,pid:processActive&&Number.isSafeInteger(active.pid)?active.pid:null};
 }
 function installed(){
  try{
   const saved=JSON.parse(fs.readFileSync(marker,"utf8"));
   return saved.engine===ENGINE_SHA256&&Boolean(findServer(engineFolder));
  }catch{return false;}
 }
 function modelPresent(){return fs.existsSync(modelFile)&&fs.statSync(modelFile).size>2_000_000_000;}
 async function probe(timeout=1200){
  try{
   const response=await fetchImpl(ORIGIN+"/health",{signal:AbortSignal.timeout(timeout)});
   if(!response.ok)return false;
   const payload=await response.json();
   return payload.status==="ok"||payload.status==="no slot available";
  }catch{return false;}
 }
 async function installEngine(){
  if(installed())return;
  if(platform!=="win32")throw Error("Le téléchargement intégré fonctionne sur Windows 10/11 64 bits.");
  fs.mkdirSync(path.dirname(zipFile),{recursive:true});
  fs.rmSync(engineFolder,{recursive:true,force:true});
  fs.mkdirSync(engineFolder,{recursive:true});
  set({phase:"engine",message:"Téléchargement du petit moteur CPU (25 Mo)…",progress:0,transferred:0,total:0});
  await downloadVerified(ENGINE_URL,zipFile,ENGINE_SHA256,(bytes,total)=>
   set({transferred:bytes,total,progress:total?Math.round(bytes/total*100):0}),fetchImpl,
   {signal:downloadAbort?.signal});
  ensureRunning();
  set({phase:"extracting",message:"Extraction du moteur CPU…",progress:0});
  await unpack(zipFile,engineFolder);
  ensureRunning();
  if(!findServer(engineFolder))throw Error("Le fichier llama-server.exe est absent de l'archive officielle.");
  fs.writeFileSync(marker,JSON.stringify({engine:ENGINE_SHA256,version:ENGINE_RELEASE}),{mode:0o600});
  try{fs.rmSync(zipFile,{force:true});}catch{}
 }
 async function downloadModel(){
  if(modelPresent()){
   // Verify cached file before first loading; never trust a pre-existing weight.
   if(await fileSHA256(modelFile)===MODEL_SHA256)return;
   fs.rmSync(modelFile,{force:true});
  }
  set({phase:"model",message:"Téléchargement de Qwen3 4B Instruct (environ 2,5 Go)…",
   transferred:0,total:EXPECTED_MODEL_SIZE,progress:0});
  await downloadVerified(MODEL_URL,modelFile,MODEL_SHA256,(bytes,total)=>
   set({transferred:bytes,total:total||EXPECTED_MODEL_SIZE,
    progress:Math.min(99,Math.round(bytes/(total||EXPECTED_MODEL_SIZE)*100))}),fetchImpl,
   {signal:downloadAbort?.signal});
  ensureRunning();
 }
 async function runServer(){
  ensureRunning();
  if(active&&await probe())return;
  // Never attach to another process bound to the reserved port.
  if(!active&&await probe())throw Error("Le port local 11435 est déjà utilisé. Ferme l'autre serveur et réessaie.");
  const executable=findServer(engineFolder);
  if(!executable)throw Error("L'exécutable CPU est introuvable.");
  const args=["--model",modelFile,"--host",HOST,"--port",String(PORT),
   "--ctx-size","8192","--threads",String(Math.max(1,Math.min(8,os.availableParallelism?.()||4))),
   "--n-gpu-layers","0","--parallel","1","--alias",MODEL_NAME];
  const child=spawnImpl(executable,args,{cwd:path.dirname(executable),windowsHide:true,stdio:"ignore"});
  active=child;
  child.once("error",error=>set({phase:"error",ready:false,error:failure(error)}));
  child.once("exit",()=>{
   if(active===child){
    active=null;
    if(!stopping)set({ready:false,phase:"idle",message:"Le moteur Qwen s'est arrêté."});
   }
  });
  for(let i=0;i<150;i++){
   ensureRunning();
   if(await probe(1400))return;
   if(!active)throw Error("Le moteur CPU s'est arrêté au démarrage. Vérifie l'architecture Windows.");
   await new Promise(resolve=>setTimeout(resolve,450));
  }
  throw Error("Démarrage de l'IA trop long. Sur un vieux PC, vérifie la RAM disponible.");
 }
 async function prepare({download=true}={}){
  set({phase:"checking",message:"Vérification des fichiers locaux…",ready:false,error:"",progress:0});
  if(!installed()){
   if(!download)throw Error("L'IA gratuite doit être installée une seule fois.");
   await installEngine();
  }
  if(!modelPresent()){
   if(!download)throw Error("Le nouveau modèle Qwen3 4B doit être installé depuis le bouton unique.");
   await downloadModel();
  }else if(await fileSHA256(modelFile)!==MODEL_SHA256){
   if(!download)throw Error("Le modèle n'est pas valide ; relance l'installation.");
   await downloadModel();
  }
  ensureRunning();
  set({phase:"starting",message:"Démarrage du modèle sur le processeur…",progress:99});
  await runServer();
  ensureRunning();
  await onReady(MODEL_NAME);
  ensureRunning();
  // Delete only the old, known Qwen3 0.6B file, and only after the new model started successfully.
  try{fs.rmSync(path.join(modelFolder,"Qwen3-0.6B-Q8_0.gguf"),{force:true});}catch{}
  set({phase:"ready",ready:true,installed:true,progress:100,transferred:0,total:0,
   message:"✓ IA gratuite prête, sans GPU, abonnement ni requête payante."});
 }
 function begin(download){
  if(job)return status();
  stopping=false;
  downloadAbort=new AbortController();
  const promise=prepare({download}).catch(error=>{
   if(!stopping)set({phase:"error",ready:false,installed:installed(),
    error:failure(error),message:"Installation inachevée."});
  }).finally(()=>{if(job===promise)job=null;downloadAbort=null;});
  job=promise;
  return status();
 }
 function start(model=MODEL_NAME){freeModelID(model);return begin(true);}
 function resume(model=MODEL_NAME){freeModelID(model);return job?status():installed()&&modelPresent()?begin(false):status();}
 function stop(){
  stopping=true;
  downloadAbort?.abort();
  if(extractProcess){stopOwnedProcess(extractProcess);extractProcess=null;}
  if(active){stopOwnedProcess(active);active=null;}
  set({phase:"idle",ready:false,progress:0,installed:installed(),message:"IA locale arrêtée. Les modèles sont conservés."});
 }
 set({installed:installed(),message:installed()?"Moteur CPU installé. Active l'IA gratuite.":"IA gratuite CPU non installée."});
 return {start,resume,status,stop};
}
