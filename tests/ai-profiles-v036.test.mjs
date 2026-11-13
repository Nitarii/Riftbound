import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DEFAULT_LOCAL_MODEL,ADVANCED_LOCAL_MODEL,LOCAL_MODELS,LOCAL_ENGINES,
 checkLocalModel,checkBackend,backendCandidates,hasDiscreteWindowsGPU,
 llamaServerArgs} from "../local-ai-profiles.mjs";
import {FREE_GPU_ENGINE_DOWNLOAD,FREE_ADVANCED_MODEL_DOWNLOAD} from "../free-ai.mjs";

test("both free models and Vulkan binary are pinned to exact SHA-256",()=>{
 assert.equal(DEFAULT_LOCAL_MODEL,"qwen3:4b-instruct-2507");
 assert.equal(ADVANCED_LOCAL_MODEL,"qwen3.5:9b-q4km");
 for(const [id,m] of Object.entries(LOCAL_MODELS)){
  assert.equal(checkLocalModel(id),id);
  assert.match(m.sha256,/^[a-f0-9]{64}$/);
  assert.match(m.url,/^https:\/\/huggingface\.co\//);
  assert.match(m.file,/\.gguf$/);
 }
 assert.match(LOCAL_ENGINES.vulkan.sha256,/^[a-f0-9]{64}$/);
 assert.match(FREE_GPU_ENGINE_DOWNLOAD.url,/llama-b12277-bin-win-vulkan-x64\.zip$/);
 assert.equal(FREE_ADVANCED_MODEL_DOWNLOAD.sha256,LOCAL_MODELS[ADVANCED_LOCAL_MODEL].sha256);
 assert.throws(()=>checkLocalModel("../../evil"),/non pris en charge/);
 assert.throws(()=>checkBackend("rocm"),/inconnu/);
});
test("automatic acceleration chooses GPU only when detected and always retains CPU fallback",()=>{
 assert.deepEqual(backendCandidates("auto",{gpuAvailable:true}),["vulkan","cpu"]);
 assert.deepEqual(backendCandidates("auto",{gpuAvailable:false}),["cpu"]);
 assert.deepEqual(backendCandidates("vulkan",{gpuAvailable:false}),["vulkan","cpu"]);
 assert.deepEqual(backendCandidates("cpu",{gpuAvailable:true}),["cpu"]);
});
test("GPU detection is Windows-only, bounded and fails safely",()=>{
 let requests=0;
 const exec=()=>{requests++;return "AMD Radeon RX 7900 XT";};
 assert.equal(hasDiscreteWindowsGPU({platform:"linux",exec}),false);
 assert.equal(requests,0);
 assert.equal(hasDiscreteWindowsGPU({platform:"win32",exec}),true);
 assert.equal(hasDiscreteWindowsGPU({platform:"win32",exec:()=> "Intel UHD Graphics"}),false);
 assert.equal(hasDiscreteWindowsGPU({platform:"win32",exec:()=>{throw Error("not available")}}),false);
});
test("llama.cpp args never accept arbitrary paths as model names and switch only GPU layers",()=>{
 const base={modelFile:"C:/safe/model.gguf",model:ADVANCED_LOCAL_MODEL,threads:12};
 const gpu=llamaServerArgs({...base,backend:"vulkan"});
 const cpu=llamaServerArgs({...base,backend:"cpu"});
 const flag=xs=>xs[xs.indexOf("--n-gpu-layers")+1];
 assert.equal(flag(gpu),"99");
 assert.equal(flag(cpu),"0");
 assert.equal(gpu[gpu.indexOf("--threads")+1],"8");
 assert.ok(gpu.includes("--ctx-size"));
 assert.throws(()=>llamaServerArgs({...base,model:"../../arbitrary"}),/non pris en charge/);
});
test("Windows manager offers local 4B/9B and Vulkan/CPU but not an external key",()=>{
 const page=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 for(const id of ["ai-profile","ai-backend","ai-runtime","ai-install"])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/value="qwen3\.5:9b-q4km"/);
 assert.match(page,/value="auto"/);
 assert.match(page,/value="cpu"/);
 assert.match(page,/value="vulkan"/);
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(server,/backend:input\.backend\|\|"auto"/);
});
