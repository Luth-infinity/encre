# Encre — repères pour travailler sur ce dépôt

Un poulpe qui flotte sur le bureau (une bulle toujours au-dessus). Un clic ouvre
un panneau qui est un vrai Claude Code : il travaille dans le dossier du projet
choisi, avec ses outils, ses autorisations et ses sessions. À terme, un mode
**Parler** (voix, façon Iris) partagera la même conversation.

Encre **remplacera Iris et Calque** (Lucas, 06/11/2026). On ne retire ces deux
apps (dépôts, site Luth) qu'une fois Encre à parité, et avec son accord.

Code, commentaires, interface : **en français**. **Rien de personnel dans l'app** : Encre
sert à tout le monde (dépôt public). Aucun nom de client, d'entreprise ni de
personne dans l'interface, les exemples, les consignes à Claude ou le site
(exemple neutre : « Client · Refonte du site »). Les commentaires disent
*pourquoi*, pas *quoi*. Dépôt **public** depuis le 07/11/2026
(`Luth-infinity/encre`, choix de Lucas) : chacun utilise **son** Claude Code,
aucune clé dans le code. Ne jamais commiter de clé ni de jeton.

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

## Publier une version

1. Bumper `version` dans `package.json` (rester en `0.x`).
2. Commiter, pousser, puis pousser le tag `vX.Y.Z` : `.github/workflows/release.yml`
   construit Windows (`.exe`) et macOS (`.dmg` arm64 et x64, non signés) dans
   une release brouillon, puis la publie. Windows se met à jour seul
   (`electron-updater`) ; macOS non (Squirrel.Mac veut une app signée) : on
   reprend le `.dmg` sur le site.
3. Le site (`site/`, Next.js, Vercel) lit les releases GitHub : rien à écrire
   à la main. `cd site && vercel --prod`, **puis** `vercel alias set <url> encre-app.vercel.app`
   (l'adresse publique est un alias posé à la main). Protection Vercel retirée
   le 07/11 (sinon le site demande une connexion). Le Tako du site est une copie
   de `poulpe.ts` (`site/app/poulpe.ts`) : la garder identique. Checklist anti
   « vibe coded UI » de Yuwen Lu : pas de dégradé, de halo ni d'apparition au défilement.

## macOS

Pas testé sur un vrai Mac. Prévu : PATH repris du shell de connexion
(`reprendrePathDuShell`, sinon une app du Finder ne trouve ni `claude` ni
`node`), identifiants Figma lus dans le trousseau (`security
find-generic-password -s "Claude Code-credentials"`), console Terminal
(`.command`) pour relier Figma, menu Édition (sans lui, Cmd+C/V ne marchent
pas), Dock caché (`LSUIElement`), fenêtres sur tous les bureaux. Premier
lancement : clic droit → Ouvrir (app non signée).

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
  autorisés). « Je bosse sur la refonte du site de mon client » → il cherche un projet
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

### Parler (façon VoiceType, dans le chat)

Lucas ne veut **pas** d'onglet « Parler » séparé ni d'écoute qui se coupe
toute seule (essai du 06/11 : ses phrases partaient à la première hésitation,
et il ne savait pas quand ça écoutait). Le modèle est **VoiceType, mais c'est
Claude qui répond** :

- **Alt+Maj+E** de n'importe où (ou le bouton micro de la saisie, quand rien
  n'est écrit) ouvre l'écoute ; un second appui envoie ; **Échap** annule
  (posé en `globalShortcut` le temps de l'échange, le panneau est souvent
  caché). Le panneau peut rester fermé : la bulle passe en humeur `ecoute`.
- Pendant l'échange, la barre `Appel.tsx` remplace la saisie (petit poulpe +
  halo au niveau du micro, état en clair, ✕ / ↑). Demande et réponse
  s'écrivent dans le fil ; seule une demande dite reçoit une réponse dite.
- Deux bips : note qui monte à l'ouverture, qui descend à l'envoi.
- Seul le réveil au mot « Encre » termine sur un silence (2,3 s, jauge
  visible) : mains libres, rien sur quoi appuyer.
