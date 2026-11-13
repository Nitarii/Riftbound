// Free, offline Windows opponent. 4B stays available for smaller PCs; 9B
// is an optional upgrade. Pinned Vulkan inference is attempted only on demand
// or when a discrete GPU is detected, with a CPU fallback.
import fs,{createReadStream} from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {stopOwnedProcess} from "./process-lifecycle.mjs";
import {once} from "node:events";
import {DEFAULT_LOCAL_MODEL,ADVANCED_LOCAL_MODEL,LOCAL_MODELS,LOCAL_ENGINES,
 checkLocalModel,checkBackend,hasDiscreteWindowsGPU,backendCandidates,
 llamaServerArgs} from "./local-ai-profiles.mjs";

const ENGINE_RELEASE="b12277";
export const LOCAL_AI_MODEL=DEFAULT_LOCAL_MODEL;
export const ADVANCED_AI_MODEL=ADVANCED_LOCAL_MODEL;
const MODEL_NAME=LOCAL_AI_MODEL;
const HOST="127.0.0.1",PORT=11435,ORIGIN="http://"+HOST+":"+PORT;
export const FREE_MODELS=Object.freeze(Object.values(LOCAL_MODELS).map(
 ({id,label,size})=>({id,label,size})));
export const FREE_ENGINE_VERSION=ENGINE_RELEASE;
export const FREE_ENGINE_PORT=PORT;
export const FREE_ENGINE_ORIGIN=ORIGIN;
export const FREE_ENGINE_DOWNLOAD={
 url:"https://github.com/ggml-org/llama.cpp/releases/download/"+ENGINE_RELEASE+"/"+LOCAL_ENGINES.cpu.file,
 sha256:LOCAL_ENGINES.cpu.sha256
};
export const FREE_GPU_ENGINE_DOWNLOAD={
 url:"https://github.com/ggml-org/llama.cpp/releases/download/"+ENGINE_RELEASE+"/"+LOCAL_ENGINES.vulkan.file,
 sha256:LOCAL_ENGINES.vulkan.sha256
};
export const FREE_MODEL_DOWNLOAD={
 url:LOCAL_MODELS[MODEL_NAME].url,sha256:LOCAL_MODELS[MODEL_NAME].sha256,
 bytes:LOCAL_MODELS[MODEL_NAME].expectedBytes
};
export const FREE_ADVANCED_MODEL_DOWNLOAD={
 url:LOCAL_MODELS[ADVANCED_LOCAL_MODEL].url,
 sha256:LOCAL_MODELS[ADVANCED_LOCAL_MODEL].sha256,
 bytes:LOCAL_MODELS[ADVANCED_LOCAL_MODEL].expectedBytes
};
export function freeModelID(value){
 if(value===undefined||value===null||value==="")return MODEL_NAME;
 return checkLocalModel(value);
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
 userData,onReady=async()=>{},fetchImpl=fetch,spawnImpl=spawn,extract=null,
 platform=process.platform,detectGPU=()=>hasDiscreteWindowsGPU({platform})
}){
 const root=path.join(userData,"free-opponent");
 const downloads=path.join(root,"downloads"),modelsDir=path.join(root,"models");
 const settingsPath=path.join(root,".profile.json");
 const engineFolder=kind=>kind==="vulkan"?
  path.join(root,"llama-"+ENGINE_RELEASE+"-vulkan"):
  path.join(root,"llama-"+ENGINE_RELEASE);
 const engineMarker=kind=>path.join(engineFolder(kind),".verified.json");
 const modelPath=id=>path.join(modelsDir,LOCAL_MODELS[id].file);
 let preferredModel=MODEL_NAME,preferredBackend="auto",actualBackend="none";
 let active=null,activeModel="",job=null,extractProcess=null,stopping=false,downloadAbort=null;
 let discreteGPU=null,notice="";
 try{
  const saved=JSON.parse(fs.readFileSync(settingsPath,"utf8"));
  if(Object.hasOwn(LOCAL_MODELS,saved.model))preferredModel=saved.model;
  if(["auto","vulkan","cpu"].includes(saved.backend))preferredBackend=saved.backend;
 }catch{}
 const ensureRunning=()=>{if(stopping)throw Error("Installation IA interrompue : fermeture du compagnon.");};
 function persistPreferences(){
  fs.mkdirSync(root,{recursive:true});
  const temp=settingsPath+".tmp";
  fs.writeFileSync(temp,JSON.stringify({model:preferredModel,backend:preferredBackend}),{mode:0o600});
  fs.renameSync(temp,settingsPath);
 }
 async function unpack(archive,directory){
  if(extract){await extract(archive,directory);return;}
  const child=spawnImpl("tar",["-xf",archive,"-C",directory],{
   windowsHide:true,stdio:"ignore",env:process.env
  });
  extractProcess=child;
  try{
   const [code]=await once(child,"close");
   if(code!==0)throw Error("Extraction du moteur IA échouée (code "+code+").");
  }finally{if(extractProcess===child)extractProcess=null;}
 }
 let info={phase:"idle",progress:0,transferred:0,total:0,
  message:"IA gratuite locale non installée.",error:"",model:preferredModel,
  installed:false,ready:false};
 function set(partial){info={...info,...partial};}
 function engineInstalled(kind="cpu"){
  try{
   const saved=JSON.parse(fs.readFileSync(engineMarker(kind),"utf8"));
   return saved.engine===LOCAL_ENGINES[kind].sha256&&Boolean(findServer(engineFolder(kind)));
  }catch{return false;}
 }
 function modelPresent(id=preferredModel){
  const filename=modelPath(id),meta=LOCAL_MODELS[id];
  return fs.existsSync(filename)&&fs.statSync(filename).size>meta.minBytes;
 }
 function status(){
  const processActive=Boolean(active&&active.exitCode==null&&active.signalCode==null&&!active.killed);
  return {...info,model:preferredModel,selectedModel:preferredModel,
   preferredBackend,backend:processActive?actualBackend:"none",
   gpuAvailable:discreteGPU,gpuEngineInstalled:engineInstalled("vulkan"),
   models:FREE_MODELS.map(m=>({...m,installed:modelPresent(m.id)})),
   ready:Boolean(info.ready&&processActive&&activeModel===preferredModel),
   installed:engineInstalled("cpu")&&modelPresent(preferredModel),
   engineInstalled:engineInstalled("cpu"),version:ENGINE_RELEASE,enginePort:PORT,
   free:true,running:Boolean(job),installing:Boolean(job&&!processActive),
   processActive,pid:processActive&&Number.isSafeInteger(active.pid)?active.pid:null,
   notice};
 }
 async function probe(timeout=1200){
  try{
   const response=await fetchImpl(ORIGIN+"/health",{signal:AbortSignal.timeout(timeout)});
   if(!response.ok)return false;
   const payload=await response.json();
   return payload.status==="ok"||payload.status==="no slot available";
  }catch{return false;}
 }
 async function installEngine(kind){
  if(engineInstalled(kind))return;
  if(platform!=="win32")throw Error("Le téléchargement intégré fonctionne sur Windows 10/11 64 bits.");
  const spec=LOCAL_ENGINES[kind],folder=engineFolder(kind);
  const zipFile=path.join(downloads,spec.file);
  const url="https://github.com/ggml-org/llama.cpp/releases/download/"+ENGINE_RELEASE+"/"+spec.file;
  fs.mkdirSync(downloads,{recursive:true});
  fs.rmSync(folder,{recursive:true,force:true});
  fs.mkdirSync(folder,{recursive:true});
  set({phase:"engine",message:"Téléchargement du moteur "+(kind==="vulkan"?"Vulkan GPU":"CPU")+"…",
   progress:0,transferred:0,total:0});
  await downloadVerified(url,zipFile,spec.sha256,(bytes,total)=>
   set({transferred:bytes,total,progress:total?Math.round(bytes/total*100):0}),
   fetchImpl,{signal:downloadAbort?.signal});
  ensureRunning();
  set({phase:"extracting",message:"Extraction du moteur "+kind+"…",progress:0});
  await unpack(zipFile,folder);
  ensureRunning();
  if(!findServer(folder))throw Error("llama-server.exe absent de l'archive "+kind+".");
  fs.writeFileSync(engineMarker(kind),JSON.stringify({engine:spec.sha256,version:ENGINE_RELEASE}),{mode:0o600});
  try{fs.rmSync(zipFile,{force:true});}catch{}
 }
 async function downloadModel(id){
  const spec=LOCAL_MODELS[id],file=modelPath(id);
  if(modelPresent(id)){
   if(await fileSHA256(file)===spec.sha256)return;
   fs.rmSync(file,{force:true});
  }
  set({phase:"model",message:"Téléchargement de "+spec.label+" ("+spec.size+")…",
   transferred:0,total:spec.expectedBytes,progress:0});
  await downloadVerified(spec.url,file,spec.sha256,(bytes,total)=>
   set({transferred:bytes,total:total||spec.expectedBytes,
    progress:Math.min(99,Math.round(bytes/(total||spec.expectedBytes)*100))}),
   fetchImpl,{signal:downloadAbort?.signal});
  ensureRunning();
 }
 async function stopPrevious(){
  if(!active)return;
  const previous=active;
  active=null;activeModel="";actualBackend="none";
  stopOwnedProcess(previous);
  for(let i=0;i<20&&await probe(250);i++)
   await new Promise(resolve=>setTimeout(resolve,150));
 }
 async function launchBackend(kind,id){
  if(!engineInstalled(kind))throw Error("Le moteur "+kind+" n'est pas installé.");
  if(await probe(450))throw Error("Port local 11435 déjà occupé par un autre processus.");
  const executable=findServer(engineFolder(kind));
  const args=llamaServerArgs({modelFile:modelPath(id),model:id,backend:kind,
   threads:os.availableParallelism?.()||4});
  const child=spawnImpl(executable,args,{cwd:path.dirname(executable),
   windowsHide:true,stdio:"ignore"});
  active=child;activeModel=id;actualBackend=kind;
  child.once("error",error=>set({phase:"error",ready:false,error:failure(error)}));
  child.once("exit",()=>{
   if(active===child){
    active=null;activeModel="";actualBackend="none";
    if(!stopping)set({ready:false,phase:"idle",message:"Le moteur IA s'est arrêté."});
   }
  });
  const attempts=kind==="vulkan"?45:150;
  for(let i=0;i<attempts;i++){
   ensureRunning();
   if(active===child&&await probe(550))return;
   if(active!==child||child.exitCode!==null||child.signalCode!==null||child.killed)
    throw Error("Le moteur "+kind+" s'est arrêté au démarrage.");
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error("Démarrage du moteur "+kind+" trop long.");
 }
 async function runServer(id,choice,{allowDownloads=true}={}){
  if(active&&activeModel===id&&await probe())return;
  await stopPrevious();
  if(await probe(500))throw Error("Port local 11435 déjà utilisé par une autre IA.");
  if(discreteGPU===null)discreteGPU=Boolean(detectGPU());
  const choices=backendCandidates(choice,{gpuAvailable:discreteGPU});
  const errors=[];
  for(const kind of choices){
   ensureRunning();
   try{
    if(!engineInstalled(kind)){
     if(!allowDownloads)throw Error("Moteur "+kind+" non installé.");
     await installEngine(kind);
    }
    set({phase:"starting",message:"Chargement "+id+" sur "+(kind==="cpu"?"CPU":"Vulkan GPU")+"…",progress:99});
    await launchBackend(kind,id);
    notice=errors.length?"Accélération GPU indisponible, repli automatique sur CPU.":"";
    return;
   }catch(e){
    errors.push(kind+": "+failure(e));
    await stopPrevious();
    if(kind==="cpu")throw Error(errors.join(" · "));
   }
  }
  throw Error(errors.join(" · "));
 }
 async function prepare({download=true}={}){
  set({phase:"checking",message:"Vérification des fichiers locaux…",ready:false,error:"",progress:0});
  if(!engineInstalled("cpu")){
   if(!download)throw Error("Le moteur IA gratuit doit être installé.");
   await installEngine("cpu");
  }
  if(!modelPresent(preferredModel)){
   if(!download)throw Error("Le modèle choisi doit être téléchargé depuis le gestionnaire.");
   await downloadModel(preferredModel);
  }else if(await fileSHA256(modelPath(preferredModel))!==LOCAL_MODELS[preferredModel].sha256){
   if(!download)throw Error("Le modèle local a échoué au contrôle SHA-256.");
   await downloadModel(preferredModel);
  }
  ensureRunning();
  await runServer(preferredModel,preferredBackend,{allowDownloads:download});
  ensureRunning();
  await onReady(preferredModel);
  ensureRunning();
  set({phase:"ready",ready:true,installed:true,progress:100,transferred:0,total:0,
   message:"✓ "+LOCAL_MODELS[preferredModel].label+" prêt sur "+actualBackend.toUpperCase()+" · gratuit et local."});
 }
 function begin(download,id=preferredModel,choice=preferredBackend){
  checkLocalModel(id);checkBackend(choice);
  if(job)return status();
  preferredModel=id;preferredBackend=choice;
  persistPreferences();
  stopping=false;notice="";downloadAbort=new AbortController();
  const promise=prepare({download}).catch(async error=>{
   // If the optional 9B download failed, keep the previously running 4B
   // opponent alive. Only stop processes from a failed launch attempt.
   const existing=activeModel&&activeModel!==preferredModel&&active&&await probe(800);
   if(existing&&!stopping){
    preferredModel=activeModel;persistPreferences();
    notice="Nouveau profil indisponible : "+failure(error);
    set({phase:"ready",ready:true,installed:true,error:"",
     message:"Le modèle déjà actif a été conservé."});
    return;
   }
   await stopPrevious();
   if(!stopping)set({phase:"error",ready:false,installed:engineInstalled("cpu"),
    error:failure(error),message:"Installation ou démarrage de l'IA inachevé."});
  }).finally(()=>{if(job===promise)job=null;downloadAbort=null;});
  job=promise;
  return status();
 }
 function start(model=preferredModel,{backend=preferredBackend}={}){
  return begin(true,freeModelID(model),backend);
 }
 function resume(model=preferredModel){
  checkLocalModel(model);
  return job?status():engineInstalled("cpu")&&modelPresent(model)?
   begin(false,model,preferredBackend):status();
 }
 function stop(){
  stopping=true;
  downloadAbort?.abort();
  if(extractProcess){stopOwnedProcess(extractProcess);extractProcess=null;}
  if(active){stopOwnedProcess(active);active=null;activeModel="";actualBackend="none";}
  set({phase:"idle",ready:false,progress:0,installed:engineInstalled("cpu"),
   message:"IA locale arrêtée. Modèles conservés."});
 }
 set({installed:engineInstalled("cpu")&&modelPresent(preferredModel),
  message:engineInstalled("cpu")?"IA locale installée. Active le modèle depuis le gestionnaire.":"IA gratuite locale non installée."});
 return {start,resume,status,stop};
}
