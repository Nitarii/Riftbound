# Riftbound Table Companion (prototype v0.2)

## Mise à jour du 11 novembre 2026 — version 0.2

**Site GitHub Pages** (si le déploiement est terminé) : https://nitarii.github.io/Riftbound/

**Nouveautés :** catalogue de cartes et images issues de la galerie Riot (export communautaire Hugging Face : environ 1 407 cartes daté du 4 novembre 2026, sauvegarde depuis GitHub : environ 1 180 cartes), lien de secours des images vers Piltover Archive, sélection aléatoire de deux decks préconstruits officiellement publiés (Fiora et Rumble), mélange des decks, séparation correcte du champion choisi, API de recherche de cartes et des listes de decks, saisie vocale et interprétation prudente de quelques phrases françaises.

Pour tester : ouvrir le site, attendre le chargement du catalogue, entrer sa légende / son champion / son battlefield, choisir le deck IA (Fiora, Rumble ou aléatoire), puis démarrer. Le joueur garde sa main physique secrète. Il peut écrire « je pioche deux cartes », « je gagne un point », « je pose Fiora, Peerless sur le terrain de l'IA » et utiliser **Interpréter & placer**. En mode voix, l'application peut appliquer automatiquement les annonces simples si l'option est cochée. Les effets, combats et règles compétitives restent à interpréter manuellement.

Pour un agent IA local, lancer le serveur avec Node.js 20+ : cloner le dépôt puis exécuter **node server.mjs** dans son dossier. Ouvrir http://127.0.0.1:8787 et connecter l'API avec le jeton imprimé dans le terminal. Les nouvelles routes incluent **GET /api/catalog?q=Shen**, **GET /api/decks**, **POST /api/command** avec le corps JSON {"type":"select-precon","id":"random"}. La commande sélectionne un des deux decks. Une IA distante ne peut **pas** accéder simplement à localhost ou à un état privé avec la seule URL GitHub Pages.

**Politique et licences :** images © Riot Games; Piltover Archive n'est qu'un lien de secours, pas une autorisation d'usage. Riot demande une clé API propre à l'application ou une licence écrite pour l'usage de ses actifs et restreint les applications autonomes de gameplay Riftbound et l'arbitrage automatique. Obtenir son accord avant la diffusion d'un jeu autonome avec ses images. Voir https://developer.riotgames.com/docs/riftbound. Le prototype est non commercial, non affilié et ne vérifie pas les règles.

Source des decks : https://playriftbound.com/en-us/news/announcements/spiritforged-precons-fiora-rumble/

Source des données récentes : https://huggingface.co/datasets/Wysme/riftbound-cards

Catalogue de secours : https://github.com/slimtreble/Riftbound-card-data

**À faire ensuite :** import de davantage de decks validés, accès distant sécurisé pour agents, gestion améliorée des zones cachées, interprétation des annonces complexes et mise à jour exhaustive des errata/bans. Les fonctionnalités ne sont pas encore validées dans une partie de bout en bout en navigateur.

---


A **non-official, non-commercial, human-supervised tabletop companion** for physical games of Riftbound, with a browser board, card gallery, shared local state model and opt-in local API for agents. This is not a licensed Riot product, a rules engine, or a tournament-certified game client.

> **Important:** Riot's [Riftbound Digital Tools Policy](https://developer.riotgames.com/docs/riftbound) does not currently approve automated rule enforcement or standalone Riftbound-only gameplay clients. **Do not distribute this prototype as an autonomous digital Riftbound game.** Before public publication or incorporation of Riot's card assets, request permission/an app-specific API key and verify the current policy. This prototype is meant for local technical testing and human-led tabletop recordkeeping.

## Quick start

**No installation:** Open [index.html](index.html) with a static web server. For GitHub Pages, open repository **Settings → Pages → Deploy from a branch → main / (root)**. Published Pages URLs are public and serve *only static files*; they do not host the local API, broadcast state, or run an agent.

**Locally with Node 20+ (recommended):**

~~~sh
git clone https://github.com/Nitarii/Riftbound.git
cd Riftbound
node server.mjs
~~~

