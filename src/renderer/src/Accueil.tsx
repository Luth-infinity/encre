import { useEffect, useRef } from 'react'
import type { Humeur, Projet } from '@shared/types'
import { creerPoulpe, type Poulpe } from './poulpe'

/** Des idées pour démarrer, selon qu'on est en Libre ou dans un projet. */
function suggestions(projet: Projet): string[] {
  if (projet.libre) {
    return [
      'Crée-moi un projet pour un nouveau client',
      'Aide-moi à rédiger un mail clair',
      'Explique-moi un sujet en cinq minutes'
    ]
  }
  return [
    'Fais le point : où en est ce projet ?',
    'Lis le CLAUDE.md et propose les prochaines étapes',
    'Range et résume ce qu’il y a dans le dossier'
  ]
}

/**
 * Le fil vide : Tako en grand qui dit bonjour, d'où on part, et trois idées
 * pour démarrer d'un clic.
 */
export default function Accueil({ projet, humeur, touche, envoyer }: { projet: Projet; humeur: Humeur; touche: string; envoyer: (texte: string) => void }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const poulpe = useRef<Poulpe | null>(null)
  useEffect(() => {
    poulpe.current = creerPoulpe(canvas.current!, { remplir: 0.86 })
    return () => poulpe.current?.detruire()
  }, [])
  useEffect(() => poulpe.current?.humeur(humeur), [humeur])

  const contexte = projet.libre
    ? 'Ici, pas de projet : pose-moi n’importe quelle question. Pour un client ou un sujet suivi, dis-le et je crée le projet.'
    : projet.session
      ? `On reprend « ${projet.nom} » là où on l’avait laissé.`
      : `Je travaille dans le dossier de « ${projet.nom} ».`

  return (
    <div className="accueil">
      <canvas ref={canvas} className="tako-grand" />
      <h3>Salut, moi c’est Tako.</h3>
      <p>{contexte}</p>
      <div className="idees">
        {suggestions(projet).map((s) => (
          <button key={s} type="button" onClick={() => envoyer(s)}>{s}</button>
        ))}
      </div>
      {touche !== 'aucun' && <p className="astuce">Ou appuie sur <kbd>{touche}</kbd> et parle-moi, de n’importe où.</p>}
    </div>
  )
}
