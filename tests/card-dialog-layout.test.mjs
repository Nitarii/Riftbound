import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
test("card popup always shows a readable upright card separate from rules and actions",()=>{
 assert.match(html,/<dialog id="card-dialog" aria-labelledby="detail-name">/);
 assert.match(html,/class="card-dialog-header"/);
 assert.match(html,/id="detail-close" type="button" class="card-dialog-x" aria-label="Fermer la fiche"/);
 assert.match(html,/id="detail-state"/);
 assert.match(html,/class="dialog-card-preview"/);
 assert.match(html,/class="dialog-detail-body"/);
 assert.match(css,/#card-dialog #detail-image \.card-tile\{/);
 assert.match(css,/transform:none!important/);
 assert.match(css,/#card-dialog #detail-text/);
 assert.match(css,/@media\(max-width:630px\)/);
 assert.match(js,/cardHTML\(\{\.\.\.c,exhausted:false\},true,true\)/);
 assert.match(js,/"detail-state"/);
});
test("read-only battlefield detail hides edit inputs, not the card, and keeps X available",()=>{
 assert.match(js,/"card-dialog"\)\.querySelector\("\.dialog-edit-fields"\)\.hidden=true/);
 assert.match(js,/"card-dialog"\)\.querySelector\("\.dialog-edit-fields"\)\.hidden=false/);
 assert.match(js,/\$\("detail-close"\)\.onclick/);
});
