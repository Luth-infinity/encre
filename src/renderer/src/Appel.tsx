import { useEffect, useRef } from 'react'
import type { Humeur } from '@shared/types'
import type { Parole } from './lib/parole'
import { creerPoulpe, type Poulpe } from './poulpe'

const textes = (t: string): Record<Parole['phase'], [string, string]> => ({
  ecoute: ['Je t’écoute', `${t} pour envoyer · Échap pour annuler`],
  transcrit: ['Je note ce que tu as dit', ''],
  attend: ['Je réfléchis', 'Échap pour couper'],
  parle: ['Je te réponds', `${t} pour me répondre · Échap pour couper`]
})

/**
 * Pendant un échange à la voix, cette barre prend la place de la zone de
 * saisie : le poulpe en petit, ce qu'il fait en clair, et les deux gestes
 * (envoyer, annuler). Les messages, eux, s'écrivent dans le fil comme au
 * clavier.
 */
export default function Appel({ parole, humeur, grand, touche }: { parole: Parole; humeur: Humeur; grand: boolean; touche: string }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const poulpe = useRef<Poulpe | null>(null)
  const boite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    poulpe.current = creerPoulpe(canvas.current!, { remplir: 0.78 })
    return () => poulpe.current?.detruire()
  }, [])
  useEffect(() => poulpe.current?.humeur(parole.phase === 'ecoute' ? 'ecoute' : humeur), [humeur, parole.phase])

  // Le halo suit la voix (la tienne ou la sienne) ; la jauge se remplit pendant
  // une pause : on voit venir l'envoi, et reprendre la parole la vide.
  useEffect(() => {
    let id = 0
    const boucle = (): void => {
      const b = boite.current
      if (b) {
        const p = parole.pause()
        b.style.setProperty('--niveau', String(parole.niveau()))
        b.style.setProperty('--pause', String(p))
        b.classList.toggle('envoie', p > 0)
      }
      id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
  }, [parole])

  const [titre, aideTouches] = textes(touche === 'aucun' ? 'Touche-moi' : touche)[parole.phase]
  const aide = parole.phase === 'ecoute' && parole.mainsLibres ? 'Fais une pause quand tu as fini' : aideTouches
  return (
    <div ref={boite} className={`appel ${parole.phase} ${grand ? 'grand' : ''}`}>
      <button type="button" className="mini" onClick={() => parole.basculer()} title={parole.phase === 'ecoute' ? 'Envoyer' : 'Parler'}>
        <i className="halo" />
        <canvas ref={canvas} />
      </button>
      <div className="etat">
        <strong>
          <span className="t-normal">{titre}</span>
          <span className="t-envoi">J’envoie…</span>
          {parole.phase !== 'ecoute' && <span className="points"><i /><i /><i /></span>}
        </strong>
        <small>
          <span className="t-normal">{aide}</span>
          <span className="t-envoi">Continue de parler pour ajouter</span>
        </small>
        {parole.phase === 'ecoute' && parole.mainsLibres && <span className="jauge"><b /></span>}
      </div>
      {parole.phase === 'ecoute'
        ? <>
            <button type="button" className="annuler" onClick={parole.annuler} title="Annuler (Échap)">✕</button>
            <button type="button" className="envoyer" onClick={() => parole.basculer()} title="Envoyer">↑</button>
          </>
        : parole.phase !== 'transcrit' && <button type="button" className="annuler" onClick={parole.annuler} title="Couper (Échap)">■</button>}
    </div>
  )
}
