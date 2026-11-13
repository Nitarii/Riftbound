// Free, version-locked local inference choices. All downloads are SHA-256 verified.
// Keep Qwen3 4B for low-end machines; 9B is opt-in and retains the 4B weights.
import {execFileSync} from "node:child_process";
export const DEFAULT_LOCAL_MODEL="qwen3:4b-instruct-2507";
export const ADVANCED_LOCAL_MODEL="qwen3.5:9b-q4km";
export const LOCAL_MODELS=Object.freeze({
 [DEFAULT_LOCAL_MODEL]:Object.freeze({
  id:DEFAULT_LOCAL_MODEL,label:"Équilibré · Qwen3 4B Instruct 2507",
  size:"2,5 Go",file:"qwen3-4b-instruct-2507-Q4_K_M.gguf",minBytes:2_000_000_000,
  expectedBytes:2_500_000_000,
  sha256:"1571ec5115bcfed4b4327fc27b5f44ea284806caf5331eef89326191c9b031d6",
  url:"https://huggingface.co/Open4bits/Qwen3-4B-Instruct-2507-GGUF/resolve/main/qwen3-4b-instruct-2507-Q4_K_M.gguf?download=true"
 }),
 [ADVANCED_LOCAL_MODEL]:Object.freeze({
  id:ADVANCED_LOCAL_MODEL,label:"Avancé · Qwen3.5 9B Q4_K_M",
  size:"5,7 Go",file:"Qwen3.5-9B-Q4_K_M.gguf",minBytes:5_000_000_000,
  expectedBytes:5_680_000_000,
  sha256:"03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8",
  url:"https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf?download=true"
 })
});
export const LOCAL_ENGINES=Object.freeze({
 cpu:Object.freeze({file:"llama-b12277-bin-win-cpu-x64.zip",
  sha256:"5943df89ff76289e16fd9c9600a38871b47f20272c589c3b803eca2181f67a08"}),
 vulkan:Object.freeze({file:"llama-b12277-bin-win-vulkan-x64.zip",
  sha256:"654a08ae224e581832dc7d0bcf5741a23b2a2ace22381e29461d1721de06f3f5"})
});
export function checkLocalModel(id){
 if(!Object.hasOwn(LOCAL_MODELS,id))throw Error("Modèle local non pris en charge.");
 return id;
}
export function checkBackend(value){
 if(!["auto","vulkan","cpu"].includes(value))throw Error("Accélérateur IA inconnu.");
 return value;
}
// GPU vendor discovery is never required for the CPU fallback. No telemetry.
export function hasDiscreteWindowsGPU({platform=process.platform,exec=execFileSync}={}){
 if(platform!=="win32")return false;
 try{
  const result=String(exec("powershell.exe",["-NoProfile","-NonInteractive","-Command",
   "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ';'"],
   {encoding:"utf8",timeout:3500,windowsHide:true,maxBuffer:8192}));
  return /\b(?:nvidia|geforce|rtx|gtx|radeon|amd|intel arc)\b/i.test(result);
 }catch{return false;}
}
// WMI AdapterRAM may be capped to 4 GiB on modern GPUs. Recognize common
// dedicated families and their minimum known VRAM instead of assuming 4 GB.
function knownVRAM(name){
 const s=String(name||"").toLowerCase();
 if(/(?:rx\s*7900\s*xtx|rtx\s*4090)/.test(s))return 24;
 if(/rx\s*7900\s*xt(?!x)/.test(s))return 20;
 if(/(?:rx\s*7800\s*xt|rtx\s*4080|rtx\s*5080|arc\s*a770)/.test(s))return 16;
 if(/(?:rtx\s*4070|rtx\s*5070|rx\s*7700\s*xt|rtx\s*3060\b)/.test(s))return 12;
 if(/(?:rtx\s*4060|rtx\s*5060|rx\s*7600|rx\s*6600|rtx\s*3070|rtx\s*3080)/.test(s))return 8;
 return 0;
}
export function recommendLocalProfile({ramGB=0,gpus=[]}={}){
 const g=(gpus||[]).map(x=>typeof x==="string"?{name:x}:x).filter(x=>
  /(?:nvidia|geforce|rtx|gtx|radeon\s+rx|intel\s+arc)/i.test(x.name||""));
 const best=g.map(gpu=>({
  name:String(gpu.name||"").slice(0,120),
  vramGB:Math.max(knownVRAM(gpu.name),Number(gpu.vramGB)||0)
 })).sort((a,b)=>b.vramGB-a.vramGB)[0]||null;
 const advanced=Number(ramGB)>=16&&!!best&&best.vramGB>=8;
 return {
  model:advanced?ADVANCED_LOCAL_MODEL:DEFAULT_LOCAL_MODEL,
  backend:best?"auto":"cpu",
  gpuAvailable:!!best,
  gpuName:best?.name||"",
  vramGB:best?.vramGB||0,
  ramGB:Number(ramGB)||0,
  reason:advanced?"GPU dédié avec au moins 8 Go de VRAM et mémoire suffisante.":
   "Modèle plus léger recommandé pour conserver une bonne réactivité."
 };
}
export function detectRecommendedLocalProfile({platform=process.platform,exec=execFileSync}={}){
 if(platform!=="win32")return recommendLocalProfile({});
 try{
  const script="$c=Get-CimInstance Win32_ComputerSystem; "+
   "$g=@(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM); "+
   "@{ramBytes=[long]$c.TotalPhysicalMemory;gpus=@($g)} | ConvertTo-Json -Compress -Depth 3";
  const raw=String(exec("powershell.exe",["-NoProfile","-NonInteractive",
   "-Command",script],{encoding:"utf8",timeout:5000,windowsHide:true,maxBuffer:16384}));
  const data=JSON.parse(raw);
  const gpus=(Array.isArray(data.gpus)?data.gpus:[data.gpus]).filter(Boolean).map(g=>({
   name:String(g.Name||g.name||""),
   // AdapterRAM is only used when reporting >4 GiB, since many Windows
   // WMI drivers incorrectly cap high-end GPUs at 4 GiB.
   vramGB:Number(g.AdapterRAM||g.adapterRAM||0)>4_294_967_296?
    Number(g.AdapterRAM||g.adapterRAM)/1_073_741_824:0
  }));
  return recommendLocalProfile({ramGB:Number(data.ramBytes||0)/1_073_741_824,gpus});
 }catch{return recommendLocalProfile({});}
}
export function backendCandidates(choice,{gpuAvailable=false}={}){
 checkBackend(choice);
 return choice==="cpu"?["cpu"]:choice==="vulkan"||gpuAvailable?
  ["vulkan","cpu"]:["cpu"];
}
export function llamaServerArgs({modelFile,model,backend="cpu",threads=4,ctx=8192,port=11435}){
 checkLocalModel(model);
 if(!["cpu","vulkan"].includes(backend))throw Error("Backend inconnu.");
 return ["--model",modelFile,"--host","127.0.0.1","--port",String(port),
  "--ctx-size",String(ctx),"--threads",String(Math.max(1,Math.min(8,threads))),
  "--n-gpu-layers",backend==="vulkan"?"99":"0","--parallel","1","--alias",model,
  // Qwen3.5 is hybrid reasoning. Disabling hidden thinking prevents the
  // local model from exhausting its output budget before writing JSON.
  ...(model===ADVANCED_LOCAL_MODEL?["--reasoning","off"]:[])];
}
