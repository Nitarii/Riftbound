// Only processes owned by Riftbound Companion. Never enumerate or kill arbitrary
// PC processes. A model installed on disk is NOT a running process.
export const PROCESS_TARGETS=Object.freeze(["qwen","whisper","tunnel","all"]);

export function createProcessDashboard({integratedAI,localFreeAI,speech,remoteAccess}){
 function status(){
  const config=integratedAI.status();
  const ai=localFreeAI.status();
  const voice=speech.status();
  const tunnel=remoteAccess.status(false);
  return {
   scope:"companion-only",
   companion:{active:true,pid:process.pid},
   qwen:{
    active:Boolean(ai.processActive),pid:ai.pid||null,
    installed:Boolean(ai.installed),enabled:Boolean(config.enabled&&config.provider==="free"),
    model:config.provider==="free"?(config.model||ai.model):ai.model,
    installing:Boolean(ai.installing),
    processing:Boolean(config.processing&&config.enabled&&ai.processActive),
    ready:Boolean(ai.ready&&ai.processActive)
   },
   whisper:{
    active:Boolean(voice.processActive),pid:voice.pid||null,
    installed:Boolean(voice.installed),enabled:Boolean(voice.enabled),
    model:voice.selected||"base",processing:Boolean(voice.processing&&voice.processActive),
    installing:Boolean(voice.installing)
   },
   tunnel:{
    active:Boolean(tunnel.active),starting:Boolean(tunnel.starting),
    expiresAt:tunnel.expiresAt||null
   },
   updatedAt:new Date().toISOString()
  };
 }
 function stop(target){
  if(!PROCESS_TARGETS.includes(target))throw Error("Processus Riftbound inconnu.");
  if(target==="qwen"||target==="all"){
   integratedAI.disable(); // persisted: never restart silently on next launch
   localFreeAI.stop();       // exact owned llama.cpp PID/tree only
  }
  if(target==="whisper"||target==="all"){
   speech.stop({disable:true}); // persist disabling future local transcription
  }
  if(target==="tunnel"||target==="all"){
   remoteAccess.stop(); // closes Cloudflare child and local gateway
  }
  return {ok:true,target,message:target==="all"?
   "Moteurs Qwen et Whisper et tunnel arrêtés. Le gestionnaire reste ouvert.":
   target==="qwen"?"Qwen arrêté et désactivé. Les modèles restent installés.":
   target==="whisper"?"Whisper arrêté et désactivé. Réactive-le avant une transcription.":
   "Tunnel distant arrêté. Les IA locales restent inchangées.",...status()};
 }
 function enableWhisper(){
  const current=speech.enable();
  return {ok:true,message:"Whisper réactivé. Le modèle ne consomme pas de ressources au repos.",
   ...status(),whisper:{...status().whisper,enabled:current.enabled}};
 }
 return {status,stop,enableWhisper};
}
