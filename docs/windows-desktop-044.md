# Aperçu Windows 0.44

Le programme C# WinForms héberge le plateau dans WebView2. Il lance le moteur existant sur une adresse de bouclage et utilise un jeton aléatoire par session. Le processus du moteur et ses descendants rejoignent un Job Object Windows dès le démarrage. Un joueur peut utiliser le plateau sans télécharger de modèle. Whisper et Qwen s’installent séparément depuis le gestionnaire. Le profil principal pour la conversation est Qwen3.5 9B sur une machine dotée d’au moins 16 Go de RAM et d’un GPU reconnu avec au moins 8 Go de VRAM. Le gestionnaire recommande Qwen3 4B sur les autres machines. L’installation sélectionne le modèle choisi. Le chargement en mémoire attend une requête de conversation.

La fenêtre Windows reprend le moteur de [l’aperçu 0.43](validation-preview-043.md), dont les réactions, la reprise des transactions et les renforts basés sur le plateau public. Une fois Qwen 9B en mémoire, il peut départager des assauts proches et déjà validés pendant une fenêtre bornée à trois secondes par défaut. Le premier tour peut se jouer avec le moteur seul.

Depuis l’accueil, le panneau **Connecter un agent externe** démarre à la demande un tunnel HTTPS temporaire. Le moteur de jeu est partagé avec la fenêtre Windows. L’agent reçoit sa main et l’état public de la partie avec un jeton propre à la session. Le gestionnaire et le jeton local restent réservés au joueur. Couper l’accès rend la partie à l’adversaire local.

Depuis l’aperçu 0.44.1, le plateau et le gestionnaire démarrent maximisés. Le bouton **Mise à jour disponible** apparaît à côté du gestionnaire lorsqu’une version native stable plus récente est détectée. Le client embarque le catalogue de 1 407 entrées. Les visuels des cartes sont chargés depuis les sources référencées dans le catalogue lorsque la connexion est disponible. Le sélecteur de micro et la demande d’accès de Riftbound Companion sont dans la discussion. Le gestionnaire installe la voix française Piper SIWIS et son moteur x64. Après le téléchargement initial, la synthèse fonctionne sur le processeur sans connexion ni installation de Python.

L’installateur Windows x64 est généré dans `dist`. Il permet de choisir le dossier du programme. Le profil par défaut se trouve dans `%LOCALAPPDATA%\Nitarii\Riftbound Companion`. La désinstallation retire les modules et demande une confirmation avant de retirer les parties et réglages personnels. Les installations portables antérieures conservent leur propre profil. Il n’y a pas de migration automatique depuis ce format.

