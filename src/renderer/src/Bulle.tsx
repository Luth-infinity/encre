import { useEffect, useRef, useState } from 'react'
import type { Humeur } from '@shared/types'
import { COULEURS, creerPoulpe, type Poulpe } from './poulpe'

const NOMS: Record<Humeur, string> = {
  repos: 'Au repos', ecoute: 'Écoute', reflechit: 'Réfléchit', bosse: 'Bosse', accord: 'Attend ton accord', fini: 'Fini'
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

  useEffect(() => {
    poulpe.current = creerPoulpe(canvas.current!, { distance: 6.4, fov: 30, hauteurCamera: 0.5, vise: 0.25 })
    void window.api.humeur().then((h) => { setHumeur(h); poulpe.current?.humeur(h) })
    const off = window.api.surHumeur((h) => { setHumeur(h); poulpe.current?.humeur(h) })
    return () => { off(); poulpe.current?.detruire() }
  }, [])

  const glisse = useRef<{ x: number; y: number; bouge: boolean } | null>(null)
  const bas = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    glisse.current = { x: e.screenX, y: e.screenY, bouge: false }
  }
  const bouge = (e: React.PointerEvent): void => {
    const g = glisse.current
    if (!g) return
    const dx = e.screenX - g.x, dy = e.screenY - g.y
    if (!g.bouge && Math.hypot(dx, dy) < 4) return
    g.bouge = true
    window.api.bulleDeplacer(dx, dy)
    g.x = e.screenX; g.y = e.screenY
  }
  const haut = (): void => {
    const g = glisse.current
    glisse.current = null
    if (!g) return
    if (g.bouge) window.api.bulleLacher()
    else window.api.bulleClic()
  }

  return (
    <div
      className={`bulle ${humeur === 'accord' ? 'ping' : ''}`}
      style={{ '--mood': COULEURS[humeur] } as React.CSSProperties}
      title={NOMS[humeur]}
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onContextMenu={(e) => { e.preventDefault(); window.api.bulleMenu() }}
    >
      <canvas ref={canvas} />
    </div>
  )
}
