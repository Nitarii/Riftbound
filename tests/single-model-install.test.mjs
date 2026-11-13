import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("single local model and voice model use one installation action",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(html,/id="free-ai-model" type="hidden" value="qwen3:4b-instruct-2507"/);
 assert.match(html,/id="free-ai-install"/);
 assert.match(html,/Whisper Small/);
 assert.doesNotMatch(html,/id="speech-model-choice"|id="speech-install"|id="speech-source"/);
 assert.doesNotMatch(app,/createVoiceConversation\(/);
 assert.match(app,/createLocalVoiceConversation\(/);
 assert.match(server,/localFreeAI.start\(LOCAL_AI_MODEL\)/);
 assert.match(server,/speech.begin\(WHISPER_MODEL\)/);
 assert.match(app,/\/api\/ai\/free\/install/);
});
