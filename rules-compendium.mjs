// Compact, original paraphrases grounded in the user's 156-page French
// Riftbound Core Rules (RUP5, revision 09/10/2026). Not a reproduction
// of the copyrighted PDF. Rule and page identifiers permit verification.
// The printed card text and official errata supersede this reference.
export const CORE_RULEBOOK=Object.freeze({
 title:"Règles du jeu de Riftbound — RUP5 (FR)",
 revision:"2026-10-09",pages:156,
 url:"https://playriftbound.com/fr-fr/rules-hub/",
 status:"Référence indexée non exhaustive ; consulter les règles originales et les errata pour les cas complexes."
});
export const DUEL_RULES=Object.freeze({
 victoryScore:8,initialHand:4,mainDeckMinimum:40,runeDeckSize:12,
 battlegrounds:2,channelPerTurn:2,firstSecondPlayerBonusRunes:1,drawPerTurn:1,
 maximumMulligan:2,maximumDeckCopies:3
});
export function duelOpeningRuneCount(state,player){
 const first=state?.firstPlayer||"human";
 return DUEL_RULES.channelPerTurn+
  (state?.turn===1&&player!==first?DUEL_RULES.firstSecondPlayerBonusRunes:0);
}
// [identifier, rules, first page, concise paraphrase, search aliases].
// Every line is an editorial summary, not text copied from the PDF.
const DATA=[
 ["gold","002,051-055",1,"Un texte de carte applicable prime sur la règle générale; une interdiction prime sur une permission. Résoudre les instructions réalisables dans l'ordre, sans inventer celles impossibles.","priorite interdiction texte carte rule gold"],
 ["deck","103",2,"La légende fixe l'identité de domaines. Deck principal d'au moins 40 cartes, dont le champion élu; 12 runes séparées; au plus trois exemplaires d'un même nom, sous réserve des limites supplémentaires.","deck precon construit domaine legende champion signature construction"],
 ["setup","111-118",8,"Mettre légende et champion élu à part, mélanger séparément deck et runes, piocher quatre cartes puis proposer un mulligan de zéro à deux cartes, à recycler après les remplacements.","mise en place mulligan piocher debut initial shuffle"],
 ["privacy","108,128",7,"La main et les cartes face cachée sont privées; les contenus des défausses et les permanents visibles sont publics. Ne jamais demander ou révéler la main physique adverse.","main privee secret cachee visible informations hand hidden"],
 ["card-names","132",11,"Une carte FR et sa version EN correspondent à une même carte. Nom court et sous-titre forment ensemble son nom complet: ne pas confondre deux versions d'un champion.","francais anglais accent nom traduction champion carte"],
 ["unit-entry","143.4,178",20,"Une unité entre normalement sur le plateau épuisée, sauf exception imprimée. Une unité peut occuper sa base ou un champ de bataille.","unite epuiser entrer jouer fatiguer preparee"],
 ["move","144,447-452",21,"Un déplacement standard se fait durant sa phase principale ouverte en épuisant une unité préparée; base vers champ de bataille ou champ vers base. Gank autorise aussi champ vers champ.","bouger deplacer mouvement move gank base champ bataille"],
 ["gear","148-152",22,"Un équipement est joué normalement en base, entre préparé, et les objets peuvent être équipés selon leurs propres coûts et restrictions. Équipement ne veut pas automatiquement dire unité.","equipement objet arme gear equiper"],
 ["spell","153-159",24,"Un sort suit ses instructions de haut en bas puis part en défausse. En principe il se joue dans un état neutre ouvert; Action et Réaction étendent les fenêtres possibles.","sort spell action reaction resolve jouer"],
 ["rune","161-167,164.2",25,"Une rune de base préparée peut être épuisée pour une énergie, ou recyclée pour une essence de son domaine, même déjà épuisée. Les coûts en énergie et en essence sont distincts; une rune recyclée retourne au deck de runes.","rune epuiser recycler essense essence mana cout energy power"],
 ["rune-pool","165-168",26,"La réserve runique contient énergie et essence disponibles. Elle est vidée au début de chaque phase principale ainsi qu'à chaque fin de tour; pas de report automatique.","reserve runique mana ressource reste energie pool"],
 ["control","188-191",31,"Un champ de bataille contesté ne change pas de contrôle avant la résolution requise d'une confrontation ou d'un combat. La présence d'une unité ennemie ne suffit pas à créditer immédiatement une conquête.","controle conteste bataille capture conquer champ"],
 ["win","193-196,487",34,"Le duel a un objectif de huit points; on gagne au nettoyage avec au moins huit points ET davantage que l'adversaire. À égalité au-dessus du seuil, la partie continue.","victoire gagner win score point match huit 8"],
 ["costs","201-206",35,"Les coûts obligatoires, supplémentaires, et coûts d'instructions doivent être effectivement payables pour obtenir leur effet. Un coût impossible interdit l'action correspondante.","cout payer energie essence defausser sacrifice supplementaire"],
 ["states","307-313",38,"Les états sont neutre/confrontation et ouvert/fermé. En état fermé seules les Réactions passent normalement; pendant une confrontation ouverte, seules Action ou Réaction sont autorisées.","etat priorite focalisation chaine reaction confrontation timing"],
 ["turn-order","314-317",40,"Début de tour: préparer, déclencheurs de départ, occupation, canaliser deux runes, piocher une carte; puis phase principale libre et phase de fin avec expiration des effets temporaires.","tour phase eveil depart canalisation pioche main fin tour"],
 ["duel","487-488",121,"En duel 1 contre 1, il y a deux champs de bataille, victoire à huit; au premier tour du joueur en deuxième position, il canalise une troisième rune.","duel deux joueur second premier premier tour champ rune"],
 ["upkeep","315,487.7",40,"À la phase d'éveil, préparer les éléments du joueur. Les occupations se comptent dans l'étape des scores du départ, AVANT la canalisation et la pioche. En duel, le second joueur reçoit une rune bonus à sa première canalisation.","preparer phase reveil debut maintenir hold channel draw"],
 ["ending","317",42,"En fin de tour, résoudre les déclenchements de fin, soigner les unités, faire expirer les effets de ce tour et vider la réserve runique; ensuite seulement le tour change.","end ending fin soin heal expire temporary"],
 ["cleanup","318-324",43,"Un nettoyage vérifie victoire, dégâts mortels, contrôle, cartes illégales et combats ou confrontations à préparer. Plusieurs nettoyages peuvent se suivre jusqu'à stabilisation.","nettoyage cleanup combat lethal controle score"],
 ["chain","337–340",45,"Après finalisation des objets en attente, le contrôleur du prochain objet à résoudre obtient la priorité. Le joueur prioritaire peut jouer une Réaction légale ou passer. Quand tous passent consécutivement sans rien ajouter, seul le dernier objet finalisé se résout. Si la chaîne contient encore un objet, son contrôleur reçoit la priorité avant la résolution suivante.","chaine stack fepr resolution pile repondre reaction priorite"],
 ["confrontation","341-348",48,"Une confrontation ouvre une fenêtre de focalisation et priorité. Les joueurs peuvent y jouer Action ou Réaction avant la résolution; l'absence d'adversaire n'autorise pas à ignorer cette fenêtre.","confrontation focus priorite reponse passe"],
 ["play-process","349-359",49,"Pour jouer une carte, déclarer, choisir modes/cibles et actions lors du jeu, calculer coût total, payer, vérifier légalité, puis résoudre selon le type. Ne jamais mettre une carte sur le plateau en ignorant ses instructions obligatoires.","jouer play pose carte cible effet cout lancer disciple shen"],
 ["abilities","360-399",66,"Distinguer capacités passives, activées, déclenchées et effets de remplacement. Un déclenchement peut attendre une chaîne; le modèle ne doit pas traiter un effet non reconnu comme déjà exécuté.","capacite effet obligatoire declenche passif activation replacement"],
 ["draw","414,432",86,"Piocher depuis le sommet du deck principal, sauf instruction contraire. Si les cartes manquent, suivre l'exténuation; ne pas simplement créer des cartes.","piocher draw deck vide fatigue pioche"],
 ["recycle","417",87,"Recycler place la carte sous le deck correspondant: carte principale dans le principal, rune dans le deck de runes. Ce n'est pas une défausse ordinaire.","recycler recycle sous deck rune"],
 ["discard","423",91,"Défausser prend une carte de la main et la met en défausse, sans jouer ses effets. Une défausse comme coût doit se produire avant de bénéficier de l'effet lié.","defausser discard main cout effet"],
 ["damage","142-143,418,429",19,"Des dégâts sont marqués sur les unités. Des dégâts non nuls au moins égaux à la puissance rendent l'unité mortellement blessée puis éliminée lors du nettoyage; certains effets changent ce calcul.","degat blesser power might tuer eliminer lethal"],
 ["exhaustion","432",98,"Si une pioche manque de cartes, tenter d'abord les cartes disponibles, remélanger la défausse, donner un point à un adversaire puis terminer la pioche. Une défausse vide peut entraîner des exténuations répétées.","extenuation deck vide burnout fatigue recycler"],
 ["combat","461-468",110,"Deux adversaires sur un même champ déclenchent un combat après les nettoyages. Confrontation et réactions d'abord; calcul des puissances et affectation des dégâts, nettoyage, rappel éventuel, puis contrôle et points.","combat attaque defence defense choc assaut survie damage"],
 ["combat-damage","467",111,"Chaque camp additionne la puissance de ses unités, puis affecte les dégâts selon les restrictions. Dégâts létaux à répartir correctement; les deux camps subissent leur attribution dans le combat, pas avant la fenêtre de réactions.","combattre assigner degats puissance tank arriere ligne"],
 ["combat-end","468",114,"Le nettoyage de combat soigne les unités puis rappelle les attaquants s'il reste des défenseurs. Le contrôle final peut entraîner une conquête; ne pas marquer avant cette résolution.","combat fin nettoyage rappeler conquete gagnant"],
 ["score","469-474,473.1",115,"Conquête = obtenir le contrôle; occupation = le conserver lors du départ. Au plus une fois par champ de bataille et par tour. Au seuil du dernier point, une conquête ne donne ce point que si tous les champs ont marqué ce tour, sinon elle fait piocher une carte.","point score hold conquer victoire capturer maintien dernier point"],
 ["buff","701-711",127,"Chaque compteur Buff augmente la puissance d'une unité de un; traiter les changements de puissance et leur ordre d'application selon les couches.","buff bonus compteur marqueur puissance"],
 ["layers","475-482",116,"Les effets continus modifiant les caractéristiques s'appliquent par couches, avec dépendances et horodatages. Ne pas calculer automatiquement un résultat incertain.","couches layer effet permanent continu puissance stat"],
 ["keywords","800-832",137,"Les mots-clés condensent des règles; ne pas supposer leur effet depuis leur seul nom. Consulter l'entrée numérotée du mot-clé pertinent et le texte de la carte.","mot cle mots cles keyword deflection"],
 ["action","806",138,"Action peut être jouée durant une confrontation ouverte, en plus de la fenêtre habituelle.","action window confrontation"],
 ["assault","807",139,"Assaut X est une modification passive du combat, à prendre en compte uniquement lorsque ses conditions sont réunies.","assaut assault attaque might"],
 ["death","808",139,"Agonie est une capacité déclenchée d'un permanent. Ne pas inventer ou omettre son effet lorsqu'il quitte le jeu dans les conditions prévues.","agonie deathknell meurt elimine"],
 ["protection","809",140,"Protection X est une capacité passive; évaluer son montant et ses conditions avant les dégâts ou effets concernés.","protection guard shield"],
 ["gank","810",141,"Gank permet le déplacement standard directement d'un champ de bataille à un autre.","gank deplacer champ"],
 ["hidden","811",141,"Caché autorise, sous conditions et coût de carte, à placer une carte face cachée sur un champ contrôlé; identité non publique.","cache hidden face cachee"],
 ["legion","812",143,"Légion conditionne le texte qui suit le mot-clé. Vérifier les unités ou conditions nécessaires avant d'appliquer ses instructions.","legion nombre unite"],
 ["reaction","338.1.a,813",144,"Avec la priorité, un joueur peut ajouter une Réaction légale à une chaîne existante, même durant le tour adverse. Appliquer aussi les cibles, coûts et autres restrictions de la carte.","reaction chaine repondre timing"],
 ["shield","814",145,"Bouclier X modifie la puissance défensive conformément au mot-clé; ne pas l'appliquer comme une réduction générale des dégâts hors de son contexte.","bouclier shield defense"],
 ["tank","815",145,"Tank exige que les dégâts mortels soient attribués à cette unité avant d'autres alliés, selon les restrictions du combat.","tank frontline cible combat"],
 ["temporary","816",146,"Temporaire élimine son permanent au début de la phase de départ de son contrôleur, avant le score d'occupation.","temporaire ephemeral preparation hold"],
 ["vision","817",146,"Vision déclenche une prédiction lorsque le permanent est joué; respecter la séquence de pioche/révélation.","vision predict predire"],
 ["equip","818-819",146,"Équiper paie le coût d'un objet pour le fixer à une unité admissible; Dégainer possède une fenêtre de Réaction sous ses conditions.","equiper degainer objet item weapon"],
 ["repeat","820",148,"Répétition est un coût supplémentaire optionnel d'un sort ou d'une compétence pour refaire son effet selon les instructions.","repetition repeat double sort"],
 ["ambush","822",150,"Embuscade peut permettre de jouer une unité sur un champ où le joueur possède des unités, et modifie sa fenêtre de jeu.","embuscade ambush jouer battlefield"],
 ["hunt","823",151,"Chasse est associé aux déclenchements de conquête et d'occupation; appliquer le texte exact et la valeur imprimée.","chasse hunt conquer hold"],
 ["level","824",151,"Niveau N conditionne le texte suivant à l'XP ou aux exigences de niveau prévues.","niveau level xp"],
 ["unique","825",151,"Unique ajoute une restriction de construction de deck; les copies normales ne sont pas toujours toutes autorisées.","unique deck copie"],
 ["backline","826",152,"Arrière-ligne reçoit des dégâts mortels après les autres unités alliées dans un même groupe de combat.","arriere ligne backline combat"],
 ["amplify","827-828",152,"Amplification est une capacité activée coûtée; Amplifié conditionne le texte dépendant. Ne pas appliquer les effets sans payer la capacité.","amplification amplified amplifie cout"],
 ["flow","829",153,"Flux peut autoriser le jeu d'un sort depuis la défausse pour son coût spécifique avant son bannissement.","flux flow graveyard"],
 ["deploy","830",154,"Déploiement adapte où l'équipement peut être joué ou créé, selon les restrictions du mot-clé.","deploiement deploy equipment"],
 ["disarm","831",154,"Désarmement est un déclencheur d'attaque associé à une valeur; appliquer son texte plutôt que l'inférer depuis le nom.","desarmement disarm attack"],
 ["reveal","832",155,"Dévoiler est un effet lié à des éléments déterminés par son texte; révéler ne signifie pas automatiquement défausser.","devoiler reveal reveal"],
];
export const CORE_RULE_ENTRIES=Object.freeze(DATA.map(([id,rules,page,summary,keywords])=>
 Object.freeze({id,rules,page,summary,keywords})));
