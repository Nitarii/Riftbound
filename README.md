# Riftbound Table Companion (prototype v0.1)

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
- **Not implemented:** an autonomous strategic agent, reliable natural-language command interpretation, real voice transcription, validated competitive decks, tournament legality checks, effect resolution, combat rules engine, secure remote access from an external agent, full official card data bundled offline, hidden-information-safe agent contexts, and full synchronization of catalog/decks. 
- **Not verified:** end-to-end play through a browser, live card-API connectivity, exhaustive correctness against October 2026 official Riftbound rules.
- Some actions are **record-keeping shortcuts only**: draw/channel do not enforce rune/payment/turn timing rules.
- The prototype has two battlefield display areas; it is not an exhaustive representation of all competitive variants or setup options.

Official rules and ban/errata updates: [Riftbound Rules Hub](https://playriftbound.com/fr-fr/rules-hub/). Check the newest version before any physical competition. For authorized apps, see [Riot's Developer Portal](https://developer.riotgames.com/docs/riftbound).

## Developer notes

The browser and Node server import **core.mjs** as the single state reducer; all mutations go through \`applyCommand\`. The server listens only on loopback and requires a random token. Never store private token in front-end source, GitHub or screenshots. Never put a token in the query string (except the intentionally short-lived SSE one-use ticket).

Riot Games, League of Legends and Riftbound are trademarks of Riot Games. No affiliation or endorsement is claimed.