La première installation peut nécessiter Internet pour obtenir WebView2 sur un PC qui ne l’a pas encore. Un accès réseau est également nécessaire pour télécharger un module ou vérifier une mise à jour. Le catalogue embarqué est l’instantané [Wysme au commit c9cbe8a](https://huggingface.co/datasets/Wysme/riftbound-cards/tree/c9cbe8af31527ad87c613c33c2942726b4c217e0). Le plateau affiche des cartes textuelles basées sur leurs données pour rester utilisable hors ligne.

## Compiler et vérifier

Préparer Node.js 26, le SDK .NET 10 et Inno Setup 7, puis lancer depuis la racine du dépôt.

```powershell
./scripts/build-desktop.ps1 -Iscc 'C:\Program Files (x86)\Inno Setup 7\ISCC.exe'
node --test tests/*.test.mjs
npm install --no-save --no-package-lock --no-audit --no-fund playwright-core@1.58.2
./scripts/windows-installer-smoke.ps1 -Installer dist/RiftboundCompanion-0.44.2-x64-Setup.exe
node scripts/build-pages.mjs --preview
```

Le test d’installation requiert un profil Windows sans installation native existante. Pour tester les modèles locaux, `RIFTBOUND_SMOKE_MODELS_ROOT` peut indiquer un dossier contenant les binaires et poids Whisper Small et Qwen vérifiés. `RIFTBOUND_SMOKE_WAV` indique un WAV PCM16 mono à 16 kHz contenant la commande « Je joue Disciple of Shen pour deux runes ». Avec `RIFTBOUND_SMOKE_QWEN=9b`, le test attend que le PC recommande Qwen3.5 9B et vérifie l’inférence Vulkan. Les poids sont liés aux données d’essai et ne sont pas redéployés. `RIFTBOUND_SMOKE_REMOTE=1` ajoute la connexion HTTPS réelle et vérifie le retour au mode local.

Le workflow Windows produit un installateur et son SHA-256. Une balise `desktop-vX.Y.Z` sur GitHub déclenche la publication si la compilation et le test d’installation réussissent. En mode de publication **GitHub Actions**, le workflow Pages déploie uniquement `dist/pages` et sélectionne la dernière version stable dotée d’un installateur.

## Couverture

Chasse ajoute l’XP après les réactions de conquête ou de maintien. Les valeurs de plusieurs occurrences s’additionnent. Wuju Apprentice déclenche sa pioche à partir de 6 XP au moment où il est joué. Combat Experience vérifie l’XP à sa résolution et donne alors +1 ou +3 Might pour le tour. Le planificateur utilise le même bonus lorsqu’il évalue une réaction de combat. [Règles Unleashed, Chasse et Niveau](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-core-rules-unleashed-patch-notes/)

Mosstomper gagne continuellement +1 Might et Protection à partir de 3 XP de son contrôleur. La puissance est recalculée avec l’XP actuel pour le combat, les choix de cibles et les cartes textuelles de la fenêtre Windows. La grammaire de ce bonus est reconnue sans dépendre du nom de la carte. Les anciennes confirmations de ce passif sont retirées à la reprise sans effacer les effets inconnus. Un changement de puissance qui rend les dégâts marqués mortels déclenche l’élimination et les effets d’Agonie lors du nettoyage.

Protection tient compte des valeurs numériques et de leurs cumuls. Son coût est payé lorsque la cible adverse est choisie, avec la réserve de Power, l’Or ou les runes disponibles. Les compétences ciblées génériques de l’IA utilisent le même paiement que les sorts ; leur planification réserve les ressources pour empêcher de les dépenser deux fois. Les choix physiques encore non automatisés restent en attente d’arbitrage.

Un essai de l’exécutable reconstruit vérifie l’affichage de Mosstomper à 4 Might pour 3 XP, le paiement d’une rune de Protection avant les réactions et les dégâts après résolution. Le parcours Windows de sauvegarde/reprise et la bascule HTTPS réelle vers l’agent externe réussissent également.

Le cas réel de Zaun Warrens est aussi vérifié dans l’exécutable : la conquête ouvre les réactions, la résolution attend la défausse physique, puis reprend après fermeture et réouverture de l’application. « Je défausse Pakaa Protector et je pioche » enregistre cette seule carte publique et une seule pioche. Le renvoi du même message avec son identifiant ne répète pas ces actions.

Les capacités génériques prises en charge ouvrent désormais une chaîne avant d’appliquer leurs instructions : pioche, défausse, étourdissement, dégâts, bonus, redressement, canalisation et Vision. Les cibles et Protection sont finalisées avant les réactions ; les cibles sont de nouveau vérifiées à la résolution. La capacité continue d’exister si sa source meurt. Une défausse déclenchée, comme celle de Chemtech Enforcer, se résout avec la main disponible après les réactions ; elle n’empêche pas de jouer l’unité lorsque la main restante est vide.

Les choix physiques de défausse, Vision et Burn interrompent la résolution à l’instruction concernée. La sauvegarde conserve ce point de reprise. L’annonce publique de la défausse permet de continuer les instructions sans répéter une pioche déjà effectuée et sans demander la main cachée. Le plateau et son résumé distinguent cette attente d’une fenêtre de priorité. « Tour suivant » laisse également les capacités de fin de tour se résoudre avant le changement de joueur. Voir RUP5 359, 383.3 et 383.4.

Les capacités simultanées prises en charge sont ajoutées par le joueur du tour, puis par l’autre joueur. Chacun ordonne ses propres capacités. L’IA suit un ordre déterministe et le joueur physique sélectionne une capacité dans la liste ou dit « Capacité 2 ». Chaque sélection place une capacité sur la chaîne et demande sa cible ou son paiement avant de passer à la suivante. La dernière capacité ajoutée se résout en premier. Le test natif rouvre une sauvegarde au moment du choix et vérifie que l’ordre sélectionné sur le plateau est appliqué. Voir RUP5 337.1 et 383.3.d.

L’aperçu 0.44.2 accepte les deux rangs autorisés pour une unité qui cumule Tank et Arrière-ligne. Le joueur peut déplacer chaque cible dans l’ordre proposé sur le plateau ou dire « Ordre des dégâts », suivi des noms des cibles. Le choix s’applique indépendamment à chaque unité qui cumule ces capacités. Les affectations restent enregistrées après la résolution. Si des défenseurs survivent, les attaquants survivants sont rappelés et les défenseurs gagnent le combat. Voir RUP5 467.2.c.6 à 467.2.c.9 et 468.1 à 468.3.

Les 364 tests automatisés réussissent. Les nouveaux cas vérifient notamment l’ordre lorsque le joueur du tour défend, la reprise du choix et le paiement consécutif de Protection. Les 1 200 duels simulés se terminent sans blocage ni commande invalide, dont 300 avec Vex. Sur les mêmes graines sous pression, Vex remporte 39 duels sur 100, contre 18 avant la prise en charge de Chasse et du niveau 6. Ces séries utilisent les trois politiques reproductibles du simulateur.

L’aperçu 0.44.2 passe 367 tests automatisés. Les 360 simulations de cette version opposent Shen à Zed, Jinx et Vex, avec trois politiques de jeu pour chaque adversaire. Elles se terminent toutes sans blocage ni commande invalide. Le replay HTTP vérifie aussi la reprise d’une chaîne, les réactions avant le redressement différé de Targon et la pioche de Shen avant celle du tour.

L’audit sur 1 407 entrées signale 1 214 entrées avec du texte nécessitant un examen. Les 154 entrées avec du texte sans alerte du parseur demandent encore une vérification de leurs interactions en jeu. Le moteur dispose de 31 règles de lancement de sorts, dont 21 dérivées du texte et 10 explicites. Les effets inconnus peuvent demander un arbitrage et l’adversaire peut écarter une carte dont l’effet ne peut pas être résolu. Les textes du moteur et certaines annonces restent en français.

Le corpus permet de reproduire 120 duels Shen–Zed avec trois politiques adverses. Le test Windows utilise une capture WAV synthétique et un seul PC. Le micro physique, les configurations modestes et la mise à jour en ligne entre deux versions natives publiées restent à vérifier.

Riot classe le jeu numérique à arbitrage automatique et les clients autonomes dédiés parmi les usages qu’il n’approuve pas dans sa politique publique. [Politique Riftbound](https://developer.riotgames.com/policies/riftbound).
