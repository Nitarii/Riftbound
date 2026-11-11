# Riftbound Table Companion

**Compagnon visuel fan et non commercial pour jouer avec des cartes Riftbound physiques contre un agent IA.** Il permet de suivre une table, annoncer les tours et conserver un journal. Il ne remplace pas le jeu, ne propose pas de multijoueur en ligne et n'est pas affilié à Riot Games.

## Nouvelle connexion avec autorisation du navigateur (Windows v0.5)

Lorsque l'application Windows est lancée depuis la page GitHub Pages déjà ouverte, elle **ne crée plus de nouvel onglet**. À l'étape **Connexion**, clique sur **Autoriser la connexion locale** : Chrome/Edge peut afficher sa propre demande d'autorisation « Accès au réseau local / Accès au bouclage ». Accepte pour ce site si tu souhaites utiliser le module local. Ce flux fait appel au mécanisme de permission du navigateur, sans simuler une fausse boîte de dialogue. Si l'autorisation est refusée ou bloquée, la page montre où la rétablir dans les paramètres du site. Le mode aperçu sans serveur reste possible.

Le serveur reste accessible **uniquement sur 127.0.0.1** et le jeton d'accès est transmis après autorisation par la connexion locale. Les versions récentes de Chrome nécessitent un **clic utilisateur** pour demander cette autorisation : le site ne déclenche donc plus de requêtes locales répétées avant accord. Pour afficher explicitement une page locale séparée, un utilisateur avancé peut lancer l'exécutable avec le paramètre `--open-browser`.

Le nom du téléchargement passe à **RiftboundCompanion-v0.7.exe** pour éviter de réutiliser l'ancienne icône Windows mise en cache. Le programme porte un nouveau logo violet et doré avec un monogramme R ; la compilation teste désormais l'icône réellement extraite de l'exécutable (et pas seulement le favicon du site). Les icônes affichées dans le panneau de téléchargements de certains navigateurs peuvent toutefois rester génériques, indépendamment de l'icône de Windows Explorer.

## Permettre à un agent IA distant de jouer (optionnel)

Un agent distant ne peut pas ouvrir `127.0.0.1` : cette adresse représente son propre environnement, pas ton ordinateur. L'interface comporte désormais une **passerelle facultative avec jeton de session distinct**, démarrée uniquement sur demande.

1. Lance `RiftboundCompanion.exe` et connecte le site au module comme d'habitude.
2. Dans **Étape 4 — Agent IA**, télécharge le fichier officiel de Cloudflare [cloudflared-windows-amd64.exe](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe) et place-le **dans le même dossier** que l'exécutable Riftbound Companion. Aucun besoin de l'ouvrir ni de le configurer séparément.
3. Clique **Activer l'accès IA distant** et valide la demande. Le module lance un Quick Tunnel HTTPS temporaire vers **une passerelle dédiée**, et **non vers l'administration du serveur local**. Le module n'active jamais le tunnel automatiquement.
4. Clique **Copier le prompt IA**. Le prompt comprend l'adresse HTTPS temporaire, le lien d'une **console agent utilisable par un navigateur** (`/agent/#access=...`) et un **jeton de jeu à privilèges limités**, différent du secret local. Ne colle ces informations que dans une conversation privée avec un agent de confiance. L'identifiant du lien est placé dans un fragment URL, non transmis au serveur lors du chargement de la page.
5. Après la partie, clique **Couper l'accès distant**, ou laisse la session se fermer automatiquement après **4 heures maximum**. Tu peux lancer une nouvelle session au besoin.

La passerelle distante autorise **GET /api/guide**, **GET /api/state**, **GET /api/decks**, **GET /api/catalog** et **POST /api/command**. Elle **n'expose pas** les endpoints de connexion locale, d'administration du tunnel ou la réinitialisation de la partie. Chaque requête exige son propre jeton temporaire. Les modifications de cartes sont diffusées dans le plateau local.

**Limites :** cela ne donne pas des outils réseau à un chat qui n'en possède pas. Pour fonctionner directement, l'agent doit soit savoir émettre des requêtes HTTP avec l'en-tête `Authorization`, soit disposer d'un **navigateur agent capable d'ouvrir la console web, de lire l'état et de cliquer sur ses commandes**. Un chat texte ordinaire peut encore être incapable de contrôler le plateau malgré l'URL. La variante de secours reste l'échange d'états et de commandes JSON manuelles. Les Quick Tunnels sont destinés aux tests, fournissent un nom de domaine variable, n'offrent pas de garantie de disponibilité et ne prennent pas en charge SSE : l'interface locale conserve la synchronisation via sa connexion privée. Voir la [documentation Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

