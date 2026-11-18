// Card-driven ability compiler with explicit handlers for verified exceptions.
import {verifiedSpell,handHammer,shadowAssassin,mournfulWitness,sacredProtector,bladeTwirler,soulspinner,
 shadowDisciple,zedChampion,zedLegend,thresholdOfGray,pakaaProtector,shenLegend,noxianEmissary,printedCode,goldToken} from "./verified-cards.mjs";
// Unsupported instructions are reported, never treated as resolved.
const normalize=x=>String(x||"").replace(/\r/g,"").replace(/[’‘]/g,"'").replace(/[–—]/g,"-").trim();
const toCount=x=>({one:1,two:2,three:3,a:1,an:1,un:1,une:1,deux:2,trois:3})[String(x).toLowerCase()]??Number(x);

// A continuous Shield modifier is checked during combat, not on card play.
// Recognize this grammar for ALL cards, without hardcoding individual names.
export function conditionalShieldRule(value){
 const text=String(value?.text??value??"").replace(/[’‘]/g,"'");
 const pattern=/^I have \[Shield\s+(\d{1,2})\] while I'm at a battlefield with exactly (one|two|three|\d{1,2}) other units? you control\.\s*(?:\(\+\d+\s+(?:\{might\}|Might|\[S\]) while I'm a defender\.\))?\s*$/i;
 for(const line of text.split(/\r?\n/)){
  const match=pattern.exec(line.trim());
  if(!match)continue;
  const number={one:1,two:2,three:3}[match[2].toLowerCase()]??Number(match[2]);
  const shield=Number(match[1]);
  if(Number.isInteger(number)&&Number.isInteger(shield)&&number>=0&&number<=12&&shield>=0&&shield<=30)
   return {kind:"conditional-shield",shield,otherFriendlyUnits:number};
 }
 return null;
}
export function migrateLegacyPassivePendingEffects(state){
 if(!state||!Array.isArray(state.pendingEffects))return state;
 const pendingEffects=state.pendingEffects.filter(effect=>
  !(effect?.trigger==="other"&&conditionalShieldRule(effect.text)));
 return pendingEffects.length===state.pendingEffects.length?state:
  {...state,pendingEffects};
}

