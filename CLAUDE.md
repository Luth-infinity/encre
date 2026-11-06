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
```

Journal : `%APPDATA%/Encre/journal.log` (le `console.log` du main n'atteint pas
la sortie standard sous Windows). Projets : `%APPDATA%/Encre/projets.json`.

**Vérifier sans écran** (pas d'accès à l'écran depuis une session Code) :

```bash
ENCRE_VERIF='C:\chemin\projet-test' ENCRE_VERIF_SORTIE='C:\chemin\captures' npx electron .
```

L'app ajoute le projet, ouvre le panneau, envoie un vrai message à Claude
(`ENCRE_VERIF_MESSAGE`, mode `ENCRE_VERIF_MODE`), autorise la première demande,
enregistre `1-vide-*.png`, `2-demande-*.png`, `3-fin-*.png` (bulle et panneau)
puis quitte. Le projet de test reste dans `projets.json` : le retirer après.

## Architecture

| Fichier | Rôle |
|---|---|
| `main/index.ts` | Démarrage, IPC, raccourci global, menus natifs, mode vérif |
| `main/fenetres.ts` | La bulle (132 px, transparente, `focusable: false`, niveau `floating`) et le panneau (420×660), placé du côté de l'écran où il tient |
| `main/agent.ts` | Le SDK Claude Agent : un `query()` par message, `resume` de la session du projet, flux partiel, demandes d'autorisation |
| `main/projets.ts` | Projets = dossier + couleur + mode + dernière session |
| `main/claude.ts` | Trouve le Claude Code installé, regarde s'il y a des identifiants |
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

### Environnement par projet

Un projet = un dossier. Le contexte client vit dans le **CLAUDE.md** du dossier
et les outils (Figma avec le bon compte, Notion…) dans son **`.mcp.json`** :
Claude Code les charge seul (`settingSources: ['user', 'project', 'local']`).
Prévu ensuite : une interface pour brancher les outils et ranger les jetons
dans le trousseau Windows, sans toucher aux fichiers.

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

## État au 06/11/2026 (V0)

Fait : bulle 3D déplaçable (se range au bord), clic / clic droit, panneau,
projets (menu natif), chat en flux avec Markdown, lignes d'outils dépliables
avec diff, carte d'autorisation, trois modes, arrêt, nouvelle conversation,
reprise de session par projet, raccourci global.

Vérifié : build, typecheck, captures de la bulle et du panneau, chaîne
jusqu'au Claude Code. **Pas encore vu** : un tour complet avec réponse, car
la connexion du Claude Code de la machine avait expiré le 06/11.

À faire, dans l'ordre :
1. Tour complet vérifié (après `/login`), carte d'autorisation comprise.
2. Historique du fil gardé à la réouverture (aujourd'hui, seule la session
   Claude reprend : le fil affiché repart vide au redémarrage).
3. Commandes `/` (lister celles du SDK) et pièces jointes (glisser un fichier).
4. Mode Parler : reprendre `micro.ts` (Groq), `voix.ts` (edge-tts) et la
   veille d'Iris ; le poulpe en grand dans le panneau.
5. Outils par projet dans l'interface (Figma multi-comptes façon Calque,
   jetons dans le trousseau).
6. Démarrage avec Windows, icône, installeur, mise à jour auto.
