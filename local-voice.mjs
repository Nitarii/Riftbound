// Entirely local, continuous speech capture. PCM16 mono 16k WAV to whisper.cpp.
// Browser scripts, microphone access and audio buffers exist only during active voice mode.
export function audioToWav(chunks,inputRate=48000){
 const all=chunks||[],total=all.reduce((n,a)=>n+a.length,0);
 if(!total||total>inputRate*19)throw Error("Durée de parole non valide.");
 const source=new Float32Array(total);
 let off=0;for(const part of all){source.set(part,off);off+=part.length;}
 const outputLength=Math.ceil(total*16000/inputRate);
 const wav=new ArrayBuffer(44+outputLength*2),view=new DataView(wav);
 const ascii=(pos,text)=>{for(let i=0;i<text.length;i++)view.setUint8(pos+i,text.charCodeAt(i));};
 ascii(0,"RIFF");view.setUint32(4,wav.byteLength-8,true);ascii(8,"WAVE");
 ascii(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,16000,true);
 view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 ascii(36,"data");view.setUint32(40,outputLength*2,true);
 for(let i=0;i<outputLength;i++){
  const start=Math.floor(i*inputRate/16000),end=Math.min(total,Math.ceil((i+1)*inputRate/16000));
  let sample=0;
  for(let j=start;j<Math.max(start+1,end);j++)sample+=source[Math.min(j,total-1)];
  sample/=Math.max(1,end-start);
  sample=Math.max(-1,Math.min(1,sample));
  view.setInt16(44+i*2,sample<0?Math.round(sample*32768):Math.round(sample*32767),true);
 }
 return new Blob([wav],{type:"audio/wav"});
}
export const audioRms=samples=>Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/Math.max(1,samples.length));
export function createLocalVoiceConversation({
 mediaDevices=navigator.mediaDevices,AudioContextCtor=window.AudioContext||window.webkitAudioContext,
 synthesis=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance,
 onTranscript=()=>{},onPreview=()=>{},onState=()=>{},sendAudio,
 silenceMs=650,threshold=.012
}={}){
 let enabled=false,hidden=false,phase="off",detail="",speaking=false,speechEnabled=true;
 let stream=null,ctx=null,processor=null,source=null,output=null,locale="fr-FR";
 let speechStart=0,lastVoice=0,buffer=[],preRoll=[],busy=false,utterances=[],currentSpeech=null;
 let queue=[],captureId=0,voicedMs=0,consecutiveVoice=0,noiseFloor=.003;
 const state=()=>({enabled,phase,detail,speaking,listening:Boolean(enabled&&!hidden&&!speaking),
  speechEnabled,available:!!mediaDevices?.getUserMedia,noSpeech:0});
 const emit=(p=phase,d=detail)=>{phase=p;detail=d;onState(state());};
 const clearBuffers=()=>{buffer=[];preRoll=[];speechStart=0;lastVoice=0;voicedMs=0;consecutiveVoice=0;};
 async function drainQueue(){
  if(busy||!queue.length||!enabled)return;
  busy=true;const session=captureId;
  while(queue.length&&enabled&&session===captureId){
   const frames=queue.shift();
   emit("captured","Transcription Whisper locale…");
   try{
    const blob=audioToWav(frames,ctx?.sampleRate||48000);
    const response=await sendAudio(blob);
    if(!enabled||session!==captureId)break;
    const text=String(response?.text||"").trim();
    if(text){
     onPreview(text);
     emit("captured","Entendu : "+text.slice(0,100));
     await onTranscript(text);
    }else emit("listening","Aucune phrase reconnue.");
   }catch(e){
    if(enabled&&session===captureId)emit("error","Whisper : "+String(e?.message||e).slice(0,140));
   }
  }
  busy=false;
  if(enabled&&!hidden&&!speaking)emit("listening","Micro actif · parle naturellement.");
 }
 async function finalize(){
  if(!speechStart||!buffer.length){clearBuffers();return;}
  const frames=buffer;
  const duration=performance.now()-speechStart;
  const voiced=voicedMs;
  clearBuffers();
  if(voiced<130||duration<240)return; // Reject clicks and very short noise.
  if(queue.length>=3){
   emit("waiting","Transcription en retard : attends un instant avant de poursuivre.");
   return;
  }
  queue.push(frames);
  void drainQueue();
 }
 function processAudio(event){
  if(!enabled||hidden||speaking)return;
  const data=new Float32Array(event.inputBuffer.getChannelData(0));
  const level=audioRms(data),now=performance.now();
  const frameMs=1000*data.length/(ctx?.sampleRate||48000);
  if(!speechStart&&level<Math.max(threshold,noiseFloor*3))
   noiseFloor=noiseFloor*.98+level*.02;
  const isVoice=level>=Math.max(threshold,noiseFloor*3);
  if(isVoice){consecutiveVoice++;lastVoice=now;if(speechStart)voicedMs+=frameMs;}
  else consecutiveVoice=0;
  if(!speechStart&&consecutiveVoice>=2){
   speechStart=now-frameMs;
   voicedMs=frameMs*consecutiveVoice;
   buffer=preRoll.splice(0);
   emit("hearing","Je t'écoute…");
  }
  if(speechStart){
   buffer.push(data);
   if(now-speechStart>=15000||(now-lastVoice>=silenceMs&&now-speechStart>=250))
    void finalize();
  }else{
   preRoll.push(data);
   const limit=Math.ceil((ctx?.sampleRate||48000)*.34/data.length);
   if(preRoll.length>limit)preRoll.shift();
  }
 }
 async function start(){
  if(enabled)return true;
  if(!mediaDevices?.getUserMedia||!AudioContextCtor||typeof sendAudio!=="function"){
   emit("error","Capture locale du microphone indisponible.");
   return false;
  }
  try{
   stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,
    noiseSuppression:true,autoGainControl:true},video:false});
   ctx=new AudioContextCtor({latencyHint:"interactive"});
   source=ctx.createMediaStreamSource(stream);
   processor=ctx.createScriptProcessor(2048,1,1);
   output=ctx.createGain();output.gain.value=0;
   source.connect(processor);processor.connect(output);output.connect(ctx.destination);
   processor.onaudioprocess=processAudio;
   enabled=true;hidden=false;queue=[];noiseFloor=.003;captureId++;clearBuffers();
   emit("listening","Whisper local actif · aucune voix envoyée à Chrome.");
   return true;
  }catch(e){
   stop();emit("error","Micro inaccessible : "+String(e?.message||e));
   return false;
  }
 }
 function stop(){
  enabled=false;captureId++;queue=[];
  if(processor){processor.onaudioprocess=null;try{processor.disconnect();}catch{}}
  try{source?.disconnect();output?.disconnect();}catch{}
  stream?.getTracks().forEach(track=>track.stop());
  try{ctx?.close();}catch{}
  stream=null;ctx=null;source=null;output=null;processor=null;
  clearBuffers();utterances=[];currentSpeech=null;
  if(synthesis)try{synthesis.cancel();}catch{}
  speaking=false;emit("off","Micro local désactivé.");
 }
 async function flush(){if(speechStart&&buffer.length)await finalize();}
 function playNext(){
  if(!enabled||speaking||!utterances.length||!speechEnabled||!synthesis||!Utterance)return;
  const text=utterances.shift();
  const utterance=new Utterance(text);
  utterance.lang=locale;utterance.rate=1.05;
  speaking=true;currentSpeech=utterance;emit("speaking","Réponse vocale de l'IA…");
  const done=()=>{
   if(currentSpeech!==utterance)return;
   currentSpeech=null;speaking=false;
   if(utterances.length)playNext();else if(enabled)emit("listening","Micro local actif.");
  };
  utterance.onend=done;utterance.onerror=done;
  try{synthesis.speak(utterance);}catch{done();}
 }
 function speak(text){
  if(!enabled||!speechEnabled)return false;
  utterances.push(String(text).slice(0,850));playNext();return true;
 }
 function setSpeechEnabled(value){
  speechEnabled=Boolean(value);
  if(!speechEnabled){utterances=[];try{synthesis?.cancel();}catch{}speaking=false;currentSpeech=null;}
  emit();
 }
 function setHidden(value){
  hidden=Boolean(value);
  if(hidden)clearBuffers();
  emit(hidden?"waiting":"listening",hidden?"Écoute locale en pause (onglet masqué).":"Écoute locale reprise.");
 }
 function setLanguage(value){locale=value==="en"?"en-US":"fr-FR";}
 return {start,stop,flush,speak,setSpeechEnabled,setHidden,setLanguage,state};
}