Open the URL printed by the server (default: **http://127.0.0.1:8787**). No dependencies or npm install. The server prints a fresh secret token. It is bound to 127.0.0.1 only and cannot be reached by an external/cloud AI agent without a separate explicitly authorized networking solution. Local game state is written to **.riftbound-local-state.json**, which **must not be committed**.

### Playing with physical cards

1. Open **Configuration** and enter your own legend, champion and battlefield. Your physical hand is represented **only by a count** to avoid disclosing hidden cards.
2. Load a JSON card catalog, or let the browser attempt to load the public gallery data. Riot's assets remain their property; images are requested from external hosts and might be unavailable.
3. Configure the AI with its legend, champion and battlefield. The included draft deck is illustrative, **not** tournament-legal or a verified 40-card list. When it cannot form a draft the app warns and refuses.
4. Start the game and manually record actions. Click cards to move, exhaust, ready, damage or remove them; the phase and score controls are manual. Record narrated actions as notes.
5. Export your game to JSON to resume later. In browser-only mode the board is saved in localStorage.

### Agent API

Start the local relay and visit the **Agent IA** panel. Enter local URL and the token printed by the server, then connect. The same state becomes accessible to local agents using HTTP requests.

~~~http
GET /api/guide
Authorization: Bearer <LOCAL_TOKEN>
~~~

~~~http
GET /api/state
Authorization: Bearer <LOCAL_TOKEN>
~~~

~~~http
POST /api/command
Authorization: Bearer <LOCAL_TOKEN>
Content-Type: application/json

{"type":"note","text":"L'IA réfléchit au tour suivant."}
~~~

Other commands: setup-human, setup-ai, start, next-turn, phase, add, move, remove, exhaust, ready, flip, damage, counter, score, hand-count, draw, channel, mulligan and reset. See **GET /api/guide** for examples and **core.mjs** for semantics.

**Example: put an AI unit in base**

~~~json
{"type":"add","player":"ai","zone":"base","card":{"name":"Sample Unit","type":"Unit"}}
~~~

Move the resulting \`uid\` found in \`GET /api/state\`:

~~~json
{"type":"move","uid":"c_...","zone":"battlefield","battlefield":0}
~~~

GET /api/events?ticket=... streams live updates (SSE). Tickets are short-lived and single-use and are requested through authorized POST /api/events-ticket. Password/token headers are required on all other API requests.

An AI needs **actual HTTP/API capabilities** to use these endpoints. Just giving a ChatGPT chat the URL is not enough, and a cloud agent **cannot** access a server bound to 127.0.0.1 on your machine. Do not publish the local token or expose unauthenticated endpoints. GitHub Pages and localStorage are not real-time shared multiplayer infrastructure.

## Catalogue data

Supported JSON: an array of cards, or an object containing \`cards: [...]\`. Example:

~~~json
[
  {
    "cardCode":"example-001",
    "name":"Example Unit",
    "cardType":"Unit",
    "domains":["Calm"],
    "imageUrl":"https://your-authorized-host.example/example.png",
    "abilityEffective":"Example text",
    "energy":2,
    "power":1,
    "might":3
  }
]
~~~

A preexisting community card data project, [riftbound-cards](https://github.com/LouisCourrian/riftbound-cards), may be useful for a local import. Sources may lag behind releases, differ from official errata, break due to CORS, or change their schema. Do not redistribute card artwork without confirming rights. The card catalog is browser-local and is **not** currently synchronized into /api/catalog on the relay.

## Current status and limitations

- Working code paths for: interactive board, card detail, zone changes, markers, scoring, manual turn/phase changes, state history, browser import/export, local storage, one-way SSE state sync, and an authenticated local command API.
- **Not implemented:** an autonomous strategic agent, reliable natural-language command interpretation, advanced voice-to-action handling, validated competitive decks, tournament legality checks, effect resolution, combat rules engine, secure remote access from an external agent, full official card data bundled offline, hidden-information-safe agent contexts, and full synchronization of catalog/decks. 
- **Not verified:** end-to-end play through a browser, live card-API connectivity, exhaustive correctness against October 2026 official Riftbound rules.
- Some actions are **record-keeping shortcuts only**: draw/channel do not enforce rune/payment/turn timing rules.
- The prototype has two battlefield display areas; it is not an exhaustive representation of all competitive variants or setup options.

Official rules and ban/errata updates: [Riftbound Rules Hub](https://playriftbound.com/fr-fr/rules-hub/). Check the newest version before any physical competition. For authorized apps, see [Riot's Developer Portal](https://developer.riotgames.com/docs/riftbound).

## Developer notes

The browser and Node server import **core.mjs** as the single state reducer; all mutations go through \`applyCommand\`. The server listens only on loopback and requires a random token. Never store private token in front-end source, GitHub or screenshots. Never put a token in the query string (except the intentionally short-lived SSE one-use ticket).

Riot Games, League of Legends and Riftbound are trademarks of Riot Games. No affiliation or endorsement is claimed.
