import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import os from "node:os";
import {createRemoteAccess} from "../remote.mjs";

test("remote gateway separates temporary agent privileges from local admin",async()=>{
 let port=0,commands=0,client=null;
 const remote=createRemoteAccess({
  userData:os.tmpdir(),
  getState:()=>({revision:2,players:{human:{handCount:4}}}),
  performCommand:async c=>{commands++;return {revision:3,last:c.type};},
  getCatalog:async()=>[{code:"VEN-147",name:"Shen, Eye of Twilight",type:"Legend"}],
  getDecks:()=>[{id:"shen",label:"Shen"}],
  getGuide:()=>({name:"companion",endpoints:{"GET /api/state":"State"}}),
  onGatewayReady:p=>{port=p;},
  launchTunnel:()=>{
   client=new EventEmitter();
   client.stdout=new PassThrough();
   client.stderr=new PassThrough();
   client.killed=false;
   client.kill=()=>{client.killed=true;client.emit("exit",0);};
   setImmediate(()=>client.stderr.write("temporary tunnel ready: https://test-riftbound.trycloudflare.com\n"));
   return client;
  }
 });
 const session=await remote.start();
 assert.equal(session.active,true);
 assert.match(session.url,/trycloudflare\.com/);
 assert.ok(session.agentToken.length>=40);
 const base="http://127.0.0.1:"+port;
 try {
  const unauthorized=await fetch(base+"/api/state");
  assert.equal(unauthorized.status,401);
  const localSecret=await fetch(base+"/api/state",{headers:{Authorization:"Bearer my-local-admin-token"}});
  assert.equal(localSecret.status,401);
  const headers={"Authorization":"Bearer "+session.agentToken};
  const read=await fetch(base+"/api/state",{headers});
  assert.equal(read.status,200);
  assert.equal((await read.json()).state.revision,2);
  const forbiddenPair=await fetch(base+"/api/pair",{method:"POST",headers});
  assert.equal(forbiddenPair.status,404);
  const forbiddenStart=await fetch(base+"/api/remote/start",{method:"POST",headers});
  assert.equal(forbiddenStart.status,404);
  const forbiddenReset=await fetch(base+"/api/command",{
   method:"POST",headers:{...headers,"Content-Type":"application/json"},
   body:'{"type":"reset"}'
  });
  assert.equal(forbiddenReset.status,403);
  const note=await fetch(base+"/api/command",{
   method:"POST",headers:{...headers,"Content-Type":"application/json"},
   body:'{"type":"note","text":"Tour de l’IA"}'
  });
  assert.equal(note.status,200);
  assert.equal((await note.json()).state.last,"note");
  assert.equal(commands,1);
  assert.equal((await (await fetch(base+"/api/decks",{headers})).json()).decks[0].id,"shen");
  assert.equal((await (await fetch(base+"/api/catalog?q=shen",{headers})).json()).returned,1);
 }finally{remote.stop();}
 assert.equal(remote.status().active,false);
 assert.equal(client.killed,true);
});