**Sécurité :** l'URL du tunnel est techniquement publique, même si un jeton est nécessaire pour les actions. Tu autorises volontairement un agent extérieur à lire le plateau et à y jouer. Révoque l'accès dès que tu as terminé. Ne partage jamais le jeton local principal. Le programme tiers `cloudflared-windows-amd64.exe` doit provenir des téléchargements officiels de Cloudflare.

## Pour jouer : 1 fichier Windows

**Site d'accueil :** https://nitarii.github.io/Riftbound/

**Téléchargement direct de l'exécutable Windows 64 bits :**
https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.7.exe

1. Télécharger **RiftboundCompanion.exe**.
2. Double-cliquer sur le fichier. Aucune installation de Node.js, de Python ou d'autre dépendance requise.
3. L'application lance son serveur sur **127.0.0.1**, sans ouvrir un autre onglet. Reviens sur la page GitHub Pages, puis clique sur **Autoriser la connexion locale** à l'étape 2. Le navigateur peut afficher son autorisation native.
4. Une fois l'autorisation accordée et la connexion établie, l'accueil reconnaît ton module. Choisir légende, champion, champ de bataille et deck préconstruit adverse. Démarrer la partie et copier le prompt IA.
5. Garder la fenêtre du programme ouverte pendant la partie. La fermer arrête le serveur.

**Windows 10/11 x64 uniquement pour cet exécutable.** Il est **non signé numériquement** : Windows Defender SmartScreen ou d'autres protections peuvent afficher un avertissement. Ne pas contourner une alerte de sécurité sans vérifier sa provenance; contrôler le dépôt, les tests et la somme SHA-256 disponible dans la même publication GitHub. La taille du fichier comprend le runtime Node.js embarqué. Les images de cartes nécessitent encore une connexion Internet.

Un deuxième mode **« Essayer sans installer »** permet un aperçu du plateau sur GitHub Pages, sans connexion possible à un agent distant.

### Pourquoi le site et l'exécutable sont séparés ?

GitHub Pages peut afficher le plateau, mais **ne peut pas exécuter le serveur local ni donner automatiquement des outils réseau à une IA**. L'exécutable contient tout le plateau et son serveur dans un seul fichier, avec les mêmes fonctionnalités. La page GitHub Pages peut se connecter au programme local après l'autorisation du navigateur; tu n'as normalement ni adresse ni jeton à saisir. Pour utiliser un **agent IA extérieur**, il faut encore lui donner un accès HTTP explicitement autorisé au serveur (un tunnel HTTPS facultatif, avec protection par jeton), et l'agent doit posséder des outils de navigation ou d'appel HTTP. Un simple chat avec un lien ne suffit pas.

## Correction du sélecteur de personnages (11 novembre 2026)

Le champ de Légende comprend désormais les **noms de champions**, même quand les cartes sont indexées sous leur seul titre. Par exemple, taper **Shen** retrouve « Shen, Eye of Twilight » ; taper **Lillia** retrouve « Lillia, Bashful Bloom ». Après sélection, les champions compatibles apparaissent automatiquement (par ex. « Lillia, Fae Fawn » et « Lillia, Protector of Dreams »), en utilisant le tag de champion et les domaines présents dans les données Riot. Les cartes incompatibles ne sont pas proposées comme Champions choisis.

Les miniatures des cartes déjà choisies sont désormais forcées à **46 × 64 px** pour ne plus déformer le formulaire. Le cache local du catalogue a changé de version afin de recharger les informations de type « Champion » et les tags de personnage manquants dans l'ancien import. Le CSS et le script portent également un numéro de version, pour éviter un affichage périmé.

## Sélection de cartes et decks disponibles

La création de partie n'utilise **plus de listes HTML interminables**. Les trois champs (Légende, Champion choisi, Champ de bataille) sont des **recherches compactes avec aperçu des cartes** et sept résultats affichés au maximum. Les accents sont ignorés pour la recherche; flèches et Entrée fonctionnent au clavier. Quand une légende est choisie, le champ Champion propose uniquement les unités portant le nom du champion de cette légende. Un clic confirme visuellement la carte retenue. Les exemples en gris sont sélectionnés aléatoirement parmi les cartes du catalogue lors du chargement : ils ne préremplissent pas la sélection.

