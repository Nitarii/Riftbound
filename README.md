# Riftbound Table Companion

Projet fan gratuit et non commercial, **sans affiliation à Riot Games**. Ce site accompagne une partie de Riftbound jouée avec des cartes physiques face à un agent IA : plateau visuel, marqueurs, tours, decks, historique et accès temporaire de l'agent. Ce n'est pas une copie du jeu ni un service de parties numériques.

## Installation gratuite, un seul exécutable Windows 10/11 x64

**Site :** https://nitarii.github.io/Riftbound/

**Téléchargement :** https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.16.exe

1. Télécharge et lance `RiftboundCompanion-v0.16.exe`. Le programme serveur se connecte à l'onglet du site déjà ouvert après l'autorisation du navigateur.
2. Choisis ta légende, ton champion et ton champ de bataille ; crée la partie avec le deck adverse.
3. Clique **Installer et activer mon IA gratuite**. La première fois, le programme télécharge deux fichiers officiels : **llama.cpp CPU Windows x64 (~25 Mo)** et **Qwen3-0.6B Q8 (~639 Mo)**. Les fichiers sont gardés sur ton PC et vérifiés avec leurs empreintes SHA-256.
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

## Conversation vocale continue (v0.16)

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
