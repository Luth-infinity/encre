# Encre — repères pour travailler sur ce dépôt

Un poulpe qui flotte sur le bureau (une bulle toujours au-dessus). Un clic ouvre
un panneau qui est un vrai Claude Code : il travaille dans le dossier du projet
choisi, avec ses outils, ses autorisations et ses sessions. À terme, un mode
**Parler** (voix, façon Iris) partagera la même conversation.

Encre **remplacera Iris et Calque** (Lucas, 06/11/2026). On ne retire ces deux
apps (dépôts, site Luth) qu'une fois Encre à parité, et avec son accord.

Code, commentaires, interface : **en français**. Les commentaires disent
*pourquoi*, pas *quoi*. Version **perso** tant que ce n'est pas fini : pas de
site, pas de release, dépôt privé (`Luth-infinity/encre`).

## Lancer

```bash
npm install
npm run dev        # electron-vite, rechargement à chaud
npm run build      # typecheck + build dans out/
npx electron .     # lance le build
npm run dist:win   # installeur dans dist/ (Encre-Setup-x.y.z.exe)
```

Icône : `ENCRE_ICONE=<chemin>/assets/icon.png npx electron .` redessine le
poulpe en PNG (vue `?vue=icone`), utilisé par electron-builder.

Journal : `%APPDATA%/Encre/journal.log` (le `console.log` du main n'atteint pas
la sortie standard sous Windows). Projets : `%APPDATA%/Encre/projets.json`.

**Vérifier sans écran** (pas d'accès à l'écran depuis une session Code) :

```bash
ENCRE_VERIF='C:\chemin\projet-test' ENCRE_VERIF_SORTIE='C:\chemin\captures' npx electron .
```

L'app ajoute le projet, ouvre le panneau, capture le hub, envoie un vrai
message à Claude (`ENCRE_VERIF_MESSAGE`, mode `ENCRE_VERIF_MODE`), autorise la
première demande, enregistre `0-hub-*.png`, `1-vide-*.png`, `2-demande-*.png`,
`3-fin-*.png` (bulle et panneau) puis quitte. Il capture aussi les vues
Réglages, Outils, Parler et le menu `/` (`4-` à `7-`). Avec
`ENCRE_VERIF_ETAPES=sans-claude`, il s'arrête avant le message et teste la
chaîne vocale sans micro : la voix d'Edge dit une phrase, Groq la retranscrit
(résultat dans le journal, `voix.mp3` dans la sortie). En mode vérif, `main/avant.ts`
met `userData` et la racine des projets dans le dossier de sortie : le test ne
touche ni aux projets de Lucas ni à l'Encre qui tourne (sinon le verrou
d'instance unique ferme le test aussitôt).

## Architecture

