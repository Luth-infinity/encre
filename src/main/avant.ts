import { app } from 'electron'
import { join } from 'path'

/**
 * Importé en premier par `index.ts`, avant tout module qui lit `userData`.
 * En mode vérification, Encre prend ses propres données : il ne touche ni aux
 * projets de Lucas ni à l'instance qui tourne (le verrou d'instance unique
 * dépend de `userData`).
 */
if (process.env.ENCRE_VERIF) {
  const sortie = process.env.ENCRE_VERIF_SORTIE ?? process.env.ENCRE_VERIF
  app.setPath('userData', join(sortie, 'donnees'))
  process.env.ENCRE_RACINE ??= join(sortie, 'Encre')
}
