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
}

export type Diff = { fichier: string; avant: string; apres: string }

/** Une ligne d'action dans le fil (lecture, commande, modification). */
export type Outil = { id: string; nom: string; libelle: string; detail: string; diff?: Diff }

/** Ce que le main envoie au panneau pendant un tour. */
export type Evenement =
  | { type: 'texte'; texte: string }
  | { type: 'outil'; outil: Outil }
  | { type: 'demande'; demande: Outil }
  | { type: 'demande-close'; id: string }
  | { type: 'fin'; erreur?: string; duree: number }
  /** Une ligne d'Encre dans le fil, par exemple « Projet créé ». */
  | { type: 'info'; texte: string }

export type Reponse = 'oui' | 'toujours' | 'non'

export type EtatClaude = { installe: boolean; connecte: boolean; chemin: string | null }

export type Etat = {
  projets: Projet[]
  actif: string | null
  claude: EtatClaude
  enCours: boolean
}
