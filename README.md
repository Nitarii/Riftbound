# Riftbound Table Companion

Projet fan gratuit et non commercial, **sans affiliation à Riot Games**. Ce site accompagne une partie de Riftbound jouée avec des cartes physiques face à un agent IA : plateau visuel, marqueurs, tours, decks, historique et accès temporaire de l'agent. Ce n'est pas une copie du jeu ni un service de parties numériques.

## Installation gratuite, un seul exécutable Windows 10/11 x64

**Site :** https://nitarii.github.io/Riftbound/

**Téléchargement :** https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.26.exe

1. Télécharge et lance `RiftboundCompanion-v0.26.exe`, puis choisis un dossier dédié pour **tous** les fichiers. Le compagnon ouvre un gestionnaire local pour lancer le site, installer les IA et gérer les mises à jour.
2. Choisis ta légende, ton champion et ton champ de bataille ; crée la partie avec le deck adverse.
3. Confirme le dossier sélectionné puis clique **Installer et activer mon IA gratuite**. La première fois, le programme télécharge deux fichiers officiels : **llama.cpp CPU Windows x64 (~25 Mo)** et **Qwen3-0.6B Q8 (~639 Mo)**. Les fichiers sont gardés sur ton PC et vérifiés avec leurs empreintes SHA-256.
4. Quand « IA gratuite prête » apparaît, utilise la discussion : **Entrée** envoie un message, **Maj+Entrée** insère un saut de ligne, le microphone prépare une dictée, et le bouton **Passer mon tour** annonce la fin du tour.

**Coût : zéro abonnement, zéro clé API, aucune facture liée à un modèle cloud.** Le modèle s'exécute directement sur le processeur du PC avec `llama-server.exe`, sans GPU dédié, aucune configuration ROCm/CUDA et sans tunnel. Après l'installation, les réponses IA fonctionnent hors ligne. Les fichiers sont conservés pour les prochaines sessions.

**Compatibilité :** ce package vise **Windows 10/11 64 bits** avec un processeur x64 compatible et assez de mémoire libre (prévoir environ **2 Go de RAM disponibles** pour le modèle et son contexte, davantage si le jeu et le navigateur sont très chargés). Il ne peut pas fonctionner sur absolument tous les PC, notamment les Windows 32 bits, machines à très faible RAM ou autres systèmes sans version dédiée. Les performances varient selon le CPU. Le petit modèle peut être moins compétent pour les règles de Riftbound qu'un modèle plus gros.

Le programme n'est pas signé numériquement; Windows SmartScreen peut afficher un avertissement. Les images officielles des cartes et le catalogue nécessitent ponctuellement Internet; le moteur d'IA n'en a pas besoin après téléchargement. Le mode avancé de tunnel Cloudflare est conservé en option pour les agents réellement dotés d'outils réseau, mais **il n'est pas nécessaire pour jouer gratuitement avec l'IA intégrée**.