**Neuf decks préconstruits sont disponibles pour l'adversaire IA** : Origins (Jinx, Viktor, Lee Sin), Spiritforged (Fiora, Rumble), Unleashed (Vi, Vex) et Vendetta (Shen, Zed). Le choix « Aléatoire » tire parmi les neuf. Ils comportent une légende, 40 cartes principales (champion choisi compris), 12 runes et trois champs de bataille. Les listes proviennent des produits préconstruits publiés et des relevés communautaires de leurs contenus, et sont revérifiées dans les tests de compilation; **ce ne sont pas des decklists de tournoi validées pour 2026**. Le deck Jinx Origins contient notamment des cartes interdites en compétition dans certains formats; cette réserve apparaît lorsqu'il est sélectionné.

Les visuels restent hébergés à distance. Une carte absente ou un ancien catalogue peuvent empêcher de préparer un deck : utiliser un catalogue à jour ou importer un JSON depuis l'onglet Catalogue.

### Fonctionnalités présentes

- Assistant d'accueil **étape par étape**, cases gamifiées, barre de progression, retour/suivant et validation de chaque étape.
- Plateau visuel, marqueurs, scores, cartes jouées, journal, sauvegardes JSON.
- Légende, champion et battlefield du joueur physique; main privée.
- Bibliothèque de cartes issue de sources communautaires qui indexent la galerie Riot, avec images externes Riot et liens de secours Piltover Archive.
- Neuf decks préconstruits imprimés répartis sur Origins, Spiritforged, Unleashed et Vendetta.
- Dictée et reconnaissance limitée de quelques commandes en français; API locale pour agents compatibles HTTP.

**Limites importantes :** il ne s'agit pas encore d'un agent autonome capable de jouer toutes les cartes légalement, d'interpréter tous les effets, ni d'un arbitre conforme à toutes les règles compétitives et errata. Les joueurs doivent vérifier les effets et le déroulement. Les listes préconstruites imprimées ne garantissent pas une légalité en tournoi à la date du jeu.

## Pour développer et reconstruire

Le code source est public et peut être exécuté avec Node.js (uniquement requis pour les développeurs).

- Serveur depuis les sources : `node server.mjs`
- Tests : `node --test tests/*.test.mjs`
- Build Windows natif : workflow [Build Windows Companion](https://github.com/Nitarii/Riftbound/actions/workflows/windows-companion.yml). Sur un runner Windows, il installe temporairement Node.js 26, regroupe le serveur avec esbuild puis produit directement un exécutable autonome avec la fonction officielle **Node Single Executable Applications (SEA)**. L'exécutable incorpore les fichiers web; il n'installe aucun paquet sur le PC du joueur.
- Le workflow démarre **l'exécutable Windows lui-même** et vérifie le rendu HTML, le script du plateau, une requête authentifiée et une modification de partie avant de publier le fichier dans [Releases](https://github.com/Nitarii/Riftbound/releases/tag/companion-latest).
- Les données utilisateur sont stockées en mode exécutable dans `%LOCALAPPDATA%\RiftboundTableCompanion` ; elles ne sont pas placées dans le répertoire de téléchargement.

## Sécurité et droits

Le serveur écoute seulement sur **127.0.0.1**. Les actions API exigent un secret aléatoire; un agent externe doit être explicitement autorisé. Un éventuel tunnel crée un accès depuis Internet et n'est **pas activé automatiquement**. Ne jamais publier le jeton dans un dépôt, dans un lien public ou dans un prompt partagé.

Riftbound, League of Legends, noms, cartes et illustrations sont la propriété de Riot Games. **Ce projet fan n'est pas approuvé ni sponsorisé par Riot.** L'absence de but commercial ne remplace pas les autorisations et restrictions sur les actifs, les outils numériques ou les reproductions du jeu. Vérifier les règles [Riftbound Digital Tools Policy](https://developer.riotgames.com/docs/riftbound) avant diffusion plus large et retirer les usages qui ne seraient pas autorisés. Les visuels sont chargés à distance; ils ne sont pas réhébergés dans le dépôt.