- Groq whisper-large-v3-turbo dans le main, `language=fr`, `temperature=0`,
  et un filtre des hallucinations (« sous-titres… Amara.org ») ; il faut
  ~0,4 s de voix pour que ce soit une phrase.
- **Voix : jamais de multilingue** (Vivienne, Rémy) : elles devinent la langue
  à chaque phrase et partaient en espagnol. Défaut : Éloïse (voix d'enfant,
  « mignonne » demandé par Lucas).

### Tako (la mascotte)

Le poulpe s'appelle **Tako** (choisi par Lucas le 06/11 ; poulpe en
japonais, clin d'œil à son tatouage irezumi). L'app reste « Encre ». Tako se
présente dans la consigne, l'accueil et l'en-tête des réponses. Mot de
réveil : « Tako » (le petit Vosk n'a pas ce mot : on accepte taco, tacot,
tacos, takot), « Encre » marche encore. **Pas testé au vrai micro.**

Au repos, Tako **vit sa vie** : il regarde où il veut, fait coucou, sautille,
s'étire, cligne, tourne la tête. Il ne suit la souris que quand elle passe
tout près, 2,5 s. (Le suivi permanent était « relou ».)

### Avatars (09/11)

Un avatar **par compte Claude** (Réglages → Comptes Claude, menu à droite de
chaque compte) : `AVATARS` dans `shared/types.ts`. Chacun a une créature
(`espece`), ses couleurs, un nom et un ton passés dans la consigne
(`avatarActif()`) : **Tako** le poulpe, **Nori** la méduse (cloche
festonnée, filaments, bras frisés), **Momo** l'axolotl (branchies, ventre,
pattes, queue). `poulpe.ts` partage le rendu, le visage, les humeurs et les
gestes ; seuls le crâne et les membres (`forme()` par sorte) changent. Le
motif irezumi reste au poulpe. Choix gardé dans `comptes.json` (`avatars`) ;
le main recharge la bulle quand il change. Aperçu sans écran :
`ENCRE_ICONE=<png> ENCRE_ICONE_AVATAR=nori npx electron .` (marche aussi
quand Encre tourne). Restent « Tako » : voix (`STYLE_TAKO`), mot de réveil,
icône, menu de la zone de notification. **Animations pas encore vues en
mouvement.**

### Libre = brouillon