| Fichier | Rôle |
|---|---|
| `main/index.ts` | Démarrage, IPC, raccourci global, menus natifs, mode vérif |
| `main/fenetres.ts` | La bulle (132 px, transparente, `focusable: false`, niveau `floating`) et le panneau (420×660), placé du côté de l'écran où il tient |
| `main/agent.ts` | Le SDK Claude Agent : un `query()` par message, `resume` de la session du projet, flux partiel, demandes d'autorisation |
| `main/projets.ts` | Projets = dossier + couleur + mode + dernière session |
| `main/claude.ts` | Trouve le Claude Code installé, regarde s'il y a des identifiants (et retient une connexion expirée) |
| `main/fils.ts` | Le fil de chaque projet, gardé dans `userData/fils/<id>.json` |
| `main/voix.ts` | Voix d'Edge phrase par phrase (repris d'Iris), phrases d'attente |
| `main/outils.ts` | Comptes Figma par projet, jetons, console `claude mcp login` |
| `main/secrets.ts` | Clé Groq et jetons, chiffrés par `safeStorage` (DPAPI) |
| `main/reglages.ts` | Voix, veille, enchaîner, démarrage avec Windows ; reprend la clé Groq d'Iris/VoiceType |
| `main/updates.ts` | `electron-updater` sur les releases GitHub (installé à la fermeture) |
| `renderer/src/Saisie.tsx` | Saisie, pièces jointes (glisser, coller, trombone), menu `/` |
| `renderer/src/Parler.tsx` + `lib/parole.ts` | Mode Parler : poulpe en grand, écoute → Groq → Claude → voix → réécoute |
| `renderer/src/lib/veille.ts` | Réveil au mot « Encre » (Vosk local, repris d'Iris ; « ancre » compte aussi) |
| `renderer/src/Reglages.tsx` / `OutilsProjet.tsx` | Les deux pages de l'en-tête (⚙ et prise) |
| `renderer/src/poulpe.ts` | Le poulpe 3D (Three.js r160) |
| `renderer/src/Bulle.tsx` / `Panneau.tsx` | Les deux vues, une seule page (`?vue=bulle` ou `?vue=panneau`) |
| `design/pistes.html` | La page de pistes validée (artifact claude.ai/artifact/HaKuWJJFYGGe1U1iT3rnLS) |

### Connexion à Claude

Aucune clé, aucun identifiant : le SDK lance **le Claude Code de la machine**
(`pathToClaudeCodeExecutable`), donc le compte qui y est connecté paie.

- **Piège** : lancé depuis une session Claude Code (terminal ou app de bureau),
  Encre hérite de variables `CLAUDE_*` / `ANTHROPIC_BASE_URL` qui font croire
  à l'enfant que l'hôte gère sa connexion. `envPropre()` les retire (sauf
  `CLAUDE_CONFIG_DIR`).
- Le Claude Code en ligne de commande a **sa propre connexion**, distincte de
  l'app de bureau Claude. Si elle a expiré (« OAuth session expired »), il faut
  `claude` puis `/login` dans un terminal. Le message d'erreur le dit.

### Autorisations (le « mode auto »)

Réglées par projet, sous la zone de saisie :

| Mode | `permissionMode` du SDK |
|---|---|
| Demander | `default` : chaque action passe par la carte Autoriser / Toujours / Refuser |
| Modifs auto | `acceptEdits` : fichiers modifiés seuls, commandes demandées |
| Auto | `auto` : le classifieur de Claude Code décide, ne demande que quand il hésite |

« Toujours sur ce projet » renvoie les `suggestions` du SDK en
`updatedPermissions` (règle enregistrée par Claude Code). Le mode change aussi
en plein tour (`setPermissionMode`).

### Libre, hub et projets créés depuis le chat

- **Libre** : le projet toujours là, en premier, jamais retiré. Questions sans
  projet, dans `Documents/Encre/Libre`. Ouvert par défaut.
- **Hub** : un clic sur le nom du projet en haut du panneau affiche tous les
  projets en cartes (Libre, puis les plus récents, puis « Lier un dossier »).
  Clic droit sur une carte : ouvrir le dossier, retirer d'Encre (le dossier
  reste). Changer de projet vide le fil affiché.
- **Créer depuis le chat** : Claude a trois outils servis dans le process
  (`mcp__encre__lister_projets`, `creer_projet`, `ouvrir_projet`, toujours
  autorisés). « Je bosse sur L'Oréal, projet BIM » → il cherche un projet
  existant, sinon crée `Documents/Encre/Projets/<nom>` avec un CLAUDE.md qui
  porte le contexte donné. Le tour en cours reste dans son dossier : le projet
  prend la main **au message suivant** (une ligne « Projet créé » le dit).
- Ces outils exigent l'**entrée en flux** (`prompt` = générateur d'un seul
  message) ; `setPermissionMode` aussi.

### Environnement par projet

Un projet = un dossier. Le contexte client vit dans le **CLAUDE.md** du dossier
et les outils (Figma avec le bon compte, Notion…) dans son **`.mcp.json`** :
Claude Code les charge seul (`settingSources: ['user', 'project', 'local']`).
Prévu ensuite : une interface pour brancher les outils et ranger les jetons
dans le trousseau Windows, sans toucher aux fichiers.

### Fil gardé

Le main est la source du fil : chaque événement passe par `fils.noter` puis
part au panneau avec l'id du projet (`appliquer()` dans `shared/types.ts`,
même fonction des deux côtés). Un événement d'un autre projet fait recharger
le fil entier : c'est ce qui bascule le panneau sur un projet créé depuis le
chat, au message suivant. « ＋ » vide le fil et la session.

### Commandes `/` et pièces jointes

