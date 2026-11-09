import { useEffect, useRef, useState } from 'react'
import { avatarDe, type Humeur } from '@shared/types'
import { COULEURS, creerPoulpe, type Poulpe } from './poulpe'

const NOMS: Record<Humeur, string> = {
  repos: 'Au repos', ecoute: 'Écoute', reflechit: 'Réfléchit', bosse: 'Bosse', accord: 'Attend ton accord', fini: 'Fini', note: 'Écrit ses notes'
}

/**
 * La bulle : le poulpe dans un disque noir, entouré d'un anneau à la couleur
 * de son humeur. Clic = panneau, glisser = déplacer (on suit le pointeur à la
 * main : une zone `drag` d'Electron mangerait le clic), clic droit = menu.
 */
export default function Bulle(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const poulpe = useRef<Poulpe | null>(null)
  const [humeur, setHumeur] = useState<Humeur>('repos')
  const [presse, setPresse] = useState(false)
  /** Chaque clic relance l'onde, les gouttes et le rebond (la clé change). */
  const [clic, setClic] = useState(0)
  const [change, setChange] = useState(false)
  const [rebond, setRebond] = useState(false)
  const dernierCoucou = useRef(0)

  useEffect(() => {
    // L'avatar du compte en cours ; le main recharge la bulle quand il change.
    void window.api.etat().then(async (e) => {
      const a = avatarDe(e.comptes.find((c) => c.actif)?.avatar)
      poulpe.current = creerPoulpe(canvas.current!, { remplir: 0.8, espece: a.espece, peau: a.peau, motif: a.motif })
      const h = await window.api.humeur()
      setHumeur(h)
      poulpe.current.humeur(h)
    })
    const off = window.api.surHumeur((h) => {
      setHumeur(h)
      poulpe.current?.humeur(h)
      // L'anneau pulse à chaque changement d'humeur ; Tako saute de joie quand c'est fini.
      setChange(false)
      requestAnimationFrame(() => setChange(true))
      if (h === 'fini') poulpe.current?.geste('saut')
    })
    return () => { off(); poulpe.current?.detruire() }
  }, [])

  const glisse = useRef<{ x: number; y: number; bouge: boolean } | null>(null)
  const bas = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    glisse.current = { x: e.screenX, y: e.screenY, bouge: false }
    setPresse(true)
  }
  const bouge = (e: React.PointerEvent): void => {
    const g = glisse.current
    if (!g) return
    const dx = e.screenX - g.x, dy = e.screenY - g.y
    if (!g.bouge && Math.hypot(dx, dy) < 4) return
    g.bouge = true
    setPresse(false)
    window.api.bulleDeplacer(dx, dy)
    g.x = e.screenX; g.y = e.screenY
  }
  const haut = (): void => {
    const g = glisse.current
    glisse.current = null
    setPresse(false)
    if (!g) return
    if (g.bouge) window.api.bulleLacher()
    else {
      setClic((n) => n + 1)
      setRebond(false)
      requestAnimationFrame(() => setRebond(true))
      poulpe.current?.geste('saut')
      window.api.bulleClic()
    }
  }
  const survol = (): void => {
    if (Date.now() - dernierCoucou.current < 5000) return
    dernierCoucou.current = Date.now()
    poulpe.current?.geste('coucou')
  }

  return (
    <div
      className={`bulle ${humeur === 'accord' ? 'ping' : ''} ${presse ? 'presse' : ''} ${rebond ? 'clic' : ''} ${change ? 'change' : ''}`}
      style={{ '--mood': COULEURS[humeur] } as React.CSSProperties}
      title={NOMS[humeur]}
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onPointerEnter={survol}
      onAnimationEnd={(e) => {
        if (e.animationName === 'change') setChange(false)
        if (e.animationName === 'rebond') setRebond(false)
      }}
      onContextMenu={(e) => { e.preventDefault(); window.api.bulleMenu() }}
    >
      <canvas ref={canvas} />
      {clic > 0 && (
        // La clé change à chaque clic : l'onde et les gouttes repartent de zéro (le canvas, lui, ne bouge pas).
        <span key={clic} className="eclat">
          <i className="onde" />
          <span className="gouttes">
            {[0, 60, 120, 180, 240, 300].map((a) => <i key={a} style={{ '--a': `${a + 20}deg` } as React.CSSProperties} />)}
          </span>
        </span>
      )}
    </div>
  )
}
