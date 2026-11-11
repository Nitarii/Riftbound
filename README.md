# Riftbound Table Companion

Projet fan gratuit et non commercial, **sans affiliation à Riot Games**. Ce site accompagne une partie de Riftbound jouée avec des cartes physiques face à un agent IA : plateau visuel, marqueurs, tours, decks, historique et accès temporaire de l'agent. Ce n'est pas une copie du jeu ni un service de parties numériques.

## Installer : un seul exécutable Windows

**Site :** https://nitarii.github.io/Riftbound/

**Téléchargement Windows 10/11 64 bits :**
https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.8.exe

1. Télécharger puis lancer `RiftboundCompanion-v0.8.exe`.
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
