# Riftbound Table Companion

Compagnon gratuit pour jouer à **Riftbound avec tes cartes physiques** face à un adversaire IA local. Le logiciel affiche le plateau, suit les points, annonce les actions et reconnaît les commandes écrites ou vocales. Il s'agit d'un projet de fans non officiel, sans affiliation à Riot Games.

**Site :** https://nitarii.github.io/Riftbound/  
**Windows :** [Télécharger Riftbound Companion v0.36](https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.36.exe)

## v0.36 — Profils IA gratuits, Vulkan et commandes vocales rapides

- Le gestionnaire Windows permet de choisir le modèle local : **Qwen3 4B Instruct 2507** (~2,5 Go) ou **Qwen3.5 9B Q4_K_M** (~5,7 Go, téléchargement facultatif). Les deux variantes sont disponibles hors ligne après installation, et vérifiées SHA-256.
- **GPU Vulkan** (AMD, NVIDIA, Intel Arc) en mode automatique si un GPU discret est détecté, avec **CPU obligatoire en solution de secours**. L'utilisateur peut aussi choisir GPU préféré ou CPU uniquement. Les moteurs proviennent de llama.cpp b12277, vérifiés SHA-256, et restent dans le dossier local choisi.
- Le modèle avancé peut mieux interpréter la conversation et les textes de cartes, mais **les actions et paiements du jeu restent validés par le moteur déterministe**. La prise en charge des capacités complexes n'est pas encore exhaustive.
- **Vocal** : la fin de phrase est détectée après 480 ms de silence (contre 650 ms) ; la transcription ne bloque plus sur les mises à jour distantes du catalogue. Whisper Small reste local, sur CPU dans cette version.
- L'application ne télécharge aucun modèle sans action utilisateur ; le mode 4B préexistant et les données de partie sont conservés.

## v0.35 — Retour au gestionnaire depuis l'accueil

- Le bouton **⚙ Gestionnaire** est désormais visible sur l'écran d'accueil du compagnon.
- Depuis l'accueil connecté à l'application Windows, un clic retourne au gestionnaire dans le même onglet. Lors d'une partie, le gestionnaire s'ouvre dans un autre onglet afin de conserver le plateau.
- Le gestionnaire ne peut être ouvert qu'avec une connexion authentifiée au serveur local : à défaut, l'interface guide vers la connexion du compagnon.
- Une vérification de navigation réelle dans le navigateur s'ajoute aux contrôles automatiques de l'interface.

## v0.34 — Dégâts létaux et capacités de mort

- Les dégâts infligés par un effet de carte utilisent désormais le calcul commun de Might, avec les bonus de statistiques pris en compte.
- Une unité vaincue par un effet déclenche immédiatement ses capacités de mort reconnues, dont Deathknell, au lieu de disparaître silencieusement.
- Le calcul des dégâts manuels tient compte du contexte du plateau et des bonus conditionnels de défense lorsque le combat est ouvert.
- Tests de régression ajoutés pour dégâts létaux, non létaux et Shield conditionnel. Cela ne signifie pas encore que toutes les capacités de Riftbound sont arbitrées automatiquement.

## v0.33 — Fiche d'effet affichée correctement et Shield conditionnel

- Résout le bug d'affichage qui écrasait l'intégralité du playmat dans une colonne étroite lors de la présentation d'une capacité à confirmer. Les avis restent dans une fenêtre flottante centrée, limitée à l'écran, sans déplacer les zones du plateau.
- Les capacités passives **I have [Shield N] while I'm at a battlefield with exactly X other units you control** sont reconnues comme des statistiques continues, **et non des effets à déclencher lorsque la carte est jouée**. Leur bonus s'applique seulement en défense et uniquement si le nombre d'autres unités alliées présentes sur ce champ correspond à la condition.
- Les anciennes confirmations erronées pour cette famille d'effets sont nettoyées lors du chargement des sauvegardes, sans supprimer les confirmations de capacités réellement non automatisées.
- Régression vérifiée sur l'annonce « je vais jouer Disciple of Shen pour 2 runes », sur les conditions de défense avec 0, 1 ou 2 alliés, et sur l'affichage d'un effet à confirmer aux résolutions PC et mobile.
- Le CSS et le JavaScript du site possèdent désormais une version de cache explicite afin de charger les correctifs après une mise à jour.

La reconnaissance de ce motif est générique : elle n'est pas codée en dur pour une référence de carte particulière. La couverture des effets complexes reste partielle et nécessite parfois un arbitrage manuel.

## v0.32 — Moteur de règles en développement
La v0.32 regroupe les corrections apportées depuis la v0.31 : mots-clés et déclencheurs supplémentaires (Deathknell, Legion, Temporary, Vision), mise à jour des effets sur les runes, jetons, cibles, dégâts et bonus, gestion du Burn Out et de la victoire, déplacements standards et Ganking, vérification des coûts et réduction des actions inventées par le modèle conversationnel.

