import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createVoiceConversation,VOICE_FAILURES} from "../voice-session.mjs";

class FakeRecognizer{
 static instances=[];
 constructor(){this.started=false;this.aborted=false;FakeRecognizer.instances.push(this);}
 start(){this.started=true;this.onstart?.();}
 abort(){this.aborted=true;this.onend?.();}
 respond(results,resultIndex=0){this.onresult?.({results,resultIndex});}
 fail(error){this.onerror?.({error});this.onend?.();}
}
class Clock{
 time=0;next=0;timers=new Map();
 set=(fn,ms)=>{const id=++this.next;this.timers.set(id,{at:this.time+ms,fn});return id;};
 clear=id=>this.timers.delete(id);
 tick(ms){
  const target=this.time+ms;
  for(let n=0;n<1000;n++){
   const jobs=[...this.timers.entries()].filter(([,v])=>v.at<=target)
    .sort((a,b)=>a[1].at-b[1].at||a[0]-b[0]);
   if(!jobs.length)break;
   const [id,item]=jobs[0];this.timers.delete(id);this.time=item.at;item.fn();
  }
  this.time=target;
 }
}
const finalResult=value=>({isFinal:true,0:{transcript:value}});
const interimResult=value=>({isFinal:false,0:{transcript:value}});
function fixture(options={}){
 FakeRecognizer.instances.length=0;
 const clock=new Clock(),transcripts=[],states=[],previews=[];
 const ctrl=createVoiceConversation({Recognition:FakeRecognizer,setTimer:clock.set,clearTimer:clock.clear,
  silenceMs:1000,restartMs:200,onTranscript:x=>transcripts.push(x),
  onPreview:x=>previews.push(x),onState:s=>states.push(s),...options});
 return {ctrl,clock,transcripts,states,previews,recognizers:FakeRecognizer.instances};
}
test("no-speech in Chrome is an ordinary recoverable silence, not a dead microphone",()=>{
 const f=fixture();
 assert.equal(f.ctrl.start(),true);
 const first=f.recognizers[0];
 assert.equal(first.continuous,true);
 assert.equal(first.interimResults,true);
 assert.equal(first.lang,"fr-FR");
 first.fail("no-speech");
 assert.equal(f.ctrl.state().enabled,true);
 assert.equal(f.ctrl.state().noSpeech,1);
 f.clock.tick(750);
 assert.equal(f.recognizers.length,2);
 f.recognizers[1].fail("no-speech");
 assert.match(f.ctrl.state().detail,/micro sélectionné dans Chrome/);
 f.clock.tick(1050);
 assert.equal(f.recognizers.length,3);
 f.ctrl.stop();assert.equal(f.ctrl.state().enabled,false);
});
test("interim text previews, finalized speech is sent once after a brief pause",async()=>{
 const f=fixture();f.ctrl.start();
 const recog=f.recognizers[0];
 recog.respond([interimResult("Je joue Shen")]);
 assert.match(f.previews.at(-1),/Je joue Shen/);
 assert.equal(f.transcripts.length,0);
 recog.respond([finalResult("Je joue Shen"),interimResult("sur mon terrain")]);
 assert.equal(f.transcripts.length,0);
 f.clock.tick(700);
 recog.respond([finalResult("Je joue Shen"),finalResult("sur mon terrain")],1);
 f.clock.tick(999);
 await Promise.resolve();
 assert.equal(f.transcripts.length,0);
 f.clock.tick(1);await Promise.resolve();await Promise.resolve();
 assert.deepEqual(f.transcripts,["Je joue Shen sur mon terrain"]);
 // Browser may include old final results again; they must not be sent twice.
 recog.respond([finalResult("Je joue Shen"),finalResult("sur mon terrain")],0);
 f.clock.tick(1200);await Promise.resolve();
 assert.equal(f.transcripts.length,1);
 f.ctrl.stop();
});
test("two consecutive utterances are both sent, including turn-ending speech",async()=>{
 const f=fixture();f.ctrl.start();const r=f.recognizers[0];
 r.respond([finalResult("Je pose ma carte")]);f.clock.tick(1000);await Promise.resolve();
 r.respond([finalResult("Je pose ma carte"),finalResult("Je termine mon tour")],1);
 f.clock.tick(1000);await Promise.resolve();
 assert.deepEqual(f.transcripts,["Je pose ma carte","Je termine mon tour"]);
 f.ctrl.stop();
});
test("fatal permissions and device errors stop the loop with actionable instructions",()=>{
 for(const reason of ["not-allowed","service-not-allowed","audio-capture","language-not-supported"]){
  const f=fixture();f.ctrl.start();
  f.recognizers[0].fail(reason);
  assert.equal(f.ctrl.state().enabled,false,reason);
  assert.match(f.ctrl.state().detail,/(Chrome|microphone|français)/i,reason);
  f.clock.tick(20000);
  assert.equal(f.recognizers.length,1,reason);
 }
 assert.match(VOICE_FAILURES["audio-capture"],/Windows/);
});
test("temporary network errors retry but do not loop endlessly",()=>{
 const f=fixture();f.ctrl.start();
 for(let i=0;i<3;i++){
  f.recognizers.at(-1).fail("network");
  if(i<2){assert.equal(f.ctrl.state().enabled,true);f.clock.tick(500);}
 }
 assert.equal(f.ctrl.state().enabled,false);
 assert.match(f.ctrl.state().detail,/Internet/);
});
test("AI speech pauses microphone to prevent echo, then resumes automatically",()=>{
 class Utterance{constructor(text){this.text=text;}}
 const spoken=[];
 const synthesis={
  getVoices:()=>[{lang:"fr-FR"}],
  speak:utterance=>spoken.push(utterance),
  cancel:()=>{}
 };
 const f=fixture({synthesis,Utterance});
 f.ctrl.start();const listening=f.recognizers[0];
 assert.equal(f.ctrl.speak("Je canalise une rune"),true);
 assert.equal(spoken[0].text,"Je canalise une rune");
 assert.equal(listening.aborted,true);
 assert.equal(f.ctrl.state().speaking,true);
 f.clock.tick(3000);
 assert.equal(f.recognizers.length,1);
 spoken[0].onend();
 f.clock.tick(450);
 assert.equal(f.recognizers.length,2);
 assert.equal(f.ctrl.state().speaking,false);
 f.ctrl.stop();
});
test("missing recognizer onend and speech synthesis onend never strand the microphone",()=>{
 class SilentAbortRecognizer extends FakeRecognizer{
  abort(){this.aborted=true;/* Chromium sometimes omits onend after abort */}
 }
 class Utterance{constructor(text){this.text=text;}}
 const spoken=[];
 const synthesis={getVoices:()=>[],speak:u=>spoken.push(u),cancel:()=>{}};
 const clock=new Clock(),states=[];
 SilentAbortRecognizer.instances.length=0;
 const controller=createVoiceConversation({Recognition:SilentAbortRecognizer,synthesis,Utterance,
  setTimer:clock.set,clearTimer:clock.clear,onState:s=>states.push(s)});
 controller.start();
 assert.equal(SilentAbortRecognizer.instances.length,1);
 controller.speak("Je prépare mon prochain tour");
 assert.equal(SilentAbortRecognizer.instances[0].aborted,true);
 clock.tick(12000); // Watchdog resumes recognition even if TTS never calls onend.
 clock.tick(450);
 assert.equal(SilentAbortRecognizer.instances.length,2);
 controller.stop();
});
test("mode can be stopped at once; hidden tabs do not leak listening sessions",()=>{
 const f=fixture();f.ctrl.start();
 f.ctrl.setHidden(true);
 assert.equal(f.recognizers[0].aborted,true);
 f.clock.tick(2000);assert.equal(f.recognizers.length,1);
 f.ctrl.setHidden(false);f.clock.tick(250);
 assert.equal(f.recognizers.length,2);
 f.ctrl.stop();f.clock.tick(10000);
 assert.equal(f.recognizers.length,2);
});
test("site exposes visible hands-free controls, not the old single-shot Dictation",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 for(const id of ["voice-note","voice-live","voice-live-text","voice-read-replies"]){
  assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(app.includes('"'+id+'"'),"missing JS handler for "+id);
 }
 assert.match(app,/createVoiceConversation/);
 assert.match(app,/enqueuePlayerAnnouncement\(text\)/);
 assert.match(app,/voiceController\.speak\(m\.text\)/);
 assert.match(app,/voiceController\.setHidden\(document\.hidden\)/);
 assert.doesNotMatch(app,/recognizer\.continuous=false/);
 assert.match(html,/L'écoute reprend après chaque réponse/);
});
