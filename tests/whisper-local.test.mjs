import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {EventEmitter} from "node:events";
import {audioToWav,audioRms,isNonSpeechTranscript} from "../local-voice.mjs";
import {
 WHISPER_RELEASE,WHISPER_OPTIONS,WHISPER_MODEL,WHISPER_ENGINE_SHA,
 whisperPrompt,whisperArguments,whisperServerArguments,validateWAV,createLocalWhisper
} from "../whisper-local.mjs";

test("official multilingual speech sources have pinned SHA-256 and CPU binaries",()=>{
 assert.equal(WHISPER_MODEL,"small");
 assert.deepEqual(Object.keys(WHISPER_OPTIONS),["small"]);
 assert.match(WHISPER_RELEASE,/^b\d+$/);
 assert.match(WHISPER_ENGINE_SHA,/^[a-f0-9]{64}$/);
 for(const [name,model] of Object.entries(WHISPER_OPTIONS)){
  assert.match(model.sha256,/^[a-f0-9]{64}$/);
  assert.match(model.url,/^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\//);
  assert.ok(model.bytes>1e8);
 }
 const args=whisperArguments({model:"C:\\Riftbound\\speech\\models\\ggml-small.bin",
  wav:"C:\\Riftbound\\speech\\temp\\sample.wav",
  out:"C:\\Riftbound\\speech\\temp\\sample",language:"auto",prompt:"Shen, Loyal Poro"});
 assert.ok(args.includes("--no-gpu"));
 assert.ok(args.includes("--prompt"));
 assert.ok(args.includes("auto"));
 assert.equal(args[args.indexOf("--output-file")+1],"C:\\Riftbound\\speech\\temp\\sample");
});
test("Riftbound card names guide transcription without overflowing model context",()=>{
 const text=whisperPrompt([
  {name:"Loyal Poro"},{name:"Shen, Leader of the Kinkou Order"},
  {name:"Jinx, Loose Cannon"},{name:"Grove of the God-Willow"}],220);
 assert.ok(text.includes("Riftbound"));
 assert.ok(text.includes("Loyal Poro"));
 assert.ok(text.includes("Shen"));
 assert.ok(text.length<=225);
});
test("captured audio is local PCM16 mono 16 kHz RIFF, rejects malformed recordings",async()=>{
 const chunks=[Float32Array.from({length:2048},(_,i)=>Math.sin(i/10)*.12),
  Float32Array.from({length:2048},()=>.1)];
 assert.ok(audioRms(chunks[0])>.05);
 const wav=Buffer.from(await audioToWav(chunks,48000).arrayBuffer());
 assert.equal(wav.toString("ascii",0,4),"RIFF");
 assert.equal(wav.readUInt32LE(24),16000);
 assert.equal(wav.readUInt16LE(22),1);
 assert.equal(wav.readUInt16LE(34),16);
 assert.equal(validateWAV(wav),wav);
 assert.throws(()=>validateWAV(Buffer.from("malware")) ,/WAV invalide/);
 const invalid=Buffer.from(wav);invalid.writeUInt16LE(2,22);
 assert.throws(()=>validateWAV(invalid),/mono/);
});
test("speech installer, WAV and transcription output use only the selected folder",async()=>{
 const location=fs.mkdtempSync(path.join(os.tmpdir(),"riftbound-whisper-"));
 let files=[],calls=[];
 try{
  const tool=createLocalWhisper({
   userData:location,platform:"win32",
   download:async(url,destination)=>{
    assert.ok(destination.startsWith(path.join(location,"speech")));
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,"fake downloaded file");files.push(destination);
   },
   extract:async(zip,dir)=>{
    assert.ok(zip.startsWith(location));fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"whisper-cli.exe"),"fake cli");
   },
   spawnImpl:(exe,args,opts)=>{
    assert.ok(exe.startsWith(location));
    assert.equal(opts.env.TEMP,path.join(location,"speech","temp"));
    calls.push({exe,args,opts});
    const proc=new EventEmitter();proc.kill=()=>{};
    const outfile=args[args.indexOf("--output-file")+1];
    fs.writeFileSync(outfile+".txt","Je joue Loyal Poro");
    setImmediate(()=>proc.emit("close",0));
    return proc;
   }
  });
  assert.equal(tool.status().installed,false);
  tool.begin();
  for(let n=0;n<50&&tool.status().running;n++)await new Promise(r=>setTimeout(r,10));
  assert.equal(tool.status().installed,true,tool.status().error);
  assert.ok(files.some(p=>p.endsWith("ggml-small.bin")));
  const result=await tool.transcribe(Buffer.from(await audioToWav([
   Float32Array.from({length:16000},()=>.05)],16000).arrayBuffer()),{
   language:"auto",cards:[{name:"Loyal Poro"}]
  });
  assert.equal(result.text,"Je joue Loyal Poro");
  assert.equal(calls.length,1);
  assert.equal(fs.readdirSync(path.join(location,"speech","temp")).length,0);
  const persisted=createLocalWhisper({userData:location});
  assert.equal(persisted.status().selected,"small");
  assert.equal(persisted.status().installed,true);
 }finally{fs.rmSync(location,{recursive:true,force:true});}
});

test("warmed Whisper Small server is scoped to loopback and a private path",()=>{
 const args=whisperServerArguments({model:"C:\\Riftbound\\speech\\models\\ggml-small.bin",
  port:45678,threads:6,requestPath:"/local-secret"});
 assert.equal(args[args.indexOf("--host")+1],"127.0.0.1");
 assert.equal(args[args.indexOf("--port")+1],"45678");
 assert.equal(args[args.indexOf("--request-path")+1],"/local-secret");
 assert.ok(args.includes("--no-gpu"));
 assert.throws(()=>whisperServerArguments({model:"x",port:80}),/Port local/);
});
test("hands-free speech uses shorter pauses and retains microphone capture while transcription runs",()=>{
 const src=fs.readFileSync(new URL("../local-voice.mjs",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const relay=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(src,/silenceMs=480/);
 assert.doesNotMatch(src,/hidden\|\|speaking\|\|busy\)return/);
 assert.match(src,/queue\.push\(frames\)/);
 assert.match(app,/await voiceController\.flush\(\)/);
 assert.match(app,/\/api\/speech\/warm/);
 assert.match(relay,/url\.pathname==="\/api\/speech\/warm"/);
});

test("microphone ignores sound effects like (whoosh) but not actual spoken commands",()=>{
 assert.equal(isNonSpeechTranscript("(whoosh)"),true);
 assert.equal(isNonSpeechTranscript("[Music]"),true);
 assert.equal(isNonSpeechTranscript("Je joue Loyal Poro pour trois runes."),false);
 assert.equal(isNonSpeechTranscript("Shen"),false);
});