**Limite essentielle :** l'adversaire ne garantit pas encore une partie entièrement autonome selon toutes les règles. Les effets permanents complexes, les réactions en chaîne, les choix à plusieurs étapes et plusieurs autres capacités nécessitent toujours un arbitrage ou une confirmation. Un résultat de tests automatisés réussi n'est pas une validation officielle de toutes les cartes.

**Publication non officielle :** ce projet de fans ne bénéficie d'aucune affiliation ni approbation de Riot Games. La politique publique de Riot indique que les applications autonomes appliquant automatiquement les règles de Riftbound ne font pas partie des usages approuvés. Voir https://developer.riotgames.com/policies/riftbound.

## v0.31 — Moteur générique des capacités de cartes

Le compagnon **lit désormais les textes des cartes du catalogue** pour identifier leur type d'effet et le moment où il se déclenche : pose d'une carte, Beginning, Ending, Hold, Conquer, déplacement, pioche, mort, attaque, défense et jeu d'une autre carte alliée. Il ne s'agit plus d'une liste de cartes spécifiquement programmées.

Pour les capacités dont toutes les étapes sont reconnues, le moteur peut mettre à jour le plateau directement : pioche, défausse, épuisement ou redressement de runes, soins simples, dégâts simples, bonus temporaire de Might, redressement d'une unité. Les paiements en énergie et Power sont vérifiés, y compris le supplément optionnel **Accelerate**. Le planificateur IA considère aussi les unités, équipements et sorts.

**Limite importante :** tous les effets ne sont pas encore résolus automatiquement. Les mots-clés passifs, conditions, choix complexes, équipements attachés et fenêtres de réactions demandent un traitement plus avancé. Ils sont **signalés dans le plateau avec leur texte**, et la partie ne continue pas sans confirmation explicite de résolution. Le logiciel ne prétend jamais appliquer une capacité qu'il ne sait pas vérifier. Cette confirmation n'exécute pas elle-même l'effet.

L'endpoint local authentifié `GET /api/effects/audit` permet de consulter la couverture sur **l'ensemble du catalogue réellement chargé** (capacités reconnues, partielles ou non prises en charge). Les changements de règles et errata doivent être contrôlés depuis le hub officiel.

---

## v0.30 — Effets de cartes, fiche lisible et voix plus réactive

- L'IA paie l'énergie et les runes Power **et applique les défausses obligatoires reconnues**, par exemple « When you play me, discard 1 » sur Chemtech Enforcer. Elle choisit une carte de sa propre main et la place en défausse lors de la même action. Si l'effet d'entrée en jeu n'est pas encore pris en charge, le moteur refuse le jeu automatique plutôt que de l'ignorer.
- La fenêtre des cartes garde une image droite même pour une unité épuisée, avec son effet lisible à droite et une croix de fermeture en haut. L'état « Épuisée » reste indiqué.
- Le micro découpe la phrase après environ **480 ms** de silence au lieu de 1350 ms. Whisper Small peut rester chargé localement pendant la conversation (serveur CPU sur 127.0.0.1, accès interne aléatoire), avec repli sur la commande existante si nécessaire. Les bruits non verbaux sont filtrés avant le chat.
- Le gestionnaire contrôle l'arrêt de Whisper et les modèles, et le plateau explique plus clairement quand les runes prêtes ne suffisent pas.

Les effets plus complexes (ciblage, événements déclenchés, réactions et capacités spéciales) restent soumis à validation : aucun moteur déterministe générique ne peut appliquer tous les textes sans les règles correspondantes.

## Démarrer

1. Lance l'exécutable Windows 10/11 (64 bits) et choisis le dossier où conserver le compagnon. Il n'y a ni Node.js, ni compte, ni clé API à installer.
2. Dans le gestionnaire, choisis **Qwen3 4B (équilibré)** ou **Qwen3.5 9B (avancé)**, puis l'accélération **Auto / Vulkan / CPU**. Clique **Installer / activer IA et micro**. Le profil 4B nécessite environ **3 Go** de modèles avec Whisper Small ; le 9B demande environ **6,2 Go**, moteurs non compris. Les modèles supplémentaires ne sont téléchargés qu'à ta demande.
3. Clique **Jouer à Riftbound**. Le plateau s'ouvre **dans le même onglet** et se connecte automatiquement. Choisis ta légende, ton champion, ton terrain et le deck adverse, puis clique **Commencer la partie**.

Ensuite, annonce tes actions dans la **Discussion avec l'IA** ou active **Mode vocal**. Les pioches et canalisations normales de début de tour sont comptabilisées automatiquement ; manipule simplement tes cartes physiques sans révéler ta main.

## Ce que fait le compagnon

