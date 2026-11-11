import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");

test("game keeps history, table and opponent chat as parallel panels",()=>{
 for(const id of ["game-app","live-history-heading",
  "live-history-log","live-history-count","chat-messages","notes","drawer-collapse","layout-fullscreen"]){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/class="live-history"/);
 assert.match(html,/id="chat-typing"/);
 assert.match(html,/id="language-select"/);
 assert.match(html,/class="bottom"/);
 assert.match(html,/class="drawer"/);
 assert.match(html,/class="controls chat-panel"/);
 assert.match(css,/grid-template-areas:"toolbar toolbar toolbar" "history table chat"/);
 assert.match(css,/#game-app \.bottom\{display:contents\}/);
 assert.match(css,/#game-app \.live-history/);
 assert.match(js,/\$\("live-history-log"\)\.innerHTML/);
 assert.doesNotMatch(html,/id="history-log"/);
 assert.doesNotMatch(html,/data-tab="history"/);
});
test("only in-game workspace locks document scrolling, not setup wizard",()=>{
 assert.match(css,/body:not\(\.home-visible\)\{[\s\S]*?overflow:hidden/);
 assert.match(css,/body:not\(\.home-visible\) #game-app\{[\s\S]*?grid-template-columns:/);
 assert.match(css,/#game-app \.chat-messages\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#game-app \.live-history-log\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#game-app \.drawer>\.tabcontent\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#game-app \.board \.cards\{[\s\S]*?overflow-x:auto/);
 assert.match(html,/id="welcome-screen"/);
});
test("at smaller widths the three destinations switch in-place and remain keyboard reachable",()=>{
 for(const name of ["board","chat","history"]){
  assert.ok(html.includes('data-workspace-view="'+name+'"'));
 }
 assert.match(css,/@media \(max-width:890px\)/);
 assert.match(css,/#game-app\[data-workspace-view="board"\] \.board\{display:grid\}/);
 assert.match(css,/#game-app\[data-workspace-view="history"\] \.bottom>\.drawer\{display:flex\}/);
 assert.match(css,/#game-app\[data-workspace-view="chat"\] \.bottom>\.chat-panel\{display:flex\}/);
 assert.match(js,/function selectWorkspacePanel\(view\)/);
 assert.match(js,/b\.setAttribute\("aria-pressed"/);
});
test("fullscreen request is direct and can be exited",()=>{
 assert.match(js,/\$\("game-app"\)\.requestFullscreen\(\)/);
 assert.match(js,/document\.exitFullscreen\(\)/);
 assert.match(js,/document\.addEventListener\("fullscreenchange"/);
 assert.match(css,/#game-app:fullscreen/);
});
test("chat still works with keyboard and transcription after layout change",()=>{
 assert.match(js,/event\.key==="Enter"&&!event\.shiftKey/);
 assert.match(js,/createVoiceConversation\(/);
 assert.match(js,/\$\("send-note"\)\.onclick=sendNote/);
 assert.match(html,/id="chat-messages"/);
 assert.match(html,/id="voice-note"/);
});
