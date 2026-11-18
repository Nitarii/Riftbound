# Aperçu Windows 0.44

Le programme C# WinForms héberge le plateau dans WebView2. Il lance le moteur existant sur une adresse de bouclage et utilise un jeton aléatoire par session. Le processus du moteur et ses descendants rejoignent un Job Object Windows dès le démarrage. Un joueur peut utiliser le plateau sans télécharger de modèle. Whisper et Qwen s’installent séparément depuis le gestionnaire. Le profil principal pour la conversation est Qwen3.5 9B sur une machine dotée d’au moins 16 Go de RAM et d’un GPU reconnu avec au moins 8 Go de VRAM. Le gestionnaire recommande Qwen3 4B sur les autres machines. L’installation sélectionne le modèle choisi. Le chargement en mémoire attend une requête de conversation.

La fenêtre Windows reprend le moteur de [l’aperçu 0.43](validation-preview-043.md), dont les réactions, la reprise des transactions et les renforts basés sur le plateau public. Une fois Qwen 9B en mémoire, il peut départager des assauts proches et déjà validés pendant une fenêtre bornée à trois secondes par défaut. Le premier tour peut se jouer avec le moteur seul.

Depuis l’accueil, le panneau **Connecter un agent externe** démarre à la demande un tunnel HTTPS temporaire. Le moteur de jeu est partagé avec la fenêtre Windows. L’agent reçoit sa main et l’état public de la partie avec un jeton propre à la session. Le gestionnaire et le jeton local restent réservés au joueur. Couper l’accès rend la partie à l’adversaire local. La synthèse française Piper reste disponible dans la fenêtre si elle est installée dans le profil de l’application avec le [script Piper](../scripts/install-piper.ps1) et Python 3.12 x64.

L’installateur Windows x64 est généré dans `dist`. Il permet de choisir le dossier du programme. Le profil par défaut se trouve dans `%LOCALAPPDATA%\Nitarii\Riftbound Companion`. La désinstallation retire les modules et demande une confirmation avant de retirer les parties et réglages personnels. Les installations portables antérieures conservent leur propre profil. Il n’y a pas de migration automatique depuis ce format.

La première installation peut nécessiter Internet pour obtenir WebView2 sur un PC qui ne l’a pas encore. Un accès réseau est également nécessaire pour télécharger un module ou vérifier une mise à jour. Le catalogue embarqué est l’instantané [Wysme au commit c9cbe8a](https://huggingface.co/datasets/Wysme/riftbound-cards/tree/c9cbe8af31527ad87c613c33c2942726b4c217e0). Le plateau affiche des cartes textuelles basées sur leurs données pour rester utilisable hors ligne.

## Compiler et vérifier

Préparer Node.js 26, le SDK .NET 10 et Inno Setup 7, puis lancer depuis la racine du dépôt.

```powershell
./scripts/build-desktop.ps1 -Iscc 'C:\Program Files (x86)\Inno Setup 7\ISCC.exe'
node --test tests/*.test.mjs
npm install --no-save --no-package-lock --no-audit --no-fund playwright-core@1.58.2
./scripts/windows-installer-smoke.ps1 -Installer dist/RiftboundCompanion-0.44.0-x64-Setup.exe
node scripts/build-pages.mjs --preview
```

Le test d’installation requiert un profil Windows sans installation native existante. Pour tester les modèles locaux, `RIFTBOUND_SMOKE_MODELS_ROOT` peut indiquer un dossier contenant les binaires et poids Whisper Small et Qwen vérifiés. `RIFTBOUND_SMOKE_WAV` indique un WAV PCM16 mono à 16 kHz contenant la commande « Je joue Disciple of Shen pour deux runes ». Avec `RIFTBOUND_SMOKE_QWEN=9b`, le test attend que le PC recommande Qwen3.5 9B et vérifie l’inférence Vulkan. Les poids sont liés aux données d’essai et ne sont pas redéployés. `RIFTBOUND_SMOKE_REMOTE=1` ajoute la connexion HTTPS réelle et vérifie le retour au mode local.

Le workflow Windows produit un installateur et son SHA-256. Une balise `desktop-vX.Y.Z` sur GitHub déclenche la publication si la compilation et le test d’installation réussissent. En mode de publication **GitHub Actions**, le workflow Pages déploie uniquement `dist/pages` et sélectionne la dernière version stable dotée d’un installateur.

## Couverture

L’audit sur 1 407 entrées signale 1 222 entrées avec du texte nécessitant un examen. Les 146 entrées avec du texte sans alerte du parseur ne représentent pas une certification des interactions. Les effets inconnus peuvent encore demander un arbitrage et l’adversaire peut écarter une carte dont l’effet ne peut pas être résolu. Les textes du moteur et certaines annonces restent en français.

Le corpus permet de reproduire 120 duels Shen–Zed avec trois politiques adverses. Le test Windows utilise une capture WAV synthétique et un seul PC. Le micro physique, les configurations modestes et la mise à jour en ligne entre deux versions natives publiées restent à vérifier.

Riot classe le jeu numérique à arbitrage automatique et les clients autonomes dédiés parmi les usages qu’il n’approuve pas dans sa politique publique. [Politique Riftbound](https://developer.riotgames.com/policies/riftbound).
