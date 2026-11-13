# Riftbound Table Companion

Compagnon gratuit pour jouer à **Riftbound avec tes cartes physiques** face à un adversaire IA local. Le logiciel affiche le plateau, suit les points, annonce les actions et reconnaît les commandes écrites ou vocales. Il s'agit d'un projet de fans non officiel, sans affiliation à Riot Games.

**Site :** https://nitarii.github.io/Riftbound/  
**Windows :** [Télécharger Riftbound Companion v0.30](https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.30.exe)

## v0.30 — Effets de cartes, fiche lisible et voix plus réactive

- L'IA paie l'énergie et les runes Power **et applique les défausses obligatoires reconnues**, par exemple « When you play me, discard 1 » sur Chemtech Enforcer. Elle choisit une carte de sa propre main et la place en défausse lors de la même action. Si l'effet d'entrée en jeu n'est pas encore pris en charge, le moteur refuse le jeu automatique plutôt que de l'ignorer.
- La fenêtre des cartes garde une image droite même pour une unité épuisée, avec son effet lisible à droite et une croix de fermeture en haut. L'état « Épuisée » reste indiqué.
- Le micro découpe la phrase après environ **650 ms** de silence au lieu de 1350 ms. Whisper Small peut rester chargé localement pendant la conversation (serveur CPU sur 127.0.0.1, accès interne aléatoire), avec repli sur la commande existante si nécessaire. Les bruits non verbaux sont filtrés avant le chat.
- Le gestionnaire contrôle l'arrêt de Whisper et les modèles, et le plateau explique plus clairement quand les runes prêtes ne suffisent pas.

Les effets plus complexes (ciblage, événements déclenchés, réactions et capacités spéciales) restent soumis à validation : aucun moteur déterministe générique ne peut appliquer tous les textes sans les règles correspondantes.

## Démarrer

1. Lance l'exécutable Windows 10/11 (64 bits) et choisis le dossier où conserver le compagnon. Il n'y a ni Node.js, ni compte, ni clé API à installer.
2. Dans le gestionnaire, clique **Installer IA et micro**. Un seul clic installe **Qwen3 4B Instruct 2507 Q4_K_M** (l'adversaire) et **Whisper Small multilingue** (le micro). Le premier téléchargement représente environ **3 Go**, moteurs non compris.
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
| Modèle de langage | Qwen3 4B Instruct 2507, quantification Q4_K_M, ~2,5 Go |
| Reconnaissance vocale | Whisper Small multilingue, ~488 Mo |
| Inférence | llama.cpp et whisper.cpp sur CPU Windows x64 |
| RAM | 16 Go système recommandés ; prévoir environ 6 Go libres pour le compagnon et sa voix |
| Stockage | Modèles, préférences, sauvegardes, téléchargements temporaires et moteurs dans le dossier choisi |

Il n'y a **aucun menu de profils**, aucun modèle vocal alternatif et aucun fournisseur de reconnaissance Chrome. La vitesse dépend du processeur et de la mémoire disponible. Les anciennes pondérations connues sont supprimées uniquement après installation réussie des nouvelles ; les sauvegardes restent conservées.

### Mises à jour et fermeture

Le gestionnaire vérifie les versions via la release GitHub officielle et contrôle l'intégrité avant installation. Il tente de redémarrer la nouvelle version et restaure la précédente en cas d'échec. Pour arrêter le compagnon et les IA, utilise **Tout quitter**. Pour gérer séparément les processus ou désinstaller, ouvre **Options et maintenance** ou **Processus et arrêt avancé**.

Le fichier initial téléchargé dans le dossier Téléchargements, ainsi que le cache propre au navigateur, ne sont pas supprimés par la désinstallation du dossier dédié.

## Règles, limites et confidentialité

Riftbound possède des effets et réactions de cartes complexes. Le modèle IA **ne remplace pas un arbitre officiel** : le moteur valide les actions couvertes et doit demander confirmation quand un effet ne peut pas être résolu de façon sûre. Le joueur conserve sa main cachée. Pour les décisions litigieuses, consulte le [hub officiel des règles et errata](https://playriftbound.com/fr-fr/rules-hub/).

La communication du jeu local utilise `127.0.0.1` et un jeton privé. Le micro est transmis uniquement au module Whisper local et les WAV temporaires sont supprimés après transcription. Le tunnel HTTPS vers un agent externe est **désactivé par défaut** ; son activation demande une action volontaire et son accès doit rester privé.

Les droits sur les cartes et règles appartiennent à Riot Games. Les données de catalogue et illustrations distantes restent soumises aux conditions de leurs auteurs. Voir [les conditions officielles des outils Riftbound](https://developer.riotgames.com/docs/riftbound).

## Ressources des modèles

- [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) : moteur CPU Windows épinglé à la release `b12277`.
- [Qwen3 4B Instruct 2507 GGUF](https://huggingface.co/Open4bits/Qwen3-4B-Instruct-2507-GGUF) (Apache-2.0) : `qwen3-4b-instruct-2507-Q4_K_M.gguf`, SHA-256 `1571ec5115bcfed4b4327fc27b5f44ea284806caf5331eef89326191c9b031d6`.
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
