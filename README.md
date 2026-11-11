# Riftbound Table Companion

**Compagnon visuel fan et non commercial pour jouer avec des cartes Riftbound physiques contre un agent IA.** Il permet de suivre une table, annoncer les tours et conserver un journal. Il ne remplace pas le jeu, ne propose pas de multijoueur en ligne et n'est pas affilié à Riot Games.

## Pour jouer : 1 fichier Windows

**Site d'accueil :** https://nitarii.github.io/Riftbound/

**Téléchargement direct de l'exécutable Windows 64 bits :**
https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion.exe

1. Télécharger **RiftboundCompanion.exe**.
2. Double-cliquer sur le fichier. Aucune installation de Node.js, de Python ou d'autre dépendance requise.
3. L'application lance le serveur **uniquement sur 127.0.0.1**, ouvre automatiquement son interface dans le navigateur par défaut et l'authentifie par une session locale. Le secret est transmis dans le fragment d'URL, effacé immédiatement, puis conservé uniquement pour l'onglet du navigateur.
4. Sur l'accueil, la connexion et l'installation sont reconnues automatiquement. Choisir légende, champion, champ de bataille et deck préconstruit adverse. Démarrer la partie et copier le prompt IA.
5. Garder la fenêtre du programme ouverte pendant la partie. La fermer arrête le serveur.

**Windows 10/11 x64 uniquement pour cet exécutable.** Il est **non signé numériquement** : Windows Defender SmartScreen ou d'autres protections peuvent afficher un avertissement. Ne pas contourner une alerte de sécurité sans vérifier sa provenance; contrôler le dépôt, les tests et la somme SHA-256 disponible dans la même publication GitHub. La taille du fichier comprend le runtime Node.js embarqué. Les images de cartes nécessitent encore une connexion Internet.

Un deuxième mode **« Essayer sans installer »** permet un aperçu du plateau sur GitHub Pages, sans connexion possible à un agent distant.

### Pourquoi le site et l'exécutable sont séparés ?

GitHub Pages peut afficher le plateau, mais **ne peut pas exécuter le serveur local ni donner automatiquement des outils réseau à une IA**. L'exécutable contient tout le plateau et son serveur dans un seul fichier, avec les mêmes fonctionnalités. Il ouvre donc une URL locale; tu n'as normalement ni adresse ni jeton à saisir. Pour utiliser un **agent IA extérieur**, il faut encore lui donner un accès HTTP explicitement autorisé au serveur (un tunnel HTTPS facultatif, avec protection par jeton), et l'agent doit posséder des outils de navigation ou d'appel HTTP. Un simple chat avec un lien ne suffit pas.

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
