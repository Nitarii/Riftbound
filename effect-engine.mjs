// Card-driven ability compiler. No card name, set number or precon is hardcoded.
// Unsupported instructions are reported, never treated as resolved.
const normalize=x=>String(x||"").replace(/\r/g,"").replace(/[’‘]/g,"'").replace(/[–—]/g,"-").trim();
const toCount=x=>({one:1,two:2,three:3,a:1,an:1,un:1,une:1,deux:2,trois:3})[String(x).toLowerCase()]??Number(x);
const reminder=/^(?:\[(?:assault|shield|tank|backline|accelerate|ganking|deathknell|legion|deflect|guard|hidden|reaction|action)[^\]]*\](?:\s*\([^)]*\))?|(?:assault|shield|tank|backline|accelerate|ganking|deathknell|legion|deflect|guard|hidden|reaction|action)\b[^.]*(?:\.)?)$/i;
const TRIGGERS=[
 ["play",/^(?:when you play (?:me|this(?: card| gear)?)|when (?:i'm|i am|this is) played|on play)\s*[,:\-]\s*(.*)$/i],
 ["beginning",/^(?:at the (?:start|beginning) of (?:your )?(?:beginning phase|turn)|when your (?:turn|beginning phase) begins)\s*[,:\-]\s*(.*)$/i],
 ["ending",/^(?:at the end of your turn|when your turn ends)\s*[,:\-]\s*(.*)$/i],
 ["hold",/^(?:when (?:i|this unit) hold|when you hold (?:here|this battlefield))\s*[,:\-]\s*(.*)$/i],
 ["conquer",/^(?:when (?:i|this unit) conquer|when you conquer (?:here|this battlefield))\s*[,:\-]\s*(.*)$/i],
 ["move",/^(?:when (?:i|this unit) move)\s*[,:\-]\s*(.*)$/i],
 ["die",/^(?:when (?:i|this unit) die)\s*[,:\-]\s*(.*)$/i],
 ["attack",/^(?:when (?:i|this unit) attack)\s*[,:\-]\s*(.*)$/i],
 ["defend",/^(?:when (?:i|this unit) defend)\s*[,:\-]\s*(.*)$/i],
 ["attack",/^(?:when you attack)\s*[,:\-]\s*(.*)$/i],
 ["showdown",/^(?:when (?:a|the) showdown begins)\s*[,:\-]\s*(.*)$/i],
 ["draw",/^(?:when you draw (?:a|one|1) card)\s*[,:\-]\s*(.*)$/i],
 ["discard",/^(?:when you discard me|when i(?:'m| am) discarded)\s*[,:\-]\s*(.*)$/i],
 ["ally-play",/^(?:when you play (?:a|another) (?:unit|spell|card|gear))\s*[,:\-]\s*(.*)$/i]
];
function splitClauses(raw){
 return normalize(raw).split(/\n+/).flatMap(line=>
  line.split(/(?<=\.)\s+(?=(?:When |At the |The first |Whenever ))/i)
 ).map(s=>s.trim()).filter(Boolean);
}
const AMOUNT="(?:\\d{1,2}|one|two|three|a|an|un|une|deux|trois)";
const patterns=[
 ["discard",new RegExp("^(?:discard|d[ée]fausse(?:r|z|s)?)\\s+("+AMOUNT+")(?:\\s+cards?)?$","i")],
 ["draw",new RegExp("^(?:draw|pioche(?:r|z|s)?)\\s+("+AMOUNT+")(?:\\s+cards?)?$","i")],
 ["ready-runes",new RegExp("^(?:ready|redresse(?:r|z|s)?)\\s+("+AMOUNT+")\\s+(?:(?:of )?(?:your|friendly|mes|vos)\\s+)?runes?$","i")],
 ["exhaust-runes",new RegExp("^(?:exhaust|[ée]puise(?:r|z|s)?)\\s+("+AMOUNT+")\\s+(?:(?:of )?(?:your|friendly)\\s+)?runes?$","i")],
 ["heal-self",new RegExp("^(?:heal|remove)\\s+("+AMOUNT+")\\s+damage\\s+(?:from|on)\\s+(?:me|this unit|this card)$","i")],
 ["self-buff",new RegExp("^(?:i get|i gain|get|gain)\\s*\\+("+AMOUNT+")\\s+(?:might|\\{might\\})(?:\\s+this turn)?$","i")],
 ["damage-enemy",new RegExp("^deal\\s+("+AMOUNT+")\\s+damage\\s+to\\s+(?:(?:an?|one|target)\\s+)?enemy\\s+unit$","i")],
 ["ready-self",/^(?:ready|redresse(?:r|z|s)?)\s+(?:me|this unit)$/i],
 ["channel-exhausted",/^(?:channel)\s+(\d{1,2}|one|two|three|a|an)\s+runes?\s+exhausted$/i],
 ["channel",/^(?:channel)\s+(\d{1,2}|one|two|three|a|an)\s+runes?$/i],
 ["exhaust-self",/^(?:exhaust|[ée]puise(?:r|z|s)?)\s+(?:me|this unit)$/i]
];
function parseInstructions(raw){
 let expr=normalize(raw).replace(/[.,! ]+$/g,"").replace(/^(?:you may|may|you must|you can)\s+/i,"");
 if(!expr)return {steps:[],reason:"effet sans instruction"};
 if(/\b(?:if|unless|instead|as long as|until|otherwise|for each|for every|equal to|per |choose one|either|up to|look at|reveal|scry|search|shuffle|pay |spend |sacrifice|extra cost)\b/i.test(expr))
  return {steps:[],reason:"condition, choix ou coût non automatisé : "+raw.slice(0,130)};
 const parts=expr.split(/\s*(?:;\s*|\.\s+|\s+then\s+|\s+and\s+)\s*/i).filter(Boolean);
 const steps=[];
 for(let item of parts){
  item=item.trim().replace(/[.,! ]+$/g,"").replace(/^(?:you may|may)\s+/i,"");
  let parsed=false;
  for(const [kind,regex] of patterns){
   const m=regex.exec(item);
   if(!m)continue;
   const amount=m[1]?toCount(m[1]):1;
   if(!Number.isInteger(amount)||amount<1||amount>12)
    return {steps:[],reason:"quantité hors limites : "+item};
   steps.push({kind,count:amount});parsed=true;break;
  }
  if(!parsed)return {steps:[],reason:"instruction à résoudre : "+item.slice(0,130)};
 }
 return {steps,reason:""};
}
export function compileCardAbilities(card){
 const type=String(card?.type||"").toLowerCase();
 const abilities=[],unsupported=[];
 if(!normalize(card?.text))return {abilities,unsupported};
 for(let line of splitClauses(card.text)){
  if(reminder.test(line))continue;
  // Riftbound printed keyword syntax is semantic, not decorative:
  // [Deathknell] — Draw 1 triggers on death; [Legion] — ... only applies
  // after another card has been played this turn.
  let dependent="",keyword="";
  const prefix=/^\[([a-z][a-z -]*)(?:\s+\d+)?\]\s*(?:[—–-]\s*)?(.*)$/i.exec(line);
  if(prefix){
   keyword=prefix[1].toLowerCase().trim();
   const trailing=prefix[2].trim();
   if(keyword==="deathknell"){
    const body=trailing.replace(/\s*\(when i die,?\s*get the effect\.?\)\.?$/i,"").trim();
    const parsed=parseInstructions(body);
    const ability={trigger:"die",text:line,optional:false,
     steps:parsed.steps,supported:!parsed.reason,keyword};
    abilities.push(ability);
    if(parsed.reason)unsupported.push({trigger:"die",text:line,reason:parsed.reason});
    continue;
   }
   if(keyword==="legion"){
    dependent="legion";
    line=trailing.replace(/\s*\(get the effect if you've played another card this turn\.?\)\.?$/i,"").trim();
   }else if(keyword==="vision"){
    // Vision = Predict on play. The controller looks at their next card
    // and may recycle it; the AI uses only its own deck to decide.
    const ability={trigger:"play",text:line,optional:false,steps:[{kind:"predict"}],
     supported:true,keyword};
    abilities.push(ability);continue;
   }else if(keyword==="temporary"){
    // Temporary's required kill happens before Hold scoring in next-turn.
    continue;
   }else if(["assault","shield","tank","backline","ganking","accelerate",
       "action","reaction","unique","hidden"].includes(keyword)){
    // These keywords affect timing/cost/combat; the keyed engine handles them
    // independently. An additional instruction on the same line is not ignored.
    if(!trailing||/^\([^)]*\)\.?$/.test(trailing))continue;
    line=trailing;
   }
  }
  line=line.replace(/^\[(?:assault|shield|tank|backline|accelerate|ganking|reaction|action)\b[^\]]*\]\s*/i,"").trim();
  if(!line||/^\([^)]*\)$/.test(line))continue;
  let trigger="",body=line;
  for(const [event,re] of TRIGGERS){
   const match=re.exec(line);
   if(match){trigger=event;body=match[1];break;}
  }
  if(!trigger){
   if(type==="spell"&&!/^(?:action|reaction)\b/i.test(line))trigger="play";
   else{
    unsupported.push({trigger:"other",text:line,reason:"capacité permanente, activée ou conditionnelle à examiner"});
    continue;
   }
  }
  const optional=/^(?:you may|may|vous pouvez|tu peux)\b/i.test(body);
  const {steps,reason}=parseInstructions(body);
  // Match event card type rather than firing "play a unit" when a spell
  // or gear is played. "Another" already excludes the played card itself.
  const playedType=trigger==="ally-play"?(
   /\b(?:a|another)\s+(unit|spell|gear)\b/i.exec(line)?.[1]?.toLowerCase()||"card"
  ):undefined;
  const limit=/\b(?:once|first time)(?:\s+each|\s+this|\s+a)?\s+turn\b/i.test(line)?1:
   Number(/\b(?:twice|two times)\s+(?:each|this)\s+turn\b/i.test(line)?2:0);
  const ability={trigger,text:line,optional,steps,supported:!reason,
   ...(dependent?{condition:dependent}:{}),...(keyword?{keyword}:{}),
   ...(playedType?{playedType}:{}),...(limit?{perTurnLimit:limit}:{})};
  abilities.push(ability);
  if(reason)unsupported.push({trigger,text:line,reason});
 }
 return {abilities,unsupported};
}
export function onPlayInstructions(card,{playedBefore=0}={}){
 const all=compileCardAbilities(card);
 return {steps:all.abilities.filter(a=>a.trigger==="play"&&a.supported&&
   (a.condition!=="legion"||playedBefore>0)).flatMap(a=>a.steps),
  unsupported:all.unsupported.filter(a=>a.trigger==="play"),all};
}
export const supportedEvents=()=>["play","beginning","ending","hold","conquer","move","die","attack","defend","showdown","draw","discard","ally-play"];
export function inspectCards(cards){
 const result={cards:0,withText:0,fullySupported:0,partial:0,unhandled:0,byTrigger:{},examples:[]};
 for(const card of cards||[]){
  result.cards++;
  if(card.text?.trim())result.withText++;
  const read=compileCardAbilities(card);
  if(!read.unsupported.length)result.fullySupported++;
  else{
   result.unhandled++;
   if(read.abilities.some(a=>a.supported))result.partial++;
   if(result.examples.length<20)result.examples.push({code:card.code,name:card.name,
    issues:read.unsupported.slice(0,3)});
  }
  for(const a of read.abilities)result.byTrigger[a.trigger]=(result.byTrigger[a.trigger]||0)+1;
 }
 return result;
}