`agent.commandes()` ouvre une session sans message le temps de
`supportedCommands()` (rien n'est envoyé à Claude), écarte les commandes
internes, retirées ou de terminal (`HORS_ENCRE`) et garde la liste par
dossier. Les images partent en blocs base64, les autres fichiers par leur
chemin (Claude les lit lui-même). Chemin d'un fichier glissé :
`webUtils.getPathForFile`.

### Mode Parler

Micro (arrêt après 1,4 s de silence) → `transcrire` dans le main (Groq
whisper-large-v3-turbo, la clé ne quitte pas le main) → `envoyer(…, voix)` :
la consigne passe en « écris pour l'oreille » et un `Diseur` envoie le MP3
phrase par phrase au panneau. Une phrase d'attente comble le silence après
1,8 s. Seule une question dite reçoit une réponse dite. La veille vit dans
le panneau (caché la plupart du temps : `backgroundThrottling: false`) et se
tait pendant qu'on parle ou que le poulpe répond.

### Outils par projet

- **Figma** : on coche les comptes déjà reliés (entrées `mcpOAuth` du
  `.credentials.json`). Encre les déclare au tour (`mcpServers`, même nom,
  même adresse) et Claude Code reprend la connexion, comme Calque. « Relier »
  ouvre une console PowerShell qui fait `claude mcp add --scope local` dans
  `Documents/Encre` puis `claude mcp login`. `figma-remote-mcp` s'affiche
  « avanteam ».
- **Jetons** : chiffrés, donnés au Claude Code du projet en variables
  d'environnement (un `.mcp.json` peut écrire `${NOM}`).
- **Serveurs** : l'état donné par le message `init` du dernier tour.

### Paquet

L'installeur exclut `@anthropic-ai/claude-agent-sdk-win32-x64` (327 Mo) :
Encre passe toujours par le Claude Code de la machine. Démarrage avec
Windows seulement dans l'app installée (`setLoginItemSettings`).

### Humeurs

`repos` (lavande), `ecoute` (bleu), `reflechit` (rose), `bosse` (orange),
`accord` (jaune, la bulle pulse), `fini` (vert, 6 s puis repos). Le main les
pousse aux deux fenêtres (`humeur`). Elles teintent l'anneau de la bulle,
l'ombre du panneau et les joues du poulpe.

## Le poulpe : ce que Lucas a validé (ne pas revenir en arrière)

- **3D toon** (contour d'encre en coque inversée), pas de SVG 2D : jugé « dégueu ».
- **Mignon, pas creepy** : grosses pupilles, deux reflets, regard qui suit à
  peine la souris, tentacules courtes et épaisses qui s'enroulent au bout.
- D'après **le tatouage de Lucas** (poulpe irezumi violet) : motifs seigaiha +
  une fleur de cerisier **uniquement sur les tentacules**, trait **léger**
  lavande foncé. **Jamais de motif sur la tête.**
- Pas de texte contouré (text-stroke) dans l'interface.

## DA

Base Hublink : gris froids `#E8EAEC` / `#F4F6F7`, cartes blanches, Inter
Tight, encre `#0B0C0E`. Plus funky et plus vivant que Hublink : la couleur
d'humeur, les entrées à ressort, la bulle qui pulse. Suit le thème de Windows.

## Raccourci

Le premier libre parmi Ctrl+Maj+Espace, Alt+Maj+E, Ctrl+Maj+E. **Pas de
Ctrl+Alt** : c'est AltGr sur un clavier AZERTY (Ctrl+Alt+E tape €).

## État au 06/11/2026 (v0.1.0)

Fait : bulle 3D déplaçable, panneau, mode Libre, hub de projets, création de
projet depuis le chat, chat en flux avec Markdown et diffs, carte
d'autorisation, trois modes, reprise de session, raccourci global, **fil
gardé à la réouverture**, **commandes `/`**, **pièces jointes**, **mode
Parler** (micro, Groq, voix Edge, enchaîner, réveil au mot « Encre »),
**outils par projet** (Figma, jetons, serveurs), **réglages**, **icône**,
**installeur NSIS**, **démarrage avec Windows**, **mise à jour auto** câblée.

Vérifié le 06/11 : build et typecheck ; captures de toutes les vues en dev
et dans l'app empaquetée ; voix Edge → transcription Groq (phrase
retrouvée) ; fil enregistré sur le disque ; message « connexion expirée ».

**Pas encore vu** :
- un tour complet avec réponse de Claude : la connexion du Claude Code de la
  machine est toujours expirée (`claude` puis `/login`, à faire par Lucas) ;
- le micro et la veille en vrai (pas d'accès au micro depuis une session
  Code) ;
- un compte Figma branché sur un projet pendant un vrai tour ;
- la mise à jour auto : il faut une release GitHub, or le dépôt est privé
  (electron-updater ne lit pas un dépôt privé sans jeton). À décider avec
  Lucas : dépôt public façon Hublink, ou mises à jour à la main.

À faire ensuite :
1. Tour complet (après `/login`) : carte d'autorisation, projet créé depuis
   le chat, compte Figma branché.
2. Essayer le mode Parler et la veille en vrai, régler les seuils
   (`micro.ts` : `SEUIL`, `FIN_SILENCE`).
3. Décider de la publication (release, site Luth), puis retirer Iris et
   Calque une fois Encre à parité, avec l'accord de Lucas.
4. macOS : rien n'est testé (chemins, trousseau, micro).
