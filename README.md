# Riftbound Table Companion

Projet fan gratuit et non commercial, **sans affiliation à Riot Games**. Ce site accompagne une partie de Riftbound jouée avec des cartes physiques face à un agent IA : plateau visuel, marqueurs, tours, decks, historique et accès temporaire de l'agent. Ce n'est pas une copie du jeu ni un service de parties numériques.

## Installer : un seul exécutable Windows

**Site :** https://nitarii.github.io/Riftbound/

**Téléchargement Windows 10/11 64 bits :**
https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.11.exe

1. Télécharger puis lancer `RiftboundCompanion-v0.11.exe`.
2. Dans l'onglet du site déjà ouvert, cliquer sur **Autoriser la connexion locale** lorsque le navigateur le demande. L'exécutable n'ouvre pas un nouvel onglet tout seul.
3. Choisir la légende, le champion choisi, le champ de bataille et le deck de l'IA; démarrer la partie.
4. À l'étape 4, cliquer **Activer l'accès et copier le prompt IA**, puis coller le texte dans une **conversation privée** avec l'agent souhaité. Si le navigateur ne permet pas la copie automatique, le prompt apparaît dans un champ sélectionnable.
5. À la fin, cliquer **Couper l'accès** ou fermer l'exécutable.

**Aucune installation de Node.js, Cloudflare ou cloudflared n'est nécessaire.** L'EXE contient le serveur, le site et une copie compressée de `cloudflared` (outil officiel de Cloudflare), vérifiée par SHA-256 lors de la compilation et avant sa première utilisation. Le module Cloudflare est extrait une seule fois dans `%LOCALAPPDATA%\RiftboundTableCompanion` et réutilisé ensuite : aucune installation système ni téléchargement à l'exécution.

L'EXE n'est pas signé numériquement; Windows peut présenter SmartScreen. Vérifier le fichier depuis GitHub et sa somme SHA-256 publiée avec la Release. Le navigateur peut demander une autorisation de connexion vers `127.0.0.1`. Les images de cartes et l'accès distant nécessitent une connexion Internet.

## Partager temporairement le plateau avec un agent

Par sécurité, aucun accès distant n'est actif avant le clic sur **Activer l'accès et copier le prompt IA**. Ce bouton crée un Quick Tunnel HTTPS, émet un jeton d'agent distinct du jeton d'administration local, puis prépare le prompt. La connexion est valable **quatre heures maximum**, mais peut être fermée immédiatement.

Le tunnel ne redirige pas vers le serveur principal. Il redirige vers une **passerelle dédiée** qui n'autorise que :

- `GET /api/guide`, `GET /api/state`, `GET /api/decks`, `GET /api/catalog`
- `POST /api/command`, avec restrictions sur les opérations qui appartiennent au joueur local
- `/agent` : interface web restreinte pour les agents disposant d'un navigateur interactif

Le jeton temporaire est nécessaire pour lire ou modifier l'état du plateau. **Ne communique le prompt d'accès qu'à un agent de confiance dans une conversation privée.** L'adresse HTTPS est accessible sur Internet, même si l'accès au jeu est protégé par un jeton. Le jeton d'administration local n'est pas exposé par cette passerelle.

Un simple chat IA **ne peut pas forcément accéder au plateau** : l'agent doit savoir naviguer dans la console web distante ou envoyer des requêtes HTTP authentifiées. Le tunnel ne lui confère pas ces capacités. En l'absence de ces outils, le site offre un mode manuel de suivi des actions.

Cloudflare Quick Tunnels convient à cet usage expérimental, sans garantie de disponibilité ni d'adresse permanente. Aucun compte Cloudflare n'est nécessaire pour le tunnel temporaire.

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

## Adversaire intégré : sans tunnel ni navigateur externe

Le mode **IA directement dans le jeu** est désormais recommandé pour les conversations ChatGPT qui ne peuvent pas joindre les tunnels HTTPS. Le module Companion fait ses propres requêtes sortantes vers un **fournisseur de modèle OpenAI-compatible**, puis présente les réponses dans le chat du plateau et applique les commandes validées à la table.

**Démarrage (une seule configuration)** : à l'étape 4 du site, choisis OpenAI API, Ollama, LM Studio ou un fournisseur HTTPS compatible. Indique le modèle ; colle une clé API pour les fournisseurs payants. Clique **Activer l'IA intégrée**. Le site ouvre ensuite le plateau : un message écrit ou dicté dans la chatbox déclenche une réponse automatique. Nul besoin de copier un prompt ni d'ouvrir le tunnel.

L'abonnement **ChatGPT Plus n'inclut pas la facturation de l'API OpenAI**. La clé API doit être obtenue et créditée indépendamment sur la plateforme du fournisseur. Une clé n'est **pas** nécessaire pour Ollama/LM Studio, mais leurs serveurs et leurs modèles doivent être installés et opérationnels sur le PC. Les modèles locaux peuvent être moins fiables pour les règles et les commandes complexes. Le coût des requêtes dépend du fournisseur ; chaque message envoyé peut déclencher une requête.

**Confidentialité et sécurité** : la configuration et la clé sont enregistrées dans le dossier de données local du programme, jamais dans GitHub Pages ou dans le navigateur. Les endpoints de configuration ne sont disponibles que sur le serveur de l'utilisateur authentifié en local, jamais via la passerelle Cloudflare. Le fournisseur choisi reçoit les messages, le plateau public, **la main de l'IA** et les informations nécessaires à sa décision ; **la main physique cachée du joueur n'est jamais envoyée**. Les commandes du modèle sont limitées à une liste blanche, contrôlées avant application et appliquées ensemble uniquement si le plateau n'a pas changé. Le bouton **Désactiver** suspend les nouvelles requêtes IA. Le mode tunnel externe reste une alternative facultative, mutuellement exclusive.

**Limites** : le moteur n'arbitre pas automatiquement tous les effets ou règles compétitives, et l'IA peut se tromper. Ce mode n'est pas une connexion à une conversation ChatGPT déjà ouverte : c'est une session de modèle distincte, facturée ou exécutée localement. Il fournit cependant une IA capable de répondre et de modifier le plateau sans aucun accès réseau entrant depuis l'environnement d'un chat.

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