Libre repart **à vide** (fil + session) chaque fois qu'on y va et au
démarrage. Une question rapide s'y traite ; une demande de travail fait créer
(ou ouvrir) un projet par Tako, sans demander. En fin de tour, `envoyer()` voit
que le projet actif a changé : le fil de Libre déménage dans le projet
(`fils.deplacer`), et un tour de relance part aussitôt là-bas avec la demande
(sans réafficher la bulle de l'utilisateur). Vérifié le 06/11 :
`ENCRE_VERIF_LIBRE="<demande>"` (autorise tout, trace les événements).

### Interface

Accueil : Tako en grand, « Salut, moi c'est Tako », trois suggestions
cliquables, rappel du raccourci. Fil : en-tête « Tako » + avatar à chaque
réponse, actions consécutives regroupées (« 5 étapes », Tout voir), tableaux
Markdown. Plein écran : barre de projets à gauche. Ombre du panneau neutre
(teintée, elle faisait un halo « dégueu » sur les fenêtres).

### Bulle

Toujours `setBounds` avec la taille fixe : `setPosition` la faisait gonfler
pendant le glisser (Windows mis à l'échelle). Elle reste où on la pose (plus
d'aimant au bord), ramenée seulement si elle sort de l'écran.

### Voix de Tako (Gemini, Edge en secours)

Edge gratuit jugé « robotique, fait peur » (06/11), et il refuse `<lang>`
(impossible de tenir les voix multilingues en français). Voix principale :
**Gemini** `gemini-3.8-flash-tts` (API `v1beta/interactions`, WAV 24 kHz en
base64, offre gratuite), clé Google AI Studio saisie par Lucas dans
Réglages (chiffrée, `secrets` « gemini »). Le ton passe par
`annotations[].speech_metadata.style` (`STYLE_TAKO` dans `voix.ts`), pas
dans le texte (lu tel quel). Voix `gemini:<Nom>` (`VOIX_GEMINI`). En échec
(quota, réseau), la phrase part en Edge Vivienne et le journal le dit. Les
phrases Gemini sont synthétisées en parallèle et rendues dans l'ordre.
« Tester la voix » dans les réglages (gardé en mémoire par voix, jamais de
remplaçante Edge : message clair si quota). **Gratuit = 3 requêtes par
minute** (mesuré le 06/11) : une seule requête par prise de parole (pas de
découpage en phrases), aucune phrase d'attente en Gemini, attente auto si
Google demande ≤ 6 s, et le tour attend la fin de la voix avant `tour-fini`. VoiceStudio étudié et écarté (10 Go,
AMD non pris en charge par défaut, pas d'API de synthèse documentée, pas de
temps réel prouvé). **Pas encore testé avec une vraie clé.**

### Voix sur mesure et « sans relais »

Réglages → « Créer la voix de Tako » : description (pré-remplie,
`DESCRIPTION_TAKO`) → `POST /v1beta/voices` (`type: prompted`,
`language_code: fr-FR`, `store: true`) → id `voice_…` gardé dans
`reglages.voixPerso`, choisi aussitôt, échantillon joué. Gardée un an après
le dernier usage, 200 voix max par projet. La réplication d'une vraie voix
exige la facturation et une phrase de consentement : pas proposée.
**Jamais de voix de relais** : Gemini en échec (quota) → Tako se tait, la
réponse reste écrite, le panneau affiche « Tako répond par écrit… »
(`voix-muette`). L'alternance Gemini/Edge était « ultra perturbante ».
Non vérifié : la création de voix en offre gratuite (à voir au premier essai).

### Écrire pendant que Tako travaille, répondre à un passage, limites

- **Messages glissés** : pendant un tour, la saisie reste ouverte (↑ si du
  texte, ■ sinon). Le message part dans l'entrée en flux du tour avec
  `priority: 'next'` : Claude Code le donne à Claude entre deux outils, comme
  dans le terminal (essai du 07/11 : pris en compte, un seul `result`). Après
  un `result` qui suit un message glissé, l'entrée reste ouverte 5 s au cas où
  Claude Code en ferait un nouveau tour. Trop tard (entrée fermée) : il attend
  dans `suivants` et part à la fin. Bulle `moi` cerclée (`pendant`).
- **Répondre à un passage** : sélectionner du texte dans une réponse fait
  apparaître « ↳ Répondre » ; le passage s'affiche au-dessus de la saisie,
  puis part en citation Markdown (`citer()` dans `main/index.ts`).
- **Limites** (5 h, semaine) : `rate_limit_event` à chaque appel
  (`unifiedWindows`, part de 0 à 1, absent des types du SDK) ; hors tour,
  `usage_EXPERIMENTAL_…` sur une session sans message, relu à l'ouverture du
  panneau s'il date de plus d'une minute. API expérimentale : à surveiller
  aux mises à jour du SDK.

### Plusieurs projets à la fois (08/11)

Un tour **par projet** (`tours` dans `agent.ts`) : changer de projet ne coupe
rien, les autres continuent derrière. Un message dans un projet qui
travaille y est glissé ; dans un autre, il part en parallèle. `Etat.enCours`
et `Etat.attend` listent les projets ; hub et barre montrent un point
(orange = travaille, jaune = attend ton accord), l'en-tête un compteur des
autres. La bulle prend l'humeur la plus pressante (`humeurDe`). Un projet
ouvert par Tako ne prend l'écran que si on regardait celui du tour.
`tour-fini` ne part que pour un tour lancé à la voix. **Pas encore vu sur
deux vrais tours en même temps.**

### Comptes Claude (08/11)

Réglages → Comptes Claude (`main/comptes.ts`). Le principal = celui du
terminal ; chaque autre a son dossier `userData/comptes/<id>` passé en
`CLAUDE_CONFIG_DIR`. Les dossiers `projects`, `skills`, `plugins`… y sont
des **jonctions** vers ceux du principal (sessions reprises d'un compte à
l'autre) ; `settings.json` et CLAUDE.md sont copiés. Connexion (09/11) :
la console ouvrait le navigateur habituel, déjà connecté au compte de
Lucas (impossible d'en choisir un autre) et demandait de recopier un code.
Désormais Encre lance `claude auth login` en tuyaux, ouvre l'adresse dans
une **fenêtre à session neuve** (agent Chrome, sinon Google refuse), lit
`code` et `state` dans l'adresse de `/oauth/code/callback` et écrit
`code#state` sur l'entrée de la commande. Vérifié : la fenêtre s'ouvre sur la
page de connexion vierge (`ENCRE_VERIF_CONNEXION=1`) ; la lecture du code
n'a pas encore été vue avec une vraie connexion.
Retirer défait les jonctions avant d'effacer (jamais les dossiers du
principal). **Pas encore essayé avec un deuxième vrai compte.**

Fiche des limites au survol des jauges : reste, remise à zéro, part du
temps écoulé et projection au rythme actuel.

### Réponses proposées (09/11)

La consigne demande à Claude de finir chaque réponse par
`<suites>a | b | c</suites>` : trois choses que l'utilisateur pourrait
répondre. `FiltreSuites` (`agent.ts`) retire la ligne du flux (balises
coupées entre deux morceaux comprises) avant le fil et la voix ; elles
partent dans l'événement `fin` (`suites`) et s'affichent en boutons sous la
dernière réponse, une fois le tour fini. Aucun appel en plus. **Pas encore
vu sur un vrai tour.**

### Plein écran

Bouton ⤢ du panneau : il prend l'écran de travail, n'est plus au-dessus de
tout, la bulle se cache ; le chat passe en colonne de 820 px. Fermer le
panneau le ramène contre la bulle.

### Poulpe centré

`creerPoulpe(canvas, { remplir })` cadre sur la vraie silhouette (Box3 de
la pose de repos ramenée à l'origine, qui est aussi le pivot) : centré dans
tous les cadres. Ne plus revenir à des réglages de caméra à la main.

### Outils par projet

- **Figma** : on coche les comptes déjà reliés (entrées `mcpOAuth` du
  `.credentials.json`). Encre les déclare au tour (`mcpServers`, même nom,
  même adresse) et Claude Code reprend la connexion, comme Calque. « Relier »
  ouvre une console PowerShell qui fait `claude mcp add --scope local` dans
  `Documents/Encre` puis `claude mcp login`. `figma-remote-mcp` s'affiche
  « par défaut ».
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

Ouvrir : Ctrl+Maj+Espace (sinon Ctrl+Maj+Alt+Espace). Parler : Alt+Maj+E
(sinon Ctrl+Maj+E). **Pas de
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

Tour complet vérifié le 06/11 au soir (après `/login`) : message → carte
d'autorisation avec le diff → Autoriser → `bonjour.txt` créé → réponse de
Claude, « Fait en 6 s ».

**Pas encore vu** :
- un projet créé depuis le chat (outil `creer_projet`) ;
- le micro et la veille en vrai (pas d'accès au micro depuis une session
  Code) ;
- un compte Figma branché sur un projet pendant un vrai tour ;
- la mise à jour auto : il faut une release GitHub, or le dépôt est privé
  (electron-updater ne lit pas un dépôt privé sans jeton). À décider avec
  Lucas : dépôt public façon Hublink, ou mises à jour à la main.

À faire ensuite :
1. Projet créé depuis le chat, compte Figma branché sur un vrai tour.
2. Essayer le mode Parler et la veille en vrai, régler les seuils
   (`micro.ts` : `SEUIL`, `FIN_SILENCE`).
3. Décider de la publication (release, site Luth), puis retirer Iris et
   Calque une fois Encre à parité, avec l'accord de Lucas.
4. macOS : rien n'est testé (chemins, trousseau, micro).
