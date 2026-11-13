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
  const ability={trigger,text:line,optional,steps,supported:!reason};
  abilities.push(ability);
  if(reason)unsupported.push({trigger,text:line,reason});
 }
 return {abilities,unsupported};
}
export function onPlayInstructions(card){
 const all=compileCardAbilities(card);
 return {steps:all.abilities.filter(a=>a.trigger==="play"&&a.supported).flatMap(a=>a.steps),
  unsupported:all.unsupported.filter(a=>a.trigger==="play"),all};
}
export const supportedEvents=()=>["play","beginning","ending","hold","conquer","move","die","attack","defend","showdown","draw","ally-play"];
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
