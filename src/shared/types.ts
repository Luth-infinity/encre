/** Ce que fait le poulpe. Chaque humeur a sa couleur (voir `renderer/src/styles.css`). */
export type Humeur = 'repos' | 'ecoute' | 'reflechit' | 'bosse' | 'accord' | 'fini'

/**
 * Qui décide des actions de Claude.
 * - `demander` : chaque action qui touche à la machine passe par toi.
 * - `modifs` : les fichiers se modifient seuls, les commandes demandent.
 * - `auto` : le mode auto de Claude Code, un classifieur valide ou refuse
 *   chaque action et ne demande que quand il hésite.
 */
export type Mode = 'demander' | 'modifs' | 'auto'

export type Projet = {
  id: string
  nom: string
  dossier: string
  couleur: string
  mode: Mode
  /** La dernière conversation, reprise au message suivant. */
  session: string | null
  /** Dernier message envoyé (ms), pour trier le hub. */
  derniere: number
  /** Le projet Libre : questions sans projet, toujours là, jamais retiré. */
  libre?: boolean
  /** Les comptes Figma branchés (noms de serveurs MCP déjà reliés par `claude mcp login`). */
  figma?: string[]
  /** Noms des jetons du projet. Les valeurs sont chiffrées à part (`main/secrets.ts`). */
  jetons?: string[]
  /** État des serveurs MCP au dernier tour, tel que Claude Code l'a donné. */
  serveurs?: { nom: string; etat: string }[]
}

export type Diff = { fichier: string; avant: string; apres: string }

/** Une ligne d'action dans le fil (lecture, commande, modification). */
export type Outil = { id: string; nom: string; libelle: string; detail: string; diff?: Diff }

/**
 * Une pièce jointe au message : une image (envoyée telle quelle à Claude) ou
 * un fichier (son chemin, que Claude lit lui-même).
 */
export type PieceJointe = { nom: string; chemin?: string; image?: { media: string; donnees: string } }

/** Ce que le main envoie au panneau pendant un tour, et ce qu'il garde dans le fil. */
export type Evenement =
  | { type: 'moi'; texte: string; pieces?: string[]; voix?: boolean }
  | { type: 'texte'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'demande-close'; id: string }
  | { type: 'fin'; erreur?: string; duree: number }
  /** Une ligne d'Encre dans le fil, par exemple « Projet créé ». */
  | { type: 'info'; texte: string }

/** Un élément du fil affiché (et enregistré) : les événements, une fois cumulés. */
export type Bloc =
  | { type: 'moi'; texte: string; pieces?: string[]; voix?: boolean }
  | { type: 'ia'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'fin'; erreur?: string; duree: number }
  | { type: 'info'; texte: string }

/**
 * Cumule un événement dans le fil. Le main (qui enregistre) et le panneau (qui
 * affiche) passent par la même fonction : les deux fils ne peuvent pas diverger.
 */
export function appliquer(fil: Bloc[], e: Evenement): Bloc[] {
  switch (e.type) {
    case 'texte': {
      const dernier = fil[fil.length - 1]
      if (dernier?.type === 'ia') return [...fil.slice(0, -1), { type: 'ia', texte: dernier.texte + e.texte }]
      return [...fil, { type: 'ia', texte: e.texte }]
    }
    case 'demande-close':
      return fil.filter((x) => !(x.type === 'demande' && x.demande.id === e.id))
    case 'moi':
      return [...fil, { type: 'moi', texte: e.texte, pieces: e.pieces, voix: e.voix }]
    case 'outil':
      return [...fil, { type: 'outil', outil: e.outil }]
    case 'demande':
      return [...fil, { type: 'demande', demande: e.demande }]
    case 'info':
      return [...fil, { type: 'info', texte: e.texte }]
    case 'fin':
      return [...fil, { type: 'fin', erreur: e.erreur, duree: e.duree }]
  }
}

export type Reponse = 'oui' | 'toujours' | 'non'

/** Une commande `/` de Claude Code, telle que le SDK la décrit. */
export type Commande = { nom: string; description: string; argument: string }

export type EtatClaude = { installe: boolean; connecte: boolean; chemin: string | null }

/** Les voix françaises de l'endpoint d'Edge, gratuites et sans clé (reprises d'Iris). */
export const VOIX = [
  { id: 'fr-FR-VivienneMultilingualNeural', nom: 'Vivienne' },
  { id: 'fr-FR-RemyMultilingualNeural', nom: 'Rémy' },
  { id: 'fr-FR-DeniseNeural', nom: 'Denise' },
  { id: 'fr-FR-HenriNeural', nom: 'Henri' }
]

/** Les réglages tels que le panneau les voit : jamais la clé elle-même. */
export type Reglages = {
  /** Une clé Groq est enregistrée (pour la transcription du mode Parler). */
  cleGroq: boolean
  voix: string
  /** Dire « Encre » ouvre le mode Parler (reconnaissance locale, rien ne sort). */
  veille: boolean
  /** Après une réponse dite, le micro se rouvre quelques secondes pour enchaîner. */
  suite: boolean
  /** Lancer Encre à l'ouverture de session Windows. */
  demarrage: boolean
}

/** Les comptes Figma que le Claude Code de la machine a déjà reliés. */
export type CompteFigma = { serveur: string; relie: boolean }

export type Etat = {
  projets: Projet[]
  actif: string | null
  claude: EtatClaude
  enCours: boolean
  reglages: Reglages
  version: string
  /** Le projet dont le tour en cours dépend : ses événements vont dans son fil. */
  tourDe: string | null
}
