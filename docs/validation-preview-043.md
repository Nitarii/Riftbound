# Validation de l’aperçu 0.43

Le dépôt conserve l’interface, le relais local, le gestionnaire Windows et le moteur existants. Le point de départ était le commit `eba3b73` (0.42). Le rapport et les cas privés Shen–Zed ont servi à reconstruire des tests ; ils ne sont pas inclus dans la branche.

## Changements

- Le moteur de plateau est commun à l’application et aux simulations. Le mélange de l’état initial peut être reproduit avec une graine. L’annulation locale restaure cartes, coûts, scores, compteurs et fenêtres de priorité d’une même transaction. L’historique indique la commande annulée ; une révélation physique reste connue. Les reçus de l’API distinguent action appliquée, requête répétée et rejet. La sauvegarde précède la diffusion du nouveau plateau.
- « Reviens au moment où tu m’attaques » restaure la première focalisation du joueur pendant le dernier combat du tour, y compris après un redémarrage. Le scénario Shen–Zed restaure le 6–6, les trois runes prêtes et le Disciple seul au Grove face aux deux attaquants. Le Burn déjà révélé reste dans la défausse. En mode distant, l’agent reçoit l’annonce avec la révision restaurée. Le joueur déclenche lui-même le retour depuis sa discussion.
- Le dernier point, les passes de focalisation, la pioche de départ et Burn sont distingués. Le plateau public retire les cartes cachées, l’ordre des decks et la graine. L’agent distant, lorsqu’il est activé, voit sa propre main mais pas l’ordre du deck.
- Les quatre sorts explicitement codés ont une cible, un coût et un ordre de résolution contrôlés par le moteur. Resonating Strike conserve l’identifiant, les compteurs et l’épuisement. Les cas ajoutés incluent Hand Hammer attaché, Shadow Assassin, Sacred Protector, Mournful Witness, certains effets de maintien, Shadow Clone et des effets de Burn.
- Le planificateur simule des groupes d’attaque, évalue les pertes et cherche à empêcher le maintien qui ferait gagner l’adversaire. Qwen 9B peut départager des attaques proches déjà légales. Il reçoit une liste bornée et répond par un index, jamais par une mutation. Une réponse invalide, absente ou tardive laisse le moteur choisir. Le délai par choix tactique est configurable avec `RIFTBOUND_TACTICAL_MS` (0 désactive Qwen pour ce choix).
- Aucune modification des poids Qwen ou Whisper. Pas de fine-tuning : les cas annotés actuels sont mieux adaptés à l’évaluation qu’à un entraînement, et la couverture doit s’étendre avant de générer des exemples d’apprentissage.

## Résultats mesurés

| Parcours | Résultat |
| --- | --- |
| 300 duels à cartes synthétiques, opposition passive, occupation ou pression | 300 terminés, 0 blocage/commande invalide ; 270 victoires IA (70/100 contre la politique de pression) |
| 120 duels des listes Shen et Zed de Vendetta, avec le catalogue de référence | 120 terminés, 0 blocage/commande invalide, 108 victoires IA (29/40 contre la politique de pression) et 18 résolutions de sorts |
| Choix de stratégie par le moteur seul | moyenne d’environ 1 à 2,5 ms par décision selon le parcours, sur la machine d’essai |
| Qwen3.5 9B sur RX 7900 XT, Vulkan | démarrage env. 2,9 s ; décision JSON d’essai env. 2,2 s |
| Qwen3 4B en mode CPU, quatre threads, sur Ryzen 7 7800X3D | démarrage env. 2,1 s ; décision JSON d’essai env. 1,1 s |
| Whisper Small + Piper SIWIS en local | Piper a produit le WAV en env. 3,0 s ; Whisper a transcrit en env. 3,2 s depuis un démarrage à froid |
| Windows et interface | Binaire autonome vérifié, mise à jour et restauration testées, désinstallation limitée aux fichiers gérés, disposition vérifiée de 390 × 844 à 1 792 × 900 |
| Agent distant | Tunnel HTTPS réel testé depuis l’exécutable Windows sur une partie synthétique. Prise de relais après le mode local, annonces traitées avec leur révision, commandes et reçus, main propre de l’agent, carte physique cachée, réponse et fermeture du tunnel |

L’audio était une phrase **synthétique**, pas un enregistrement au microphone. La transcription `Je joue Disciple of Shen pour De Rune.` est maintenant incluse dans un test jusqu’à la commande de jeu. Les chiffres Qwen mesurent une requête courte d’essai, sans extrapolation aux autres PC ni aux conversations longues.

Les adversaires des simulations sont des politiques reproductibles, pas des joueurs humains. La simulation de Vendetta révèle ses choix physiques pour les effets qu’elle sait traiter ; elle ne force pas les cartes que le moteur signalerait comme non résolues. L’audit du catalogue a chargé 1 407 entrées : 1 275 avec texte non pris en charge au moins en partie, et 93 avec texte sans alerte du parseur. Une absence d’alerte n’est pas une preuve de fidélité.

## Reproduire

    node --test
    node scripts/simulate-duels.mjs 100
    node scripts/simulate-duels.mjs 40 "chemin-vers-cards.json"
    node scripts/audit-card-effects.mjs --file "chemin-vers-cards.json"

Sous Windows, avec les installations déjà présentes, le script `scripts/check-local-models.mjs` prend le chemin du client et facultativement un WAV mono PCM. Ajouter `--cpu` pour tester Qwen 4B sans GPU. Il écrit uniquement sous `dist/model-smoke`. Le script `scripts/check-preview-http.mjs` vérifie l’exécutable Windows dans un dossier d’essai, avec un adversaire sans Qwen, l’annulation, la reprise de l’attaque après redémarrage, les doublons, la concurrence et la confidentialité. Le script `scripts/check-remote-preview.mjs` vérifie le même exécutable par un tunnel HTTPS temporaire, avec une table synthétique.

## Ce qu’il reste à valider

- Faire une partie complète avec le vrai deck physique et plusieurs échantillons micro, dont un accent français naturel, un environnement bruyant et des interruptions. Aucun test de cette nature n’a encore été réalisé.
- Étendre la chaîne aux capacités et aux autres cartes. L’aperçu traite depuis la zone cachée Disciple of Shen et Resonating Strike. Flux est disponible pour Lacerate, Dragon Form, Perfect Execution et Twilight Shroud. Les autres cartes à jouer depuis ces zones, certaines activations, le choix des effets multiples et plusieurs interactions de terrain demandent encore un arbitrage.
- Mesurer le comportement sur d’autres machines : le mode CPU a été essayé sur le même PC, pas sur un second appareil ni un processeur de génération plus ancienne. Vérifier aussi le rythme de la synthèse sur les PC modestes.
- La reprise après redémarrage conserve le plateau et le point de retour au combat du tour courant. La pile d’annulation transaction par transaction et les suites vocales en attente restent en mémoire pendant la session. Les joueurs doivent replacer les cartes physiques après un retour et tenir compte des révélations déjà vues.
- Le test de désinstallation a supprimé les fichiers de l’installation et conservé les fichiers tiers. L’assistant temporaire Windows peut rester dans le dossier Temp ; ce mécanisme existant n’a pas été corrigé dans l’aperçu.

Références : [règles françaises RUP5 du 9 octobre 2026](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/5c7946f7c3b8c6e0faff85ab6dadc6d2e721ea94.pdf), [listes officielles de Vendetta](https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/), [errata officiel de Resonating Strike](https://playriftbound.com/en-us/news/announcements/vendetta-errata-updates/).