**Sources et sécurité des téléchargements** :
- moteur `ggml-org/llama.cpp`, release [b12277](https://github.com/ggml-org/llama.cpp/releases/tag/b12277), fichier Windows CPU, SHA-256 `5943df89ff76289e16fd9c9600a38871b47f20272c589c3b803eca2181f67a08` (licence MIT) ;
- modèle officiel [Qwen3-0.6B Q8 GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/blob/main/Qwen3-0.6B-Q8_0.gguf), SHA-256 `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031` (licence Apache 2.0).

### IA préconfigurée : règles, cartes et commandes de jeu

L'adversaire local Qwen3 0.6B n'a **aucune étape d'apprentissage à effectuer**. Au moment de chaque message, le serveur lui fournit automatiquement un petit guide des règles pertinentes, le fonctionnement des tours et de la chatbox, les commandes possibles avec UID et les textes des cartes nécessaires. Les références proviennent du [hub officiel Riot](https://playriftbound.com/fr-fr/rules-hub/) (règles de base et de tournoi du **9 octobre 2026**) et du catalogue déjà utilisé par le site. L'agent n'a pas besoin de sortir sur le Web.

La sélection des cartes privilégie **la main de l'IA**, **les légendes/champions**, **les champs de bataille**, les unités visibles et les **cartes mentionnées par le joueur**. Le moteur cherche le code et le texte d'effet dans le catalogue, puis les injecte au modèle avec ses restrictions de commandes. Il n'envoie **jamais** la main physique humaine cachée. Pour rester compatible avec les petits PC et une fenêtre de contexte réduite, seuls les détails pertinents sont passés à chaque échange, sans tenter de charger toutes les cartes du jeu à la fois.

**Références consultables** : `GET /api/ai/reference?q=nom` est disponible uniquement depuis l'API locale authentifiée. Il fournit les sources Riot, un mémo synthétique des règles, le fonctionnement du plateau et des fiches de cartes correspondantes, y compris leurs effets lorsque le catalogue les contient. L'écran de préparation de l'IA affiche automatiquement la révision des règles et la taille du catalogue accessible. Les PDF complets et errata doivent être consultés sur le hub officiel ; le projet ne les recopie pas.

**Limites importantes** : le mémo est un résumé original, et non l'intégralité des 142 pages de règles compétitives. Le modèle Qwen3 0.6B peut se tromper malgré ces informations, notamment sur les capacités, réactions, timings, coûts et combats. Les données du catalogue peuvent être incomplètes ou antérieures à un errata. Dans ces situations, l'IA doit demander une vérification au joueur plutôt que déduire une règle non documentée.

**Propriété intellectuelle et conformité :** les règles et cartes appartiennent à Riot Games. La [politique officielle des outils Riftbound](https://developer.riotgames.com/docs/riftbound) indique que l'utilisation d'actifs Riot dans une application nécessite une autorisation/API key appropriée et ne favorise pas actuellement les outils qui imposent automatiquement les règles. Un usage fan gratuit ne remplace pas ces autorisations. Cette version renvoie donc aux ressources officielles et utilise le catalogue existant sans embarquer de copie intégrale des règles ou des illustrations.

### Limite des règles

Le site constitue un outil de suivi pour une partie **physique**. Le petit modèle peut jouer, répondre et commander le plateau, mais ne garantit pas à lui seul l'application exacte de toutes les règles compétitives ni des effets des cartes. Les actions automatiques restent vérifiées par le code contre des erreurs techniques évidentes.

---

## Si l'IA ne peut pas ouvrir le tunnel : mode assisté sans F12

Un lien HTTPS fonctionnel ne suffit pas à donner un navigateur ou un accès HTTP à toutes les conversations IA. Certaines conversations n'ont aucun moyen de contacter une URL externe. **Aucun changement au site ne peut imposer ces outils à une IA externe.**

Pour éviter les codes JavaScript dans la console du navigateur :

1. Ouvre l'onglet **Agent IA** et sa section **Jouer avec une IA sans accès réseau** (ou choisis « Utiliser sans connexion distante » à l'étape 4).
2. Clique **Copier l'état pour l'IA**, puis colle le texte dans la conversation.
3. Demande à l'IA de répondre avec un bloc JSON contenant `commands` et `revision`.
4. Colle la réponse dans le site, clique **Vérifier les actions** puis **Appliquer au plateau**. Les commandes sont prévalidées et ne sont exécutées qu'après confirmation du joueur.
5. Recommence au besoin après chaque échange. Le site rejette les réponses fondées sur une ancienne révision.

**Confidentialité et limite essentielle :** cet export masque les deux mains, les cartes face cachée, le contenu des decks, les notes privées et tous les jetons d'authentification. C'est utile pour suivre les actions annoncées sans révéler la main du joueur, **mais l'IA ne peut pas choisir correctement des cartes secrètes de sa propre main à partir de cet export**. Pour jouer comme un véritable adversaire avec main et deck secrets, il faut utiliser un agent disposant d'un navigateur interactif ou d'outils HTTP autorisés.

Le mode assisté n'applique jamais du JavaScript fourni par l'IA : il parse du JSON, vérifie les types de commandes autorisés, les identifiants de cartes et la version du plateau avant l'envoi. Les actions restent soumises à une vérification humaine des règles.

## Interface de partie v0.12 : tout accessible sans défilement de page

Sur ordinateur, lorsque la partie est ouverte, l'interface utilise la hauteur de la fenêtre et présente **simultanément** : l'historique en direct à gauche (avec outils sous forme d'onglets), le plateau et ses deux champs de bataille au centre, et la discussion écrite/vocale avec l'IA à droite. L'en-tête et les phases restent disponibles en haut. Le bouton **Plein écran** agrandit l'espace de jeu (Échap pour en sortir).

Le document principal ne défile plus pendant une partie. Pour préserver la lisibilité, les zones susceptibles de s'allonger sont **défilables individuellement** : listes de cartes à l'horizontale, journal, chat et panneaux d'outils à la verticale. L'ancienne page d'installation garde un défilement normal, car elle comporte plusieurs étapes.

Sur les petits écrans (moins de 891 pixels CSS de largeur), il est impossible d'afficher côte à côte trois surfaces lisibles. La page offre donc un sélecteur **Plateau / Historique / Discussion IA** pour passer d'un panneau à l'autre sans défilement de page. Les fonctions et le contenu restent disponibles sans changer de page.

## Conversation vocale continue (v0.17)

Le bouton **🎙 Mode vocal**, dans la discussion en bas à droite, active l'écoute mains libres. Parle normalement en français : l'interface affiche la transcription en direct, puis **une pause d'environ 1,5 seconde** envoie automatiquement la phrase au relais local. Aucune touche Entrée ni nouvel appui sur le micro n'est nécessaire. Toutes les phrases passent par la même file de messages que le texte écrit : l'adversaire IA les reçoit, répond et peut commander le plateau selon ses règles configurées. Les déclarations sans ambiguïté telles que « Je termine mon tour » font également avancer le tour avant transmission.

Le moteur de reconnaissance navigateur tourne en mode **continuous**, puis redémarre automatiquement après la fin d'une session ou une absence de voix détectée (`no-speech`). Un silence n'est donc plus traité comme un échec définitif. Le statut coloré du micro distingue écoute, transcription, réponse de l'IA, reconnexion et erreur de permission/périphérique. En cas de messages `no-speech` répétés, vérifie le microphone sélectionné dans **Chrome → Paramètres → Confidentialité et sécurité → Paramètres des sites → Microphone**, ainsi que le périphérique d'entrée de Windows, et parle suffisamment près du micro. Accepter l'autorisation ne garantit pas qu'une entrée sonore soit captée.

Pendant la lecture vocale de l'adversaire, **le microphone s'interrompt pour éviter que l'IA se réentende**. Il reprend ensuite automatiquement. La case **L'IA me répond à voix haute** permet de couper la synthèse vocale ; le texte des réponses reste toujours dans la discussion. Le bouton **■ Couper le micro** arrête immédiatement l'écoute. La capture vocale est mise en pause quand l'onglet devient invisible.

**Confidentialité :** cette fonctionnalité utilise l'API Web Speech de Chrome/Edge. Selon le navigateur, **la transcription vocale peut utiliser un service Internet et y transmettre l'audio** ; elle n'est pas nécessairement hors ligne, même si le modèle Qwen3 de Riftbound est entièrement local et gratuit. Elle ne nécessite **ni clé API, ni abonnement, ni paiement par message**. Les navigateurs sans prise en charge Web Speech conservent le chat écrit.

## Contrôle du plateau par les annonces du joueur

La zone **Discussion avec l'IA**, en bas à droite, est le point d'échange principal pendant la partie. Les messages envoyés par le bouton **Envoyer** ou **Entrée** (Maj + Entrée pour un saut de ligne) sont enregistrés sur le serveur et accessibles au seul agent distant authentifié via `GET /api/messages?after=<dernier-id>`. L'agent répond via `POST /api/messages` avec `{"text":"..."}`, et ses messages apparaissent dans la même boîte de discussion.

**Dictée :** le bouton micro transcrit la voix dans le champ, puis Entrée envoie le message. La reconnaissance vocale dépend du navigateur et peut transmettre l'audio à son fournisseur. Aucune IA n'est invoquée automatiquement : il faut qu'un agent externe consulte effectivement la file de messages. L'interface distingue « accès distant ouvert » de « activité de l'agent détectée ».

**Fin de tour :** le bouton **Passer mon tour** avance l'état du plateau et annonce la fin du tour à l'IA. Les phrases courtes « Je passe mon tour » ou « Je termine mon tour » font la même chose lorsqu'elles sont envoyées par Entrée. Les autres déclarations restent des messages destinés à l'IA, qui doit vérifier la règle et placer les cartes elle-même.

**Terrains :** le nom et la miniature des champs de bataille sont cliquables au clavier et à la souris. Leur détail affiche la carte et l'effet du catalogue lorsque disponible.

**Connexion inter-agents :** l'accès HTTPS temporaire propose à la fois la console navigateur `/agent/`, une description standard `/openapi.json` et l'API JSON authentifiée. Cela permet aux agents disposant d'un navigateur ou d'appels HTTP de piloter la partie à l'aide du prompt. Un modèle sans navigateur, sans outil réseau et sans connecteur ne peut pas être connecté automatiquement par un simple prompt ; le mode assisté par copier-coller reste la solution de secours.

## v0.26 — Réparation des mises à jour Windows

La v0.25 pouvait télécharger le nouvel exécutable puis **fermer le programme sans le remplacer ni réouvrir le gestionnaire**, car l'ancien mécanisme exécutait PowerShell en mode caché sans attendre son démarrage, vérifier le nouveau serveur, sauvegarder l'ancien EXE ou conserver les erreurs.

La v0.26 introduit un système transactionnel vérifié sous Windows :

- Le téléchargement est vérifié par **SHA256**. Un script PowerShell de maintenance est conservé dans le dossier `updates` de ton installation ; le gestionnaire attend son **accusé de démarrage** avant de fermer l'ancienne version.
- Le script attend la fermeture complète de l'ancien programme, recontrôle l'empreinte, effectue un remplacement atomique avec copie de secours et tente de redémarrer le nouveau compagnon dans **le même dossier**. Il confirme que `/api/health` annonce bien la version attendue avant de déclarer la mise à jour réussie.
- Si le remplacement ou le redémarrage échoue, il **restaure et relance l'ancienne version** quand cela est possible. Un journal `updates/update.log` et un diagnostic `updates/update-status.json` précisent l'erreur. Le gestionnaire affiche ces informations et permet d'ouvrir le journal.
- Le jeton local du navigateur est conservé **uniquement pendant le redémarrage de mise à jour**, afin que le gestionnaire déjà ouvert puisse se reconnecter sans perdre l'autorisation. Les modèles, réglages et sauvegardes ne sont pas supprimés.
- **Réparer une v0.25 dont la mise à jour est cassée :** ferme d'abord l'ancien Riftbound (ainsi que Qwen/Whisper via le bouton de fermeture), télécharge et lance le nouvel exécutable v0.26, puis **choisis exactement le dossier dédié où Riftbound est déjà installé**. La v0.26 reconnaît le manifeste existant et remplace l'ancien EXE de façon prudente sans effacer le modèle, le dossier `speech`, les sauvegardes ou les réglages. Si Windows bloque l'ancien EXE en cours d'utilisation, l'opération affiche une erreur explicite et ne l'efface pas.
- La validation GitHub inclut un **test réel sur Windows** : fermeture de l'ancienne instance, remplacement, lancement de la nouvelle instance, vérification de la version et du jeton, puis tentative d'installation d'un téléchargement corrompu pour vérifier le redémarrage de secours.

## v0.25 — Gestionnaire des processus : Qwen, Whisper et tunnel

Le gestionnaire affiche à tout moment le statut **réel des processus lancés par cette instance de Riftbound** : modèle Qwen (serveur llama.cpp), moteur de transcription Whisper et tunnel Cloudflare. L'interface distingue `installé`, `activé mais au repos`, `processus actif`, `installation en cours` et `désactivé`. Quand c'est pertinent, le PID du moteur lancé est indiqué. Les états sont rafraîchis toutes les 1,5 secondes.

- **■ Arrêter Qwen** : tue uniquement le serveur llama.cpp appartenant à Riftbound et désactive l'adversaire automatique dans les préférences. Les poids téléchargés restent sur place. **Activer Qwen** permet de redémarrer plus tard sans retélécharger un modèle intact.
- **■ Désactiver Whisper** : interrompt la transcription locale en cours et bloque les transcriptions suivantes, **sans désinstaller** les modèles Base/Small. **Activer Whisper** rétablit les transcriptions sans relancer un processus permanent.
- **■ Fermer le tunnel** : ferme l'accès distant optionnel sans toucher aux modèles locaux.
- **■ Tout arrêter · garder le gestionnaire ouvert** : arrête/désactive Qwen, Whisper et le tunnel ensemble. L'interface et le serveur compagnon restent ouverts ; les fichiers, modèles et parties restent intacts.
- **■ Quitter et arrêter les processus** : arrêt global incluant le serveur et le gestionnaire lui-même, comme auparavant.
- **Protection du PC** : seuls les sous-processus réellement créés par Riftbound sont surveillés/terminés ; aucun `taskkill /IM` global ni processus d'autres logiciels n'est touché. L'état n'est pas une liste exhaustive de toutes les IA installées ou exécutées par d'autres applications.

## v0.24 — Moteur de confrontation Riftbound

- Les assauts offensifs utilisent plusieurs unités prêtes de la base dans **une seule action**, en épuisant leurs cartes. L'IA peut sélectionner un combat intéressant contre un terrain défendu et ne clôt pas son tour avant sa résolution.
- Une confrontation sur un champ défendu ouvre une **fenêtre de réactions** visible, dans le plateau central. L'IA passe sa priorité si aucune réaction entièrement prise en charge ne peut être appliquée, puis demande au joueur de jouer ses réactions ou de passer (y compris par la voix « je passe », « no reaction »).
- Le calcul respecte la **Might actuelle**, les bonus comptés explicitement, Assault/Shield, Stun (zéro dégât infligé, mais Might conservée pour survivre), les exigences Tank/Backline pour l'assignation des dégâts, les dégâts déjà marqués et la répartition de dégâts **simultanée**.
- Le joueur peut préciser la première cible des dégâts via le panneau de combat. Les unités létalement blessées sont placées dans la défausse ; si les défenseurs survivent, les attaquants survivants retournent dans leur base. Les unités sont soignées après la confrontation et à la fin du tour ; Stun et bonus temporaires expirent selon leur durée.
- Les scores de conquête sont appliqués seulement après la résolution et seulement si le contrôleur du champ change. Aucun point n'est donné pour une attaque non résolue ni une égalité où les deux camps meurent.
- **Important :** les sorts, capacités spécifiques, réactions, substitutions de dégâts et déclenchements de cartes Riot ne sont PAS tous modélisables à partir du texte libre sans script vérifié. Les cartes et terrains concernés sont signalés et **la résolution automatique se bloque jusqu'à la confirmation explicite des effets appliqués**. Les interactions inconnues ne sont jamais inventées.
- Règles de référence : **Riftbound Core Rules du 9 octobre 2026**, notamment 143, 144, 466 à 468, 471 à 473, 807, 814 et 815. Voir https://playriftbound.com/fr-fr/rules-hub/

## v0.23 — IA conquérante et paiement des coûts complets

- **Tour IA automatique avec objectif de victoire :** le moteur déterministe vérifie les unités prêtes dans la base puis les déplace vers les champs non contestés pour obtenir des points de Conquer ; les prochains tours peuvent rapporter des points de Hold. L'IA renforce ensuite les champs qu'elle occupe. Chaque mouvement apparaît sur le plateau et dans le journal, sans supposer un effet de carte inconnu.
- **Deux coûts obligatoires par carte :** pour jouer une unité, le compagnon vérifie son Energy (runes prêtes à épuiser) **et** son Power (runes du domaine demandé à recycler). Il épuise d'abord les runes nécessaires puis recycle réellement les runes de la bonne couleur sous son Rune Deck, en réajustant les nombres de runes affichés. Une même rune peut être épuisée et recyclée dans le même paiement ; une carte impossible à payer reste en main.
- **Paiement atomique sécurisé :** la commande interne `play-paid` vérifie les sources (main IA ou champion choisi), les coûts et les domaines. Aucune demi-exécution si l'énergie ou le Power manque. Le modèle linguistique Qwen est utilisé pour la conversation, pas pour inventer des coûts et points de victoire.
- **Stratégie :** priorise les terrains libres plutôt que d'accumuler toutes les unités en base, vérifie les déplacements possibles, puis joue plusieurs unités si les ressources et le timing le permettent.
- **Limite explicite :** le moteur ne simule pas encore une bataille complète sur un champ défendu, ni les réactions, capacités ou effets complexes. Il ne crédite jamais une conquête non résolue. Le joueur et l'IA devront résoudre les combats contestés selon les règles officielles.

## v0.22 — Gestionnaire permanent, arrêt complet et vérification au démarrage

- **Gestionnaire permanent :** bouton **⚙ Gestionnaire** dans l'en-tête du site (et en mode plein écran). Il ouvre une page locale authentifiée, accessible également automatiquement au lancement de l'exécutable Windows. Les jetons restent dans le fragment URL local et la session navigateur.
- **Quitter totalement :** bouton **■ Quitter et arrêter les processus** dans le gestionnaire. Ferme le relais HTTP, Qwen/llama-server, les transcriptions Whisper en cours et le tunnel Cloudflare éventuel. L'arrêt est limité aux identifiants des processus lancés par le compagnon (Windows `taskkill /PID ... /T /F`) ; les modèles et sauvegardes sont conservés. Fermer un simple onglet du navigateur ne suffit pas : utilise ce bouton pour stopper le serveur.
- **Vérification de version :** au lancement, l'exécutable consulte sa release officielle. Tant que la vérification n'est pas terminée, aucune partie ni moteur Qwen n'est lancé. Si la version installée est ancienne, l'écran **Mise à jour nécessaire** remplace les actions de lancement et propose de télécharger/installer la version plus récente dans le même dossier, après vérification SHA-256.
- **Site synchronisé :** le site déployé compare la version du compagnon local à celle attendue, et consulte son état de mise à jour. Un compagnon trop ancien renvoie automatiquement à la **première étape d'installation**, avec un lien vers le gestionnaire et l'exécutable actuel ; les commandes de partie sont refusées côté serveur pendant la vérification.
- **Sans Internet :** lorsqu'une vérification échoue, le gestionnaire propose de réessayer ou de choisir explicitement **Continuer sans vérification réseau**. Cette option n'est pas disponible si une mise à jour est déjà confirmée comme nécessaire.
- **Aucune désinstallation automatique** ni suppression de données lors de la fermeture : le bouton « Désinstaller » reste une action distincte avec confirmation.

## v0.21 — Chat, jeu physique, score et plateau miroir

- **Chat lisible** : lorsqu'on remonte volontairement dans la conversation, les synchronisations ne forcent plus le retour en bas. Un bouton « Nouveaux messages ↓ » permet de revenir instantanément aux nouveaux échanges.
- **Réflexion IA** : les trois points animés apparaissent comme une bulle dans le fil de conversation, sous le dernier message, et non dans l'en-tête.
- **Micro mains libres** : l'envoi automatique des phrases vocales est **activé par défaut** et peut être désactivé grâce à une case à cocher persistante. Sans envoi automatique, la transcription reste dans le champ de saisie et le joueur choisit quand envoyer. Compatible Whisper local et Chrome.
- **Nouvelle partie** : les commandes `start` et `reset` effacent les messages de la partie précédente. Chaque conversation porte un identifiant de session ; une réponse de génération provenant d'une session périmée ne peut plus être publiée dans la nouvelle partie.
- **Plateau miroir** : l'IA a ses runes/sa main côté extérieur et sa base côté champs de bataille ; la base du joueur reste du côté de ses champs, ses runes et sa petite main physique côté extérieur. Cases légende/champion rapprochées de la taille des illustrations, historique gauche plus haut, outils plus petits.
- **Runes dynamiques** : leur largeur s'adapte au nombre de cartes prêtes/épuisées et à la largeur disponible, pour en voir le maximum sans découpe.
- **Main physique** : le programme n'invente pas les cartes cachées ; il affiche un éventail compact de dos de cartes et le compte connu.
- **Mouvements et points** : annonces composées comme « je canalise deux runes, je pioche une carte, je conquiers le Grove avec mon Loyal Poro puis je termine mon tour » ; le joueur déplace une unité **déjà visible en base et prête** vers le champ désigné. Si elle établit un contrôle non contesté, **Conquer** marque une fois par terrain et par tour ; **Hold** marque au début du tour suivant si le contrôle est conservé. La règle restrictive du huitième point d'une conquête est prise en compte ; les combats et effets complexes exigent toujours une vérification humaine.
- **Respect des règles** : une unité épuisée, un terrain ambigu ou une unité absente ne déclenchent jamais de déplacement inventé. Le serveur conserve des batches atomiques : une annonce illégale ne fait pas bouger la moitié du plateau.

## v0.20 — Gestionnaire portable, Whisper et désinstallation

- **Premier lancement Windows :** un sélecteur de dossier natif s'ouvre. Choisis un dossier dédié/vide (par exemple `Bureau/Riftbound Companion`). Le compagnon se copie dans ce dossier si nécessaire et s'y relance. Le fichier initial téléchargé dans `Téléchargements` reste celui de l'utilisateur : il n'est pas effacé automatiquement.
- **Stockage :** l'intégralité des fichiers créés/gérés par le compagnon est confinée dans ce dossier : sauvegardes, conversation, cache de cartes, paramètres, moteur Qwen, moteur Whisper, modèles, archives téléchargées, fichiers WAV temporaires, binaires de tunnel, fichiers de mises à jour. Les processus enfants héritent de `TEMP`/`TMP` pointant sur le sous-dossier `temp`.
- **IA et Whisper :** chaque installation demande une confirmation explicite affichant le chemin du dossier choisi. Aucune clé API ni abonnement. Whisper.cpp Windows x64 officiel (release `b5454`) téléchargé avec vérification SHA256. Modèles Base multilingue (148 Mo) et Small (488 Mo) en option. Les mots clés et noms connus Riftbound guident la transcription. La voix est capturée sur le navigateur et transmise uniquement au serveur local de l'application en WAV ; le mode Chrome reste disponible en secours. Le mode vocal reste soumis aux limites du CPU et de la transcription.
- **Gestionnaire inclus :** lancement du site, activation/arrêt IA locale, installation Whisper, vérification et application d'une mise à jour officielle avec SHA256, désinstallation complète des **seuls fichiers gérés**. La mise à jour utilise le même dossier de staging, puis redémarre.
- **Désinstallation sûre :** supprime les fichiers et sous-dossiers gérés seulement après double confirmation, arrête les processus et se retire, sans effacer des documents étrangers au dossier. Les anciennes données de `AppData\\Local\\RiftboundTableCompanion` sont transférées vers le dossier choisi lorsque celui-ci est initialisé, si elles sont reconnues.
- **Limites du nettoyage :** les caches, téléchargements, permissions microphone et historiques propres à Windows et au navigateur ne peuvent pas être supprimés de manière fiable sans toucher aux données d'autres applications. Le programme ne les efface donc pas. Les fichiers initiaux téléchargés hors du dossier doivent être effacés manuellement.

## v0.19 — Plateaux, clarification et micro
- Interface inspirée des zones d'un playmat Riftbound : légende, champion choisi, grande base, runes actives, main, défausse et les deux pioches regroupées. Les champs de bataille restent au centre entre les deux camps. Les cartes conservent leurs proportions et leurs conteneurs défilent horizontalement si elles sont nombreuses, plutôt que de les recadrer.
- Unités et runes épuisées apparaissent couchées à 90°, dans un emplacement élargi. Une unité jouée depuis une main entre normalement épuisée ; le moteur bloque son déplacement standard tant qu'elle l'est. Certains effets particuliers peuvent nécessiter une correction manuelle.
- Le mode vocal montre la transcription Chrome/Edge en direct, puis la phrase effectivement envoyée à l'IA.
- Lorsque le nom annoncé d'une carte est incertain, le serveur conserve temporairement l'annonce et demande confirmation. « oui », « Loyal Poro » ou le nom à l'envers peuvent reprendre cette annonce sans la soumettre à nouveau au modèle. Un paiement illégal reste refusé.
- Les erreurs HTTP 400/413/422 du modèle CPU déclenchent une seconde requête plus courte, sans contrainte JSON ; les erreurs finales nomment le moteur local et ne mentionnent plus des clés API.
- Les tests automatisés vérifient notamment l'absence de défilement de la page et de cartes coupées dans les principales zones.

## Compréhension FR / EN, fautes et langage naturel (v0.18)
- Le compagnon comprend les annonces françaises, anglaises et mixtes dans la même phrase, y compris les variations de syntaxe, les accents manquants, les fautes courantes et certaines erreurs de transcription vocale.
- Les verbes du jeu, les quantités et les noms de cartes sont interprétés séparément. Les correspondances approximatives de noms de cartes sont limitées et doivent être non ambiguës ; sinon l'IA demande le nom exact, sans modifier le plateau.
- Exemples : « Je chanel 2 runnes », « I draw une carte », « j'exaust une rune to play Loyal Porro in my base » (Loyal Poro uniquement si la correspondance est fiable).
- Les questions, hypothèses et négations ne déclenchent pas une action physique automatique.
- La langue de réponse est choisie d'après la formulation dominante du message, même s'il contient des termes dans les deux langues. Les noms de cartes sont préservés.
- Les règles, le paiement et les limites de connaissance du compagnon restent prioritaires : aucune correction orthographique ne rend légale une action interdite.

## Table de jeu v0.17 — actions et lisibilité
- Les annonces explicites sont d'abord vérifiées par le serveur : canalisation des runes, pioche, épuisement de runes, placement d'une unité identifiée dans le catalogue et fin de tour. Les actions trop ambiguës ne sont pas exécutées automatiquement.
- Le joueur qui commence canalise normalement **2 runes** au premier tour, le second joueur **3**. Le programme refuse l'annonce d'un nombre différent en première phase. Les runes physiques restent anonymes et sont visibles/épuisables sur le plateau.
- En cas de réponse mal formée ou d'UID inventé par le modèle Qwen, une action invalide est rejetée ; au tour de l'IA, un automate de secours peut effectuer les opérations simples et vérifiables (canaliser, piocher, jouer une unité ordinaire d'un coût connu, finir son tour). Il ne joue pas les effets incertains et ne prétend pas être un arbitre intégral.
- Piles de deck et de runes visibles, avec compteurs et commandes manuelles de pioche, animation des cartes qui changent de zone et indicateur de réflexion de l'IA. L'historique n'est affiché qu'une fois et sa colonne est réductible. La base physique se trouve immédiatement sous les champs de bataille.
- Sélecteur **FR / EN** pour l'interface principale et la langue de reconnaissance/lecture vocale. L'adversaire accepte les annonces françaises et anglaises ; les textes complets de cartes restent ceux du catalogue source.
- Limites : le programme ne peut pas vérifier le contenu de la main physique ni l'intégralité des restrictions, réactions et effets de cartes Riftbound. Une vérification humaine reste nécessaire pour les cas ambigus.

## Catalogue et gameplay

- Sélection compacte de légende/champion/battlefield, recherche par nom de personnage, aperçus limités à 7 résultats, champions compatibles proposés.
- Neuf decks préconstruits pour l'IA, dont les listes imprimées ne garantissent pas la légalité en compétition.
- Images demandées depuis des sources Riot ou un lien distant de secours Piltover Archive (pas de copie hébergée dans ce dépôt).
- Plateau interactif et actions enregistrées : déplacement, dégâts, points, phases, journal, dictée limitée et sauvegardes JSON.

**Limites :** le jeu ne constitue pas un moteur complet des règles ou un adversaire stratégique autonome. L'agent et le joueur doivent vérifier les effets des cartes et les règles compétitives.

## Construction, contrôle d'intégrité et licences

- Exécution depuis les sources : `node server.mjs` avec Node.js 20+.
- Tests : `node --test tests/*.test.mjs`.
- Compilation Windows via [GitHub Actions](https://github.com/Nitarii/Riftbound/actions/workflows/windows-companion.yml) avec Node 26 SEA.
- La compilation télécharge `cloudflared-windows-amd64.exe` **version 2026.10.7**, depuis la [release officielle Cloudflare](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7). Le SHA-256 exigé est `2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343`, valeur publiée par GitHub pour cet asset.
- Le binaire est compressé dans l'EXE, puis vérifié hors ligne par `RiftboundCompanion.exe --verify-bundle` lors de la compilation. Le runtime refuse un composant dont l'empreinte ne correspond pas.
- Cloudflare `cloudflared` est distribué sous licence Apache 2.0; une copie complète est incluse dans `licenses/cloudflared-APACHE-2.0.txt` et dans l'exécutable. © Cloudflare, Inc.
- L'EXE et son hash sont publiés dans [GitHub Releases](https://github.com/Nitarii/Riftbound/releases/tag/companion-latest).

Les marques, noms et illustrations Riftbound/League of Legends appartiennent à Riot Games. Le caractère gratuit et non commercial ne remplace pas les conditions d'usage ni les autorisations éventuellement nécessaires pour les actifs. Voir la [Digital Tools Policy](https://developer.riotgames.com/docs/riftbound).
