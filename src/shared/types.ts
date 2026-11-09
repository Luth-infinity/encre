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
  /** Taille du fil au dernier appel (tokens que Claude relit à chaque action). */
  contexte?: number
  /** Niveau et modèle du fil en cours : un long fil les garde, pour ne pas perdre son cache. */
  niveau?: Niveau
  modeleVu?: string
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
  | { type: 'moi'; texte: string; pieces?: string[]; voix?: boolean; citation?: string; pendant?: boolean }
  | { type: 'texte'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'demande-close'; id: string }
  /** `suites` : ce que l'utilisateur pourrait répondre, proposé par Tako en fin de réponse. */
  | { type: 'fin'; erreur?: string; duree: number; suites?: string[]; modele?: string; fil?: number; cout?: number }
  /** Une ligne d'Encre dans le fil, par exemple « Projet créé ». */
  | { type: 'info'; texte: string }

/** Un élément du fil affiché (et enregistré) : les événements, une fois cumulés. */
export type Bloc =
  /**
   * `citation` : le passage d'une réponse auquel on répond (sélectionné dans le fil).
   * `pendant` : envoyé pendant que Tako travaillait, glissé dans son tour.
   */
  | { type: 'moi'; texte: string; pieces?: string[]; voix?: boolean; citation?: string; pendant?: boolean }
  | { type: 'ia'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'fin'; erreur?: string; duree: number; suites?: string[]; modele?: string; fil?: number; cout?: number }
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
      return [...fil, { type: 'moi', texte: e.texte, pieces: e.pieces, voix: e.voix, citation: e.citation, pendant: e.pendant }]
    case 'outil':
      return [...fil, { type: 'outil', outil: e.outil }]
    case 'demande':
      return [...fil, { type: 'demande', demande: e.demande }]
    case 'info':
      return [...fil, { type: 'info', texte: e.texte }]
    case 'fin':
      return [...fil, { type: 'fin', erreur: e.erreur, duree: e.duree, suites: e.suites, modele: e.modele, fil: e.fil, cout: e.cout }]
  }
}

export type Reponse = 'oui' | 'toujours' | 'non'

/** Une commande `/` de Claude Code, telle que le SDK la décrit. */
export type Commande = { nom: string; description: string; argument: string }

export type EtatClaude = { installe: boolean; connecte: boolean; chemin: string | null }

/**
 * Un compte Claude connu d'Encre. Le principal est celui du terminal ; les
 * autres ont leur propre connexion, et le même historique.
 */
export type Compte = {
  id: string
  nom: string
  email: string | null
  /** L'organisation du compte (le nom de l'entreprise pour un compte d'équipe), si Claude Code la donne. */
  offre: string | null
  connecte: boolean
  actif: boolean
  principal: boolean
  /** L'id de l'avatar de ce compte (`AVATARS`). */
  avatar: string
}

/**
 * Les avatars : une créature (`poulpe.ts`), ses couleurs, un nom et un ton
 * dans la consigne. Un par compte Claude, pour que chacun ait le sien.
 */
export type Espece = 'poulpe' | 'meduse' | 'axolotl'
export type Avatar = { id: string; nom: string; espece: Espece; peau: string; motif: string; ton: string }
export const AVATARS: Avatar[] = [
  { id: 'tako', nom: 'Tako', espece: 'poulpe', peau: '#B7A6F5', motif: '#7E68E3', ton: 'chaleureux et un peu espiègle, sans en faire trop' },
  { id: 'nori', nom: 'Nori', espece: 'meduse', peau: '#A9E4F5', motif: '#F59AC8', ton: 'calme et posé, précis et rassurant, avec un humour discret' },
  { id: 'momo', nom: 'Momo', espece: 'axolotl', peau: '#FFC7D9', motif: '#F2558C', ton: 'énergique et direct, enthousiaste, droit au but' }
]
export const avatarDe = (id: string | undefined): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0]

