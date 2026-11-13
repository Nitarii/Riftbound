// Shared phonetic/typo-aware Riftbound card lookup. Scores ALL catalogue names;
// never invents names and requires a unique, high-confidence winner.
const folded=value=>String(value||"").normalize("NFKD").toLowerCase()
 .replace(/[\u0300-\u036f]/g,"").replace(/[œ]/g,"oe").replace(/[æ]/g,"ae")
 .replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const filler=new Set(["a","an","the","of","de","du","des","le","la","les","d","l"]);
const tokens=value=>folded(value).split(" ").filter(x=>x&&!filler.has(x));
const compact=value=>tokens(value).join("");
// French-accented English transcripts regularly split/swap syllables.
// Fold only broad phoneme equivalents, not name-specific aliases.
const phonetic=value=>compact(value).replace(/ph/g,"f").replace(/ght/g,"t")
 .replace(/ou/g,"u").replace(/oo/g,"u").replace(/eau/g,"o")
 .replace(/ck/g,"k").replace(/qu/g,"k").replace(/y/g,"i")
 .replace(/([a-z])\1+/g,"$1");
function distance(a,b){
 const previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];
  for(let j=1;j<=b.length;j++)
   current[j]=Math.min(current[j-1]+1,previous[j]+1,
    previous[j-1]+(a[i-1]===b[j-1]?0:1));
  for(let k=0;k<previous.length;k++)previous[k]=current[k];
 }
 return previous[b.length];
}
const similarity=(a,b)=>!a||!b?0:1-distance(a,b)/Math.max(a.length,b.length);
function spokenScore(query,name){
 const q=compact(query),n=compact(name);
 if(!q||!n)return 0;
 if(q===n)return 1;
 const qWords=tokens(query),nWords=tokens(name);
 if(qWords.length>1&&qWords.length===nWords.length&&
   qWords.slice().sort().join("")===nWords.slice().sort().join(""))return .99;
 const raw=similarity(q,n),sound=similarity(phonetic(query),phonetic(name));
 // A transcription can separate a two-syllable card word into two words.
 let tokenFit=0;
 if(qWords.length&&nWords.length){
  const matches=nWords.map(word=>Math.max(0,...qWords.map(spoken=>
   similarity(phonetic(spoken),phonetic(word)))));
  tokenFit=matches.reduce((s,v)=>s+v,0)/Math.max(qWords.length,nWords.length);
  if(qWords.length>nWords.length){
   const joined=phonetic(qWords.slice(0,qWords.length-nWords.length+1).join(""));
   tokenFit=Math.max(tokenFit,
    (similarity(joined,phonetic(nWords[0]))+
     nWords.slice(1).reduce((sum,w,i)=>sum+similarity(phonetic(qWords[qWords.length-nWords.length+1+i]),phonetic(w)),0))
    /nWords.length*.95);
  }
 }
 return Math.max(raw,sound*.99,tokenFit*.98);
}
export function rankSpokenCards(catalog,phrase,{limit=5}={}){
 const query=folded(phrase).replace(/^(?:(?:un|une|ma|mon|mes|my|the|le|la|a|an)\s+|l')+/,"");
 if(compact(query).length<4||compact(query).length>90)return [];
 const named=new Map();
 for(const card of catalog||[]){
  if(!card?.name||!card?.code||card.isVariant)continue;
  const key=folded(card.name);
  if(!named.has(key))named.set(key,card);
 }
 const ranked=[];
 for(const [key,card] of named){
  const score=spokenScore(query,key);
  if(score>=.53)ranked.push({card,score});
 }
 ranked.sort((a,b)=>b.score-a.score||a.card.name.localeCompare(b.card.name));
 return ranked.slice(0,Math.max(1,Math.min(10,limit)));
}
export function matchSpokenCard(catalog,phrase){
 const ranked=rankSpokenCards(catalog,phrase,{limit:3});
 if(!ranked.length)return {card:null,candidates:[]};
 const best=ranked[0],second=ranked[1];
 const margin=best.score-(second?.score||0);
 // Short or ambiguous names always require explicit confirmation.
 const safe=best.score>=.86&&margin>=.08||
  best.score>=.77&&margin>=.16&&tokens(phrase).length>=2;
 return {card:safe?best.card:null,score:best.score,
  candidates:ranked.map(r=>r.card.name)};
}
