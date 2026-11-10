import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
test("welcome screen appears first and board remains accessible",()=>{
 assert.match(html,/<body class="home-visible">/);
 assert.match(html,/id="welcome-screen"/);
 assert.match(html,/id="game-app"/);
 assert.match(css,/body\.home-visible #game-app\{display:none\}/);
 assert.match(js,/function showGame\(/);
 assert.match(js,/\$\("go-home"\)\.onclick=showHome/);
});
test("all homepage controls have unique IDs and handlers",()=>{
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ["home-installed","home-download","home-connect","home-preview","home-create-game",
  "home-copy-prompt","home-enter-board","home-human-legend","home-human-champion",
  "home-human-battlefield","home-ai-deck","home-first-player","home-server-url","home-server-token",
  "welcome-progress","home-feedback"]){
   assert.ok(ids.includes(id),"Missing id="+id);
   assert.ok(js.includes('"'+id+'"'),"Missing JS reference for "+id);
 }
});
test("download links to real source bundle, with Node dependency disclosed",()=>{
 assert.match(html,/https:\/\/github\.com\/Nitarii\/Riftbound\/archive\/refs\/heads\/main\.zip/);
 assert.match(html,/start-local\.bat/);
 assert.match(html,/Node\.js 20\+/);
 assert.match(html,/https:\/\/nodejs\.org\//);
});
test("the UI is honest about physical cards, AI access and fan status",()=>{
 assert.match(html,/non commercial/);
 assert.match(html,/cartes physiques/);
 assert.match(html,/Une IA extérieure|une IA distante|une IA distante|IA distante|IA extérieure|agent externe/i);
 assert.match(js,/const deck=resolvePrecon\(catalog,\$\("home-ai-deck"\)\.value\)/);
 assert.match(js,/type:"setup-human"/);
 assert.match(js,/type:"setup-ai"/);
 assert.match(js,/type:"start"/);
});