/** Les voix françaises de l'endpoint d'Edge, gratuites et sans clé (reprises d'Iris). */
export const VOIX = [
  // Les multilingues sont les plus naturelles, mais peuvent glisser vers une
  // autre langue (rien ne les force en français sur le service gratuit).
  // Éloïse (voix d'enfant) retirée : « elle fait peur ».
  { id: 'fr-FR-VivienneMultilingualNeural', nom: 'Vivienne' },
  { id: 'fr-FR-RemyMultilingualNeural', nom: 'Rémy' },
  { id: 'fr-FR-DeniseNeural', nom: 'Denise' },
  { id: 'fr-FR-HenriNeural', nom: 'Henri' }
]

/**
 * Les voix Gemini (clé Google AI Studio, offre gratuite) : bien plus
 * naturelles, et on leur décrit le ton. Préfixe `gemini:` dans `voix`.
 */
export const VOIX_GEMINI = [
  { id: 'gemini:Sulafat', nom: 'Sulafat', aide: 'Chaleureuse' },
  { id: 'gemini:Vindemiatrix', nom: 'Vindemiatrix', aide: 'Douce' },
  { id: 'gemini:Leda', nom: 'Leda', aide: 'Jeune' },
  { id: 'gemini:Aoede', nom: 'Aoede', aide: 'Légère' },
  { id: 'gemini:Achird', nom: 'Achird', aide: 'Amical' },
  { id: 'gemini:Puck', nom: 'Puck', aide: 'Enjoué' }
]

/** Une voix créée à partir d'une description (Gemini « voice design »). */
export type VoixPerso = { id: string; nom: string; description: string; creee: number }

/** La description de départ de la voix de Tako : Lucas la modifie à volonté. */
export const DESCRIPTION_TAKO =
  'Une petite voix douce, chaleureuse et malicieuse, celle d’un poulpe mignon qui parle français avec le sourire. Plutôt jeune, rassurante, jamais criarde, avec une pointe d’espièglerie et un débit naturel de conversation.'

/** Les réglages tels que le panneau les voit : jamais la clé elle-même. */
export type Reglages = {
  /** Une clé Groq est enregistrée (pour la transcription du mode Parler). */
  cleGroq: boolean
  /** Une clé Gemini est enregistrée : Tako parle avec les voix Gemini. */
  cleGemini: boolean
  voix: string
  /** Les voix créées sur mesure chez Gemini (id `voice_…`), de la plus récente à la plus ancienne. */
  voixPerso: VoixPerso[]
  /** Dire « Encre » ouvre le mode Parler (reconnaissance locale, rien ne sort). */
  veille: boolean
  /** Après une réponse dite, le micro se rouvre quelques secondes pour enchaîner. */
  suite: boolean
  /** Lancer Encre à l'ouverture de session Windows. */
  demarrage: boolean
  /** Le modèle : trié selon la demande, imposé, ou celui de Claude Code. */
  modele: ChoixModele
}

/** `rapide` = Sonnet, `costaud` = Opus (`main/tri.ts`). */
export type Niveau = 'rapide' | 'costaud'
export type ChoixModele = 'auto' | 'sonnet' | 'opus' | 'claude'

/** Les comptes Figma que le Claude Code de la machine a déjà reliés. */
export type CompteFigma = { serveur: string; relie: boolean }

/** Une fenêtre de limite du compte Claude : la part utilisée (0 à 100) et quand elle repart à zéro (ms). */
export type Fenetre = { pourcent: number; reprise: number | null }

/**
 * Les limites de l'abonnement Claude (Pro, Max) : 5 heures glissantes et la
 * semaine. `null` quand elles ne s'appliquent pas (clé d'API) ou pas encore lues.
 */
export type Limites = { cinqHeures?: Fenetre; semaine?: Fenetre; atteinte: boolean; lu: number }

export type Etat = {
  projets: Projet[]
  actif: string | null
  claude: EtatClaude
  comptes: Compte[]
  /** Les projets où Tako travaille en ce moment (plusieurs à la fois). */
  enCours: string[]
  /** Ceux qui attendent une autorisation. */
  attend: string[]
  reglages: Reglages
  version: string
  /** Une nouvelle version téléchargée, prête à s'installer (redémarrage d'Encre). */
  majPrete: string | null
  /** Le raccourci global pour parler (« Alt+Maj+E »), ou « aucun » s'il était pris. */
  toucheParler: string
  limites: Limites | null
}