- **Plateau physique assisté** : zones de légende, champion, base, runes, défausse, main et champs de bataille, scores et historique.
- **Adversaire IA autonome** : moteur déterministe pour les mouvements, conquêtes, coûts, runes et combats standards. Le modèle de langage interprète les annonces et répond aux questions.
- **Vocal local** : Whisper Small reconnaît le français et l'anglais, avec noms de cartes intégrés au contexte. La transcription et l'envoi automatique peuvent être contrôlés depuis le plateau.
- **Gestionnaire permanent** : accessible depuis le jeu pour vérifier les modèles, arrêter les processus ou quitter complètement. Le démarrage d'une ancienne version est bloqué jusqu'à vérification ou mise à jour.
- **Options avancées** : import/export, catalogue de cartes, commandes du plateau, connexion temporaire d'un agent externe. Ces options restent masquées ou repliables pendant le jeu normal.

Les modules de voix et d'IA n'utilisent aucun service payant. Après téléchargement initial, les modèles s'exécutent **sur ton PC**. Les ressources de cartes et les vérifications de version peuvent nécessiter Internet.

## Installation et performances

| Élément | Choix fixe |
|---|---|
| Modèle de langage | Qwen3 4B Instruct 2507 (~2,5 Go), ou Qwen3.5 9B Q4_K_M (~5,7 Go), au choix |
| Reconnaissance vocale | Whisper Small multilingue, ~488 Mo |
| Inférence | llama.cpp Vulkan GPU avec repli CPU ; whisper.cpp CPU Windows x64 |
| RAM | 16 Go système recommandés ; prévoir environ 6 Go libres pour le compagnon et sa voix |
| Stockage | Modèles, préférences, sauvegardes, téléchargements temporaires et moteurs dans le dossier choisi |

Le gestionnaire propose **deux profils IA** et un choix de backend **Auto / Vulkan / CPU**. Whisper Small reste le seul modèle vocal intégré et ne dépend pas de Chrome Speech Recognition. Les performances varient selon le matériel et les pilotes ; le CPU reste le recours fiable. Les anciens modèles valides et les sauvegardes sont conservés lors d'un changement de profil.

### Mises à jour et fermeture

Le gestionnaire vérifie les versions via la release GitHub officielle et contrôle l'intégrité avant installation. Il tente de redémarrer la nouvelle version et restaure la précédente en cas d'échec. Pour arrêter le compagnon et les IA, utilise **Tout quitter**. Pour gérer séparément les processus ou désinstaller, ouvre **Options et maintenance** ou **Processus et arrêt avancé**.

Le fichier initial téléchargé dans le dossier Téléchargements, ainsi que le cache propre au navigateur, ne sont pas supprimés par la désinstallation du dossier dédié.

## Règles, limites et confidentialité

Riftbound possède des effets et réactions de cartes complexes. Le modèle IA **ne remplace pas un arbitre officiel** : le moteur valide les actions couvertes et doit demander confirmation quand un effet ne peut pas être résolu de façon sûre. Le joueur conserve sa main cachée. Pour les décisions litigieuses, consulte le [hub officiel des règles et errata](https://playriftbound.com/fr-fr/rules-hub/).

La communication du jeu local utilise `127.0.0.1` et un jeton privé. Le micro est transmis uniquement au module Whisper local et les WAV temporaires sont supprimés après transcription. Le tunnel HTTPS vers un agent externe est **désactivé par défaut** ; son activation demande une action volontaire et son accès doit rester privé.

Les droits sur les cartes et règles appartiennent à Riot Games. Les données de catalogue et illustrations distantes restent soumises aux conditions de leurs auteurs. Voir [les conditions officielles des outils Riftbound](https://developer.riotgames.com/docs/riftbound).

## Ressources des modèles

- [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) : moteurs CPU et Vulkan Windows épinglés à la release `b12277`, SHA-256 des archives vérifié.
- [Qwen3 4B Instruct 2507 GGUF](https://huggingface.co/Open4bits/Qwen3-4B-Instruct-2507-GGUF) (Apache-2.0) : `qwen3-4b-instruct-2507-Q4_K_M.gguf`, SHA-256 `1571ec5115bcfed4b4327fc27b5f44ea284806caf5331eef89326191c9b031d6`.
- [Qwen3.5 9B Q4_K_M GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) : fichier facultatif `Qwen3.5-9B-Q4_K_M.gguf`, SHA-256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT), moteur `b5454`.
- [Whisper Small](https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-small.bin) : SHA-256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`.

Les téléchargements sont vérifiés par SHA-256, peuvent reprendre après une interruption et sont annulables via l'arrêt du compagnon. Aucun modèle n'est intégré au binaire distribué.

## Développement

Le serveur utilise Node.js et des modules ES. Le cœur du plateau est dans `core.mjs`, l'IA locale dans `free-ai.mjs` et `integrated-ai.mjs`, la voix dans `whisper-local.mjs`, et le relais authentifié dans `server.mjs`.

```bash
node --test tests/*.test.mjs
node server.mjs
```

La compilation Windows (exécutable autonome), les tests de mise à jour, de processus et de mise en page sont exécutés par les GitHub Actions du dépôt.
