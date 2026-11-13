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
  "--n-gpu-layers",backend==="vulkan"?"99":"0","--parallel","1","--alias",model];
}
