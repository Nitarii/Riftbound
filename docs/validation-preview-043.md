# Validation de l’aperçu 0.43

Le dépôt conserve l’interface, le relais local, le gestionnaire Windows et le moteur existants. Le point de départ était le commit `eba3b73` (0.42). Le rapport et les cas privés Shen–Zed ont servi à reconstruire des tests ; ils ne sont pas inclus dans la branche.

## Changements

- Le moteur de plateau est commun à l’application et aux simulations. Le mélange de l’état initial peut être reproduit avec une graine. L’annulation locale restaure cartes, coûts, scores, compteurs et fenêtres de priorité d’une même transaction. L’historique indique la commande annulée ; une révélation physique reste connue. Les reçus de l’API distinguent action appliquée, requête répétée et rejet. La sauvegarde précède la diffusion du nouveau plateau.
- « Reviens au moment où tu m’attaques » restaure la première focalisation du joueur pendant le dernier combat du tour, y compris après un redémarrage. Le scénario Shen–Zed restaure le 6–6, les trois runes prêtes et le Disciple seul au Grove face aux deux attaquants. Le Burn déjà révélé reste dans la défausse. En mode distant, l’agent reçoit l’annonce avec la révision restaurée. Le joueur déclenche lui-même le retour depuis sa discussion.
- Le dernier point, les passes de focalisation, la pioche de départ et Burn sont distingués. Le plateau public retire les cartes cachées, l’ordre des decks et la graine. L’agent distant, lorsqu’il est activé, voit sa propre main mais pas l’ordre du deck.
- Les quatre sorts explicitement codés ont une cible, un coût et un ordre de résolution contrôlés par le moteur. Resonating Strike conserve l’identifiant, les compteurs et l’épuisement. Les cas ajoutés incluent Hand Hammer attaché, Shadow Assassin, Sacred Protector, Mournful Witness, certains effets de maintien, Shadow Clone et des effets de Burn.
- Le planificateur simule des groupes d’attaque, évalue les pertes et cherche à empêcher le maintien qui ferait gagner l’adversaire. Qwen 9B peut départager des attaques proches déjà légales. Il reçoit une liste bornée et répond par un index, jamais par une mutation. Une réponse invalide, absente ou tardive laisse le moteur choisir. Le délai par choix tactique est configurable avec `RIFTBOUND_TACTICAL_MS` (0 désactive Qwen pour ce choix).
- Le deuxième rapport de partie a fourni des cas Shen–Jinx indépendants. « Je passe… non, je réagis » annule le premier passage dans la même annonce finale. La dernière quantité d’une canalisation corrigée sert à identifier les runes déjà présentes. Les envois répétés avec le même identifiant retrouvent le message d’origine après redémarrage. La correction de destination du cas Shen–Zed déplace le Shen déjà présent et conserve son identité.
- Get Excited! reste en chaîne et défausse à la résolution. Discipline peut se résoudre au-dessus, avec une nouvelle fenêtre de priorité entre les deux résolutions. Fight or Flight ramène la même unité en base avec ses dégâts et attachements. Le cas Field Musicians joue l’unité en base quand l’annonce omet sa destination, place son effet ciblé sur la chaîne, puis lance l’attaque annoncée après la résolution. Le bonus expire en fin de tour.
- Qwen reçoit les forces provisoires de la confrontation et les dégâts du dernier combat calculés par le moteur. L’historique garde les affectations au moment de la résolution et signale explicitement un combat sans étape de dégâts. Le serveur confirme une action conversationnelle d’après le résultat enregistré.
- Aucune modification des poids Qwen ou Whisper. Pas de fine-tuning : les cas annotés actuels sont mieux adaptés à l’évaluation qu’à un entraînement, et la couverture doit s’étendre avant de générer des exemples d’apprentissage.

## Résultats mesurés

| Parcours | Résultat |
| --- | --- |
| 300 duels à cartes synthétiques, opposition passive, occupation ou pression | 300 terminés, 0 blocage/commande invalide ; 270 victoires IA (70/100 contre la politique de pression) |
| 120 duels des listes Shen et Zed de Vendetta, avec le catalogue de référence | 120 terminés, 0 blocage/commande invalide, 108 victoires IA (29/40 contre la politique de pression) et 18 résolutions de sorts |
| 120 duels Shen contre le préconstruit Jinx Origins imprimé | 75 terminés, 45 arrêtés sur le choix de runes différé de Targon's Peak, aucune commande invalide |
| Choix de stratégie par le moteur seul | moyenne d’environ 1 à 2,5 ms par décision selon le parcours, sur la machine d’essai |
| Qwen3.5 9B sur RX 7900 XT, Vulkan | démarrage env. 2,9 s ; décision JSON d’essai env. 2,2 s |
| Qwen3.5 9B Vulkan, questions issues du nouveau rapport | Deux réponses 9 contre 1 vérifiées, avant réactions et après résolution, en env. 1,7 s et 1,6 s. Aucune mutation du plateau |
| Qwen3 4B en mode CPU, quatre threads, sur Ryzen 7 7800X3D | démarrage env. 2,1 s ; décision JSON d’essai env. 1,1 s |
| Whisper Small + Piper SIWIS en local | Piper a produit le WAV en env. 3,0 s ; Whisper a transcrit en env. 3,2 s depuis un démarrage à froid |
| Windows et interface | Binaire autonome vérifié, mise à jour et restauration testées, désinstallation limitée aux fichiers gérés, disposition vérifiée de 390 × 844 à 1 792 × 900 |
| Agent distant | Tunnel HTTPS réel testé depuis l’exécutable Windows sur une partie synthétique. Prise de relais après le mode local, annonces traitées avec leur révision, commandes et reçus, main propre de l’agent, carte physique cachée, réponse et fermeture du tunnel |

