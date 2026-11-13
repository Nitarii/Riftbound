// Optional comprehensive audit against the public effective-text card corpus.
// This measures parser coverage, NOT 100% validated rules fidelity.
import fs from "node:fs";
import path from "node:path";
import {CARD_SOURCE,CARD_SOURCE_BACKUP,decodeCards} from "../catalog.mjs";
import {compileCardAbilities} from "../effect-engine.mjs";
import {mandatoryPlayEffects} from "../play-effects.mjs";

const args=process.argv.slice(2);
async function load(){
 const file=args.indexOf("--file");
 if(file>=0){
  const name=args[file+1];if(!name)throw Error("Expected --file <cards.json>");
  return decodeCards(JSON.parse(fs.readFileSync(name,"utf8")));
 }
 for(const url of [CARD_SOURCE,CARD_SOURCE_BACKUP]){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error("HTTP "+response.status);
   const cards=decodeCards(await response.json());
   if(cards.length<500)throw Error("Corpus too small: "+cards.length);
   return cards;
  }catch(e){console.error("Corpus source failed:",url,String(e.message||e));}
 }
 throw Error("Could not load any full card corpus.");
}
const cards=await load();
const types={},issues={},features={},unresolved=[];
let withText=0,parsed=0,zeroEffect=0,unhandled=0,unknownCosts=0;
for(const card of cards){
 const type=card.type||"Other";types[type]=(types[type]||0)+1;
 if(!card.text?.trim()){zeroEffect++;continue;}
 withText++;
 const result=compileCardAbilities(card);
 if(result.unsupported.length){unhandled++;
  for(const issue of result.unsupported){
   const key=issue.reason.replace(/: .*/,"").slice(0,60);
   issues[key]=(issues[key]||0)+1;
   if(unresolved.length<60)unresolved.push({
    code:card.code,name:card.name,type:card.type,
    reason:issue.reason,text:issue.text.slice(0,200)
   });
  }
 }else parsed++;
 for(const ab of result.abilities){
  for(const step of ab.steps)features[step.kind]=(features[step.kind]||0)+1;
 }
 if(card.energy===null||card.power===null)unknownCosts++;
}
const result={
 generatedAt:new Date().toISOString(),source:"Effective/errata text as provided by card corpus",
 caveat:"Syntax coverage only: no completeness or official rules-conformance guarantee",
 total:cards.length,withText,zeroEffect,parsedTextOnly:parsed,
 unresolvedCards:unhandled,parsedFraction:withText?+(parsed/withText).toFixed(4):0,
 unknownCosts,types,recognizedOperations:features,issueCounts:issues,
 unresolvedExamples:unresolved
};
if(args.includes("--json"))console.log(JSON.stringify(result,null,2));
else{
 console.log("Card semantics audit (syntax only; NOT full rules coverage):");
 console.log("Cards",cards.length,"with text",withText,"parsed without flagged text",parsed,
  "unresolved",unhandled,"coverage ratio",result.parsedFraction);
 console.log("Card categories:",JSON.stringify(types));
 console.log("Recognized ops:",JSON.stringify(features));
 console.log("Unresolved reasons:",JSON.stringify(issues));
 console.log("Examples:",JSON.stringify(unresolved.slice(0,15),null,2));
}
const output=args.indexOf("--output");
if(output>=0){
 const filepath=args[output+1];if(!filepath)throw Error("Missing --output path");
 fs.mkdirSync(path.dirname(path.resolve(filepath)),{recursive:true});
 fs.writeFileSync(filepath,JSON.stringify(result,null,2));
}
