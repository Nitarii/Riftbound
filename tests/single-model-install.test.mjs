import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("local voice and selectable 4B/9B use one installation action",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 const server=fs.readFileSync(new URL("../server.mjs",import.meta.url),"utf8");
 assert.match(html,/id="free-ai-model" type="hidden" value="qwen3:4b-instruct-2507"/);
 assert.match(html,/id="free-ai-install"/);
 assert.match(html,/Whisper Small/);
 assert.doesNotMatch(html,/id="speech-model-choice"|id="speech-install"|id="speech-source"/);
 assert.doesNotMatch(app,/createVoiceConversation\(/);
 assert.match(app,/createLocalVoiceConversation\(/);
 assert.match(server,/localFreeAI.start\(input\.model\|\|LOCAL_AI_MODEL/);
 assert.match(server,/speech.begin\(WHISPER_MODEL\)/);
 assert.match(app,/\/api\/ai\/free\/install/);
});

test("Windows manager selects either validated local model and accelerates on GPU",()=>{
 const html=fs.readFileSync(new URL("../manager.html",import.meta.url),"utf8");
 assert.match(html,/id="ai-install"/);
 assert.match(html,/id="ai-profile"/);
 assert.match(html,/value="qwen3.5:9b-q4km"/);
 assert.match(html,/id="ai-backend"/);
 assert.match(html,/const model=\$\("ai-profile"\)\.value/);
 assert.doesNotMatch(html,/qwen3:0\.6b|Whisper Base|id="speech-model"|id="speech-install"/);
 assert.match(html,/id="open-site"/);
 assert.match(html,/window\.location\.assign\(url\)/);
 assert.match(html,/launchIfCurrent\("\/#companion="\+encodeURIComponent\(token\)\)/);
 assert.match(html,/id="process-dashboard"/);
 assert.match(html,/id="manager-stop"/);
 assert.match(html,/class="manager-advanced wide"/);
});
test("setup uses one page and keeps advanced actions available but secondary",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const app=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
 assert.match(html,/class="wizard-navigation"[^>]*hidden/);
 assert.match(html,/id="toggle-tools"/);
 assert.match(html,/class="header-extra"/);
 assert.match(app,/card\.hidden=!visible/);
 assert.match(app,/showGame\(\);/);
 assert.match(app,/function setToolsExpanded\(open\)/);
});