export function chainPriorityReply(normalized,{english=false}={}){
 if(!/^(?:comment (?:fonctionne|marche|se passe)|how does)\b/.test(normalized)||
    !/\b(?:priorite|priority)\b/.test(normalized)||!/\b(?:chaine|chain|stack)\b/.test(normalized))return "";
 return english?
  "The player with priority can play a legal Reaction or pass. After both players pass consecutively without adding anything, only the top item resolves. If an item remains, its controller gets priority before that item can resolve. See rules 337–340.":
  "Le joueur qui a la priorité peut jouer une Réaction légale ou passer. Après deux passes consécutives sans ajout, seul l’objet au sommet se résout. S’il reste un objet, son contrôleur reçoit la priorité avant la résolution suivante. Voir les règles 337 à 340.";
}
export function gankRuleReply(normalized,{english=false}={}){
 if(!/\b(?:gank|ganking)\b/.test(normalized)||
    !/^(?:gank(?:ing)?$|que permet|comment (?:fonctionne|marche)|qu'est ce que|c'est quoi|est ce que|what (?:is|does)|how does|(?:can|does) (?:i|gank|a unit))\b/.test(normalized))return "";
 return english?
  "Ganking lets a ready unit exhaust to move straight from one battlefield to another as a standard move in your open Main Phase. Entering an enemy-occupied battlefield can start combat. See rules 144 and 810.":
  "Avec Ganking, une unité prête peut s’épuiser pendant ta phase principale ouverte pour se déplacer directement d’un champ de bataille à un autre. Si elle arrive sur un champ occupé par l’adversaire, elle peut déclencher un combat. Voir les règles 144 et 810.";
}
const norm=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function selectCoreRules(query="",{state,limit=7}={}){
 const message=norm(query),parts=new Set((message.match(/[\p{L}\p{N}]+/gu)||[]).filter(x=>x.length>2));
 const stateHint=norm([state?.phase,state?.pendingCombat?"combat confrontation":"",
  state?.pendingEffects?.length?"effet declenche chaine":"",
  state?.active==="ai"?"tour ia":""].join(" "));
 const base=new Set(["gold","privacy","win"]);
 const weighted=CORE_RULE_ENTRIES.map((entry,index)=>{
  const terms=(entry.id+" "+entry.keywords).split(/\s+/).map(norm).filter(x=>x.length>2);
  let score=terms.reduce((acc,t)=>acc+(parts.has(t)?5:message.includes(t)?2:stateHint.includes(t)?1:0),0);
  if(base.has(entry.id))score+=3;
  if(state?.pendingCombat&&["combat","combat-damage","reaction"].includes(entry.id))score+=5;
  if(state?.pendingEffects?.length&&["abilities","chain","costs","gold"].includes(entry.id))score+=5;
  if(state?.phase==="Main"&&["move","costs","play-process"].includes(entry.id))score+=2;
  return {entry,score,index};
 });
 const size=Math.max(1,Math.min(12,Math.round(limit)||7));
 const selected=weighted.sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,size);
 return selected.map(({entry})=>({topic:entry.id,rule:entry.rules,page:entry.page,summary:entry.summary}));
}
