import { useEffect, useRef } from 'react'
import type { Bloc, Humeur } from '@shared/types'
import type { Parole } from './lib/parole'
import { Micro } from './icones'
import { creerPoulpe, type Poulpe } from './poulpe'

const PHRASES: Record<Parole['phase'], string> = {
  pret: 'Touche le poulpe et parle.',
  ecoute: 'Je t’écoute…',
  transcrit: 'J’ai entendu, je note…',
  attend: 'Je réfléchis…',
  parle: ''
}

/** La dernière réponse, en court : le fil complet reste dans le chat. */
function derniereReponse(fil: Bloc[]): string {
  for (let i = fil.length - 1; i >= 0; i--) {
    const b = fil[i]
    if (b.type === 'moi') return ''
    if (b.type === 'ia') return b.texte
  }
  return ''
}

/**
 * Le mode Parler : le poulpe en grand, un bouton, et ce qui se dit. Le
 * poulpe prend l'humeur du main et s'écoute respirer avec le micro.
 */
export default function Parler({ parole, humeur, fil, veille }: { parole: Parole; humeur: Humeur; fil: Bloc[]; veille: boolean }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const poulpe = useRef<Poulpe | null>(null)
  const anneau = useRef<HTMLDivElement>(null)

  useEffect(() => {
    poulpe.current = creerPoulpe(canvas.current!, { distance: 7.4, fov: 30, hauteurCamera: 0.6, vise: 0.2 })
    return () => poulpe.current?.detruire()
  }, [])
  useEffect(() => poulpe.current?.humeur(parole.phase === 'ecoute' ? 'ecoute' : humeur), [humeur, parole.phase])

  // L'anneau suit la voix : on voit que le micro entend.
  useEffect(() => {
    let id = 0
    const boucle = (): void => {
      const n = parole.phase === 'ecoute' ? parole.niveau() : 0
      anneau.current?.style.setProperty('--niveau', String(n))
      id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
  }, [parole])

  const reponse = derniereReponse(fil)
  const toucher = (): void => {
    if (parole.phase === 'ecoute') parole.finir()
    else if (parole.phase === 'parle') parole.taire()
    else if (parole.phase === 'pret') parole.lancer()
  }

  return (
    <div className={`parler ${parole.phase}`}>
      <button type="button" className="scene" onClick={toucher} title={parole.phase === 'ecoute' ? 'J’ai fini' : parole.phase === 'parle' ? 'Couper la voix' : 'Parler'}>
        <div ref={anneau} className="halo" />
        <canvas ref={canvas} />
      </button>
      <div className="dit">
        {parole.erreur
          ? <p className="erreur">{parole.erreur}</p>
          : <p className="phase">{PHRASES[parole.phase] || ' '}</p>}
        {parole.entendu && parole.phase !== 'pret' && <p className="entendu">« {parole.entendu} »</p>}
        {reponse && (parole.phase === 'parle' || parole.phase === 'pret') && <p className="reponse">{reponse.replace(/[*`#>_]/g, '').slice(0, 320)}</p>}
      </div>
      <div className="commandes-voix">
        {parole.phase === 'ecoute'
          ? <>
              <button type="button" className="btn pri" onClick={parole.finir}>J’ai fini</button>
              <button type="button" className="btn" onClick={parole.annuler}>Annuler</button>
            </>
          : parole.phase === 'attend'
            ? <button type="button" className="btn" onClick={() => window.api.arreter()}>Arrêter</button>
            : parole.phase === 'parle'
              ? <button type="button" className="btn" onClick={parole.taire}>Couper la voix</button>
              : <button type="button" className="btn pri micro" onClick={parole.lancer} disabled={parole.phase !== 'pret'}><Micro /> Parler</button>}
      </div>
      {veille && <p className="astuce">Dis « Encre » de n’importe où pour me parler.</p>}
    </div>
  )
}