const reminder=/^(?:\[(?:assault|shield|tank|backline|accelerate|ganking|deathknell|legion|deflect|guard|hidden|reaction|action)[^\]]*\](?:\s*\([^)]*\))?|(?:assault|shield|tank|backline|accelerate|ganking|deathknell|legion|deflect|guard|hidden|reaction|action)\b[^.]*(?:\.)?)$/i;
const TRIGGERS=[
 ["play",/^(?:when you play (?:me|this(?: card| gear)?)|when (?:i'm|i am|this is) played|on play)\s*[,:\-]\s*(.*)$/i],
 ["beginning",/^(?:at the (?:start|beginning) of (?:your )?(?:beginning phase|turn)|when your (?:turn|beginning phase) begins)\s*[,:\-]\s*(.*)$/i],
 ["ending",/^(?:at the end of your turn|when your turn ends)\s*[,:\-]\s*(.*)$/i],
 ["hold",/^(?:when (?:i|this unit) hold|when you hold (?:here|this battlefield))\s*[,:\-]\s*(.*)$/i],
 ["conquer",/^(?:when (?:i|this unit) conquer|when you conquer (?:here|this battlefield))\s*[,:\-]\s*(.*)$/i],
 ["move",/^(?:when (?:i|this unit) move(?: to a battlefield)?)\s*[,:-]\s*(.*)$/i],
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
 ["burn",/^\[Burn (\d+)\](?:\s*\([^)]*\))?$/i],
 ["score",/^you score (\d+) points?$/i],
 ["ready-friendly",/^ready another friendly unit$/i],
 ["ready-runes",new RegExp("^(?:ready|redresse(?:r|z|s)?)\\s+("+AMOUNT+")\\s+(?:(?:of )?(?:your|friendly|mes|vos)\\s+)?runes?$","i")],
 ["exhaust-runes",new RegExp("^(?:exhaust|[ée]puise(?:r|z|s)?)\\s+("+AMOUNT+")\\s+(?:(?:of )?(?:your|friendly)\\s+)?runes?$","i")],
 ["heal-self",new RegExp("^(?:heal|remove)\\s+("+AMOUNT+")\\s+damage\\s+(?:from|on)\\s+(?:me|this unit|this card)$","i")],
 ["self-buff",new RegExp("^(?:i get|i gain|get|gain)\\s*\\+("+AMOUNT+")\\s+(?:might|\\{might\\})(?:\\s+this turn)?$","i")],
 ["damage-enemy",new RegExp("^deal\\s+("+AMOUNT+")\\s+damage\\s+to\\s+(?:(?:an?|one|target)\\s+)?enemy\\s+unit$","i")],
 ["buff-friendly",new RegExp("^give\\s+(?:(?<another>another)\\s+)?friendly\\s+unit\\s+\\+(?<amount>"+AMOUNT+")\\s+(?:might|\\{might\\}|\\[S\\])\\s+this\\s+turn$","i")],
 ["buff-unit",new RegExp("^give\\s+(?:a|another)\\s+unit\\s+\\+("+AMOUNT+")\\s+(?:might|\\{might\\}|\\[S\\])\\s+this\\s+turn$","i")],
 ["stun-enemy",/^stun\s+(?:an?|one)\s+enemy\s+unit(?<field>\s+at\s+a\s+battlefield)?$/i],
 ["stun-unit",/^stun\s+(?:a|an|one)\s+unit(?<field>\s+at\s+a\s+battlefield)?$/i],
 ["kill-enemy",/^(?:kill|destroy)\s+(?:an?|one)\s+enemy\s+unit(?<field>\s+at\s+a\s+battlefield)?$/i],
 ["kill-unit",/^(?:kill|destroy)\s+(?:a|an|one)\s+unit(?<field>\s+at\s+a\s+battlefield)?$/i],
 ["ready-self",/^(?:ready|redresse(?:r|z|s)?)\s+(?:me|this unit)$/i],
 ["channel-exhausted",/^(?:channel)\s+(\d{1,2}|one|two|three|a|an)\s+runes?\s+exhausted$/i],
 ["channel",/^(?:channel)\s+(\d{1,2}|one|two|three|a|an)\s+runes?$/i],
 ["exhaust-self",/^(?:exhaust|[ée]puise(?:r|z|s)?)\s+(?:me|this unit)$/i]
];
const spellPatterns=[
 ["damage-unit",/^deal (\d+) (?:damage )?to (?:a|one) unit(?<field> at a battlefield)?$/i],
 ["assault-unit",/^give a unit \[Assault (\d+)\] this turn$/i],
 ["kill-small",/^kill a unit(?<field> at a battlefield)? with (?<amount>\d+) (?:\[S\]|\[M\]|Might) or less$/i],
 ["reduce-might",/^give a unit -(\d+) (?:\[S\]|\[M\]) this turn$/i],
 ["ready-unit",/^ready a unit$/i],
 ["ready-friendly-unit",/^ready a friendly unit$/i]
];
function parseInstructions(raw,spell=false){
 let expr=normalize(raw)
  .replace(/(\[Burn \d+\])\.?\s*\(Put the top [^)]*\)/gi,"$1")
  .replace(/(\[Assault (\d+)\] this turn)\.?\s*\(\+\2 (?:\[S\]|\[M\]) while it(?:'s| is) an attacker\.?\)\.?$/i,"$1")
  .replace(/\s*\((?:It doesn't deal combat damage this turn\.?|A stunned unit doesn't deal combat damage this turn\.?)\)\.?$/i,"")
  .replace(/[.,! ]+$/g,"").replace(/^(?:you may|may|you must|you can)\s+/i,"");
 if(!expr)return {steps:[],reason:"effet sans instruction"};
 const gold=expr.match(/^(?:pay \[(\d{1,2})\] to )?play (a|one|two|three|four|\d{1,2}) (ready )?gold gear tokens?( exhausted)?(?:\.\s*\((?:it has|they have) "[^"\n]+"\))?$/i);
 if(gold&&!spell){
  const count=gold[2].toLowerCase()==="four"?4:toCount(gold[2]);
  const energy=Number(gold[1]||0);
  if(count>=1&&count<=8&&!(gold[3]&&gold[4]))
   return {steps:[{kind:"create-gold",count,energy,exhausted:Boolean(gold[4])}],reason:""};
 }
 if(!spell&&/^play a 1 \[S\] bird unit token with \[Deflect\]$/i.test(expr))
  return {steps:[{kind:"create-bird",count:1}],reason:""};
 const mill=expr.match(/^put the top (\d{1,2}) cards? of your main deck into your trash$/i);
 if(!spell&&mill&&Number(mill[1])>=1&&Number(mill[1])<=12)
  return {steps:[{kind:"mill-main",count:Number(mill[1])}],reason:""};
 const delayedRunes=new RegExp("^ready up to ("+AMOUNT+") runes? at the end of (?:this|the) turn$","i").exec(expr);
 if(delayedRunes){
  const count=toCount(delayedRunes[1]);
  if(count>=1&&count<=12)return {steps:[{kind:"ready-runes-ending",count}],reason:""};
 }
 if(/\b(?:if|unless|instead|as long as|until|otherwise|for each|for every|equal to|per |choose one|either|up to|look at|reveal|scry|search|shuffle|pay |spend |sacrifice|extra cost)\b/i.test(expr))
  return {steps:[],reason:"condition, choix ou coût non automatisé : "+raw.slice(0,130)};
 const parts=expr.split(/\s*(?:;\s*|\.\s+|\s+then\s+|\s+and\s+)\s*/i).filter(Boolean);
 const steps=[];
 for(let item of parts){
  item=item.trim().replace(/[.,! ]+$/g,"").replace(/^(?:you may|may)\s+/i,"");
  const token=/^play\s+(a|one|two|three|four|\d{1,2})\s+(\d{1,2})\s+(?:\{might\}|\[[SM]\])\s+([a-z][a-z '-]{1,45})\s+unit\s+tokens?\s+((?:into|to)\s+your\s+base|here)$/i.exec(item);
  if(token){
   const word=token[1],n=word.toLowerCase()==="four"?4:toCount(word);
   const might=Number(token[2]),name=token[3];
   if(!Number.isInteger(n)||n<1||n>8||might<1||might>20)
    return {steps:[],reason:"Création de jetons hors limites"};
   steps.push({kind:"create-units",count:n,tokenMight:might,tokenName:name.trim(),
    destination:token[4].toLowerCase()==="here"?"here":"base"});continue;
  }
  let parsed=false;
  for(const [kind,regex] of spell?[...patterns,...spellPatterns]:patterns){
   const m=regex.exec(item);
   if(!m)continue;
   const value=m.groups?.amount??(m[1]!==m.groups?.field?m[1]:undefined);
   const amount=value?toCount(value):1;
   if(!Number.isInteger(amount)||amount<1||amount>12)
    return {steps:[],reason:"quantité hors limites : "+item};
   steps.push({kind,count:amount,...(m.groups?.field&&{atBattlefield:true}),...(m.groups?.another&&{another:true})});
   parsed=true;break;
  }
  if(!parsed)return {steps:[],reason:"instruction à résoudre : "+item.slice(0,130)};
 }
 return {steps,reason:""};
}
const spellSteps={
 "damage-unit":(n)=>({damage:n}),"damage-enemy":(n)=>({damage:n}),
 "buff-unit":(n)=>({might:n}),"buff-friendly":(n)=>({might:n}),
 "reduce-might":(n)=>({might:-n}),"assault-unit":(n)=>({assault:n}),
 "stun-unit":()=>({stun:true}),"stun-enemy":()=>({stun:true}),
 "kill-unit":()=>({kill:true}),"kill-enemy":()=>({kill:true}),
 "kill-small":(n)=>({kill:true,maxTargetMight:n}),
 "ready-unit":()=>({ready:true}),"ready-friendly-unit":()=>({ready:true})
};
// The official Spiritforged errata requires separate target choices for each
// instruction on these cards. The Gallery export contains only one line.
const multiDamageErrata=card=>["OGN-029","OGN-248"].includes(printedCode(card));
export function spellRule(card){
 const known=verifiedSpell(card);
 if(known)return known;
 if(!/^spell$/i.test(card?.type||"")||multiDamageErrata(card))return null;
 const text=normalize(card.text);
 const timing=text.match(/^\[(Action|Reaction)\](?:\s*\([^)\n]*\))?\s*$/im)?.[1]?.toLowerCase()||"main";
 const hidden=/^\[Hidden\](?:\s*\([^)\n]*\))?\s*$/im.test(text);
 const flowText=text.match(/^\[Flow\]\s*(?:\[(\d{1,2})\])?((?:\[[CA]\]){0,5})(?:[ \t]*\([^)\n]*\))?[ \t]*$/im);
 const powerSymbols=flowText?.[2].match(/\[[CA]\]/g)||[];
 const flow=flowText&&(flowText[1]||powerSymbols.length)&&new Set(powerSymbols).size<=1?
  {energy:Number(flowText[1]||0),power:powerSymbols.length,domains:card.domains,
   ...(powerSymbols[0]==="[A]"&&{anyPower:true})}:null;
 const body=text.split("\n").filter(line=>
  !/^\[(?:Hidden|Action|Reaction)\](?:\s*\([^)]*\))?\s*$/i.test(line.trim())&&
  (!flow||line.trim()!==flowText[0].trim())).join("\n");
 const {steps,reason}=parseInstructions(body,true);
 const [step,second]=steps;
 if(reason||!step||steps.length>2||second&&second.kind!=="draw"||
    /\b(?:you may|may)\b/i.test(body))return null;
 const rule={energy:card.energy,power:card.power,domains:card.domains,timing,hidden,compiled:true,...(flow&&{flow})};
 if(step.kind==="draw"&&!second)return {...rule,draw:step.count};
 if(step.kind==="discard"&&step.count===1&&second)return {...rule,discardThenDraw:true,draw:second.count};
 if(step.another||!Object.hasOwn(spellSteps,step.kind))return null;
 const side=step.kind.endsWith("-enemy")?"enemy":step.kind.includes("friendly")?"friendly":null;
 return {...rule,target:"unit",side,atBattlefield:Boolean(step.atBattlefield),...spellSteps[step.kind](step.count),
  ...(second&&{draw:second.count})};
}
export function compileCardAbilities(card){
 const type=String(card?.type||"").toLowerCase();
 const abilities=[],unsupported=[],continuous=[];
 if(type==="spell"&&multiDamageErrata(card))
  return {abilities,continuous,unsupported:[{trigger:"play",text:card.text,
   reason:"Cibles multiples selon l’errata Spiritforged"}]};
 if(zedChampion(card)){
  abilities.push({trigger:"conquer",text:"Jeton Shadow Clone de conquête",supported:true,
   steps:[{kind:"shadow-clone",count:1}]});
  unsupported.push({trigger:"activation",text:"Échange de positions de Zed et du Clone",reason:"Compétence activée non automatisée"});
  return {abilities,unsupported,continuous};
 }
 if(zedLegend(card))return {abilities,continuous,unsupported:[
  {trigger:"activation",text:"Défausse et pioche en dépensant Empowered",reason:"Compétence activée non automatisée"}]};
 if(noxianEmissary(card))return {continuous,abilities:[{trigger:"die",condition:"empowered",supported:true,
  text:"Deathknell si Empowered : deux Recruits de 1 Might en base.",
  steps:[{kind:"create-units",count:2,tokenMight:1,tokenName:"Recruit",destination:"base"}]}],
  unsupported:[{trigger:"activation",text:"Empower de Noxian Emissary",reason:"Compétence activée non automatisée"}]};
 if([verifiedSpell,handHammer,shadowAssassin,mournfulWitness,sacredProtector,bladeTwirler,soulspinner,shadowDisciple,thresholdOfGray,pakaaProtector,shenLegend,goldToken]
    .some(handler=>handler(card)))return {abilities,unsupported,continuous,verified:true};
 if(!normalize(card?.text))return {abilities,unsupported,continuous};
 for(let line of splitClauses(card.text)){
  const passiveShield=conditionalShieldRule(line);
  if(passiveShield){continuous.push(passiveShield);continue;}
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
    let body=trailing.replace(/^\[>\]\s*/,"").replace(/\s*\(when i die,?\s*get the effect\.?\)\.?$/i,"").trim();
    const company=/^if i didn't die alone,\s*/i.test(body);
    if(company)body=body.replace(/^if i didn't die alone,\s*/i,"")
     .replace(/\s*\(when i die,?\s*get the effect\. i wasn't alone if there were other friendly units here\.\)\.?$/i,"");
    const parsed=parseInstructions(body);
    const ability={trigger:"die",text:line,optional:false,
     steps:parsed.steps,supported:!parsed.reason,keyword,...(company&&{condition:"did-not-die-alone"})};
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
  const condition=trigger==="hold"&&/^if there is exactly one other unit you control here,\s*/i.test(body)?
   "one-other-unit":null;
  if(condition)body=body.replace(/^if there is exactly one other unit you control here,\s*/i,"");
  const excess=trigger==="conquer"&&body.match(/^if you assigned (\d+) or more excess damage,\s*/i);
  if(excess)body=body.slice(excess[0].length);
  const optional=/^(?:you may|may|vous pouvez|tu peux)\b/i.test(body);
  const {steps,reason}=parseInstructions(body,type==="spell");
  // Match event card type rather than firing "play a unit" when a spell
  // or gear is played. "Another" already excludes the played card itself.
  const playedType=trigger==="ally-play"?(
   /\b(?:a|another)\s+(unit|spell|gear)\b/i.exec(line)?.[1]?.toLowerCase()||"card"
  ):undefined;
  const limit=/\b(?:once|first time)(?:\s+each|\s+this|\s+a)?\s+turn\b/i.test(line)?1:
   Number(/\b(?:twice|two times)\s+(?:each|this)\s+turn\b/i.test(line)?2:0);
  const ability={trigger,text:line,optional,steps,supported:!reason,
   ...(dependent||condition?{condition:dependent||condition}:{}),...(keyword?{keyword}:{}),
   ...(excess&&{minimumExcess:Number(excess[1])}),
   ...(playedType?{playedType}:{}),...(limit?{perTurnLimit:limit}:{})};
  abilities.push(ability);
  if(reason)unsupported.push({trigger,text:line,reason});
 }
 return {abilities,unsupported,continuous};
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
