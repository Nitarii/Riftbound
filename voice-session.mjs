// Browser-side hands-free game voice. No API key, vendor or paid service.
// SpeechRecognition may use Chrome's online transcription service.
// Controller is isolated from the DOM to allow deterministic regression tests.
export const VOICE_FAILURES=Object.freeze({
 "not-allowed":"Chrome n'autorise pas le microphone. Vérifie le cadenas à gauche de l'adresse et les autorisations micro de Windows.",
 "service-not-allowed":"Le service vocal est bloqué dans Chrome. Vérifie les autorisations du site et les paramètres du navigateur.",
 "audio-capture":"Aucun microphone utilisable. Vérifie le périphérique d'entrée choisi dans Chrome et dans Paramètres Windows > Son.",
 "language-not-supported":"La reconnaissance du français n'est pas disponible dans ce navigateur.",
 "network":"La reconnaissance vocale de Chrome ne répond pas au réseau. Elle peut nécessiter Internet ; la saisie clavier reste disponible."
});
const fatal=new Set(["not-allowed","service-not-allowed","audio-capture","language-not-supported"]);
const clean=text=>String(text||"").replace(/\s+/g," ").trim();
export function createVoiceConversation({
 Recognition,
 synthesis=null,
 Utterance=null,
 onTranscript=()=>{},
 onPreview=()=>{},
 onState=()=>{},
 setTimer=setTimeout,
 clearTimer=clearTimeout,
 silenceMs=1450,
 restartMs=750,
 language="fr"
}={}){
 let enabled=false,current=null,epoch=0,seenFinal=new Set();
 let locale=language==="en"?"en-US":"fr-FR";
 let finalParts=[],interim="",flushTimer=null,restartTimer=null;
 let speaking=false,speechEnabled=true,spokenQueue=[],currentSpeech=null,speechTimer=null;
 let noSpeech=0,networkFailures=0,hidden=false,phase="off",detail="";
 const state=()=>({enabled,phase,detail,speaking,listening:Boolean(current),
  speechEnabled,available:!!Recognition,noSpeech});
 const emit=(next=phase,message=detail)=>{
  phase=next;detail=message;onState(state());
 };
 const clearFlush=()=>{if(flushTimer!==null)clearTimer(flushTimer);flushTimer=null;};
 const clearRestart=()=>{if(restartTimer!==null)clearTimer(restartTimer);restartTimer=null;};
 const clearSpeechTimer=()=>{if(speechTimer!==null)clearTimer(speechTimer);speechTimer=null;};
 const preview=()=>onPreview(clean([...finalParts,interim].filter(Boolean).join(" ")).slice(0,1200));
 function flush(){
  clearFlush();
  if(!finalParts.length){interim="";preview();return;}
  const result=clean(finalParts.join(" ")).slice(0,1200);
  finalParts=[];interim="";preview();
  if(result)Promise.resolve().then(()=>onTranscript(result))
    .catch(e=>emit("error","Envoi vocal impossible : "+String(e?.message||e).slice(0,140)));
 }
 function nextFlush(){
  clearFlush();
  flushTimer=setTimer(flush,silenceMs);
 }
 function retry(delay=restartMs){
  clearRestart();
  if(!enabled||hidden||speaking)return;
  restartTimer=setTimer(()=>{restartTimer=null;listen();},delay);
 }
 function listen(){
  if(!enabled||hidden||speaking||current||!Recognition)return;
  let rec;
  try{
   rec=new Recognition();
   rec.lang=locale;
   rec.continuous=true;
   rec.interimResults=true;
   rec.maxAlternatives=1;
  }catch(e){
   enabled=false;emit("error","Impossible d'initialiser la reconnaissance vocale : "+String(e.message||e));
   return;
  }
  current=rec;
  const own=++epoch;
  seenFinal=new Set();interim="";
  rec.onstart=()=>{
   if(current!==rec||!enabled)return;
   emit("listening","Micro actif : parle naturellement. Une pause envoie automatiquement ta phrase.");
  };
  rec.onspeechstart=()=>{
   if(current===rec&&enabled)emit("hearing","Parole détectée…");
  };
  rec.onresult=event=>{
   if(current!==rec||!enabled||own!==epoch)return;
   const all=event.results||[];
   const interimParts=[];
   let gotFinal=false;
   for(let i=0;i<all.length;i++){
    const item=all[i];
    const part=clean(item?.[0]?.transcript);
    if(!part)continue;
    if(item.isFinal){
     if(!seenFinal.has(i)){
      seenFinal.add(i);
      finalParts.push(part);
      gotFinal=true;
     }
    }else if(i>=(event.resultIndex||0))interimParts.push(part);
   }
   interim=clean(interimParts.join(" "));
   if(gotFinal){noSpeech=0;networkFailures=0;nextFlush();}
   preview();
   if(interim)emit("hearing","Je t'écoute : "+interim.slice(0,95));
   else if(gotFinal)emit("captured","Phrase reconnue. Envoi dans un instant…");
  };
  rec.onerror=event=>{
   if(current!==rec||own!==epoch||!enabled)return;
   const reason=String(event?.error||"");
   if(reason==="aborted")return; // Expected while pausing for an AI reply.
   if(fatal.has(reason)){
    const message=VOICE_FAILURES[reason];
    stop();
    emit("error",message);
    return;
   }
   if(reason==="no-speech"){
    noSpeech++;
    if(noSpeech>=2)emit("waiting","Aucune voix détectée. L'écoute reprend : vérifie le micro sélectionné dans Chrome si cela continue.");
    else emit("waiting","Aucune voix détectée pour le moment. Je reste à l'écoute…");
    return; // Chrome ends the session, then the controller restarts it.
   }
   if(reason==="network"){
    networkFailures++;
    if(networkFailures>=3){
     stop();
     emit("error",VOICE_FAILURES.network);
    }else emit("waiting","Service vocal temporairement indisponible. Nouvelle tentative…");
    return;
   }
   if(reason!=="nomatch")emit("waiting","Reconnaissance interrompue ("+reason+"). Nouvelle tentative…");
  };
  rec.onend=()=>{
   if(current!==rec)return;
   current=null;
   if(finalParts.length)flush();
   if(!enabled||hidden||speaking)return;
   retry(noSpeech>0?Math.min(2000,450+noSpeech*300):restartMs);
  };
  try{
   rec.start();
   emit("starting","Activation du microphone…");
  }catch(e){
   if(current===rec)current=null;
   retry(1200);
   emit("waiting","Microphone occupé ou non disponible. Nouvel essai…");
  }
 }
 function start(){
  if(enabled)return true;
  if(!Recognition){
   emit("error","Ce navigateur ne propose pas la reconnaissance vocale. Essaie Chrome ou Edge sur ordinateur.");
   return false;
  }
  enabled=true;hidden=false;noSpeech=0;networkFailures=0;
  finalParts=[];interim="";preview();
  listen();
  return enabled;
 }
 function stop(){
  enabled=false;clearFlush();clearRestart();clearSpeechTimer();
  const rec=current;current=null;epoch++;
  finalParts=[];interim="";preview();
  spokenQueue=[];speaking=false;currentSpeech=null;
  if(rec)try{rec.abort();}catch{}
  if(synthesis)try{synthesis.cancel();}catch{}
  emit("off","Mode vocal désactivé.");
 }
 function playNext(){
  if(!enabled||!speechEnabled||speaking||!spokenQueue.length||!Utterance||!synthesis){
   if(enabled&&!speaking&&!hidden)retry(250);
   return;
  }
  const text=spokenQueue.shift();
  speaking=true;clearRestart();
  // Detach the old recognizer immediately: some Chrome versions omit its
  // final onend event after an abort, which would otherwise block resuming.
  const rec=current;current=null;epoch++;
  if(finalParts.length)flush();
  if(rec)try{rec.abort();}catch{}
  let utterance;
  try{
   utterance=new Utterance(text);
   utterance.lang=locale;
   utterance.rate=1.05;
   utterance.pitch=1;
   const matching=synthesis.getVoices?.().find(v=>v.lang?.toLowerCase().startsWith(locale.slice(0,2).toLowerCase()));
   if(matching)utterance.voice=matching;
   currentSpeech=utterance;
   let ended=false;
   const finish=()=>{
    if(ended||currentSpeech!==utterance)return;
    ended=true;clearSpeechTimer();currentSpeech=null;speaking=false;
    if(!enabled)return;
    if(spokenQueue.length)playNext();
    else retry(450);
   };
   utterance.onend=finish;
   utterance.onerror=finish;
   emit("speaking","L'IA te répond à voix haute. Le micro reprendra juste après.");
   // A failed speechSynthesis onend event must never mute the microphone forever.
   speechTimer=setTimer(()=>{
    try{synthesis.cancel();}catch{}
    finish();
   },Math.min(85000,Math.max(12000,text.length*130)));
   synthesis.speak(utterance);
  }catch{
   clearSpeechTimer();speaking=false;currentSpeech=null;
   emit("waiting","La lecture vocale est indisponible ; la réponse reste dans la discussion.");
   retry(300);
  }
 }
 function speak(message){
  const text=clean(message).slice(0,850);
  if(!text||!enabled||!speechEnabled||!synthesis||!Utterance)return false;
  spokenQueue.push(text);
  if(!speaking)playNext();
  return true;
 }
 function setSpeechEnabled(value){
  speechEnabled=Boolean(value);
  if(!speechEnabled){
   spokenQueue=[];clearSpeechTimer();
   if(speaking&&synthesis)try{synthesis.cancel();}catch{}
   speaking=false;currentSpeech=null;
   if(enabled&&!hidden)retry(200);
  }
  onState(state());
 }
 function setHidden(value){
  hidden=Boolean(value);
  if(!enabled)return;
  if(hidden){
   clearRestart();
   if(finalParts.length)flush();
   else clearFlush();
   const rec=current;current=null;epoch++;
   if(rec)try{rec.abort();}catch{}
   emit("waiting","Écoute en pause : reviens sur l'onglet Riftbound pour reprendre.");
  }else if(!speaking)retry(250);
 }
 function setLanguage(value){
  locale=value==="en"?"en-US":"fr-FR";
  if(enabled&&!speaking){
   const rec=current;current=null;epoch++;
   if(rec)try{rec.abort();}catch{}
   retry(150);
  }
 }
 return {start,stop,speak,setHidden,setSpeechEnabled,setLanguage,state,flush};
}