L’audio était une phrase **synthétique**, pas un enregistrement au microphone. La transcription `Je joue Disciple of Shen pour De Rune.` est maintenant incluse dans un test jusqu’à la commande de jeu. Les chiffres Qwen mesurent une requête courte d’essai, sans extrapolation aux autres PC ni aux conversations longues.

Les simulations utilisent des politiques reproductibles et révèlent leurs choix physiques pour les effets pris en charge. La liste Jinx Origins imprimée sert à reproduire une partie amicale et contient Fight or Flight, interdite en Construit homologué. L’audit du catalogue a chargé 1 407 entrées. 1 269 ont du texte signalé et 99 ont du texte sans alerte du parseur. Une absence d’alerte doit encore être vérifiée en jeu. [Liste de tournoi Riot](https://playriftbound.com/en-us/rules-hub/)

L’illustration officielle de Hand Hammer montre le +1 d’équipement et le +2 conditionnel accordé au porteur s’il est sur un champ avec exactement une autre unité alliée. Le test Shen–Zed vérifie ainsi le passage de Mournful Witness de 5 à 7 de Force. [Carte Hand Hammer](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/524fedb9116db0eb62380c03e0853c342c53daeb-744x1039.png)

## Reproduire

    node --test
    node scripts/simulate-duels.mjs 100
    node scripts/simulate-duels.mjs 40 "chemin-vers-cards.json"
    node scripts/simulate-duels.mjs 40 "chemin-vers-cards.json" jinx
    node scripts/audit-card-effects.mjs --file "chemin-vers-cards.json"

Sous Windows, avec les installations déjà présentes, le script `scripts/check-local-models.mjs` prend le chemin du client et facultativement un WAV mono PCM. Ajouter `--cpu` pour tester Qwen 4B sans GPU. Il écrit uniquement sous `dist/model-smoke`. Le script `scripts/check-preview-http.mjs` vérifie l’exécutable Windows dans un dossier d’essai, avec un adversaire sans Qwen, l’annulation, la reprise de l’attaque après redémarrage, les doublons, la concurrence et la confidentialité. Le script `scripts/check-remote-preview.mjs` vérifie le même exécutable par un tunnel HTTPS temporaire, avec une table synthétique.

## Ce qu’il reste à valider

- Faire une partie complète avec le vrai deck physique et plusieurs échantillons micro, dont un accent français naturel, un environnement bruyant et des interruptions. Les corrections de ce test s’exercent dans une même transcription finale. Une correction qui arrive après un premier envoi déjà exécuté passe par l’annulation locale.
- Rejouer la chronologie Shen–Jinx intégrale. Plusieurs sessions simulées nécessitent encore le traitement de Targon's Peak. L’activation de la légende Shen et la révélation de Pakaa Protector demandent également une validation dédiée.
- Étendre la chaîne aux capacités et aux autres cartes. L’aperçu traite depuis la zone cachée Disciple of Shen et Resonating Strike. Flux est disponible pour Lacerate, Dragon Form, Perfect Execution et Twilight Shroud. Les autres cartes à jouer depuis ces zones, certaines activations, le choix des effets multiples et plusieurs interactions de terrain demandent encore un arbitrage.
- Mesurer le comportement sur d’autres machines : le mode CPU a été essayé sur le même PC, pas sur un second appareil ni un processeur de génération plus ancienne. Vérifier aussi le rythme de la synthèse sur les PC modestes.
- La reprise après redémarrage conserve le plateau et le point de retour au combat du tour courant. La pile d’annulation transaction par transaction et les suites vocales en attente restent en mémoire pendant la session. Les joueurs doivent replacer les cartes physiques après un retour et tenir compte des révélations déjà vues.
- Le test de désinstallation a supprimé les fichiers de l’installation et conservé les fichiers tiers. L’assistant temporaire Windows peut rester dans le dossier Temp ; ce mécanisme existant n’a pas été corrigé dans l’aperçu.

Références : [règles françaises RUP5 du 9 octobre 2026](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/5c7946f7c3b8c6e0faff85ab6dadc6d2e721ea94.pdf), [listes officielles de Vendetta](https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/), [errata officiel de Resonating Strike](https://playriftbound.com/en-us/news/announcements/vendetta-errata-updates/).
