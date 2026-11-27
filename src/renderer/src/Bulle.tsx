import { useEffect, useRef, useState } from 'react'
import { avatarDe, type Espece, type Humeur } from '@shared/types'
import { COULEURS } from './poulpe'
import { bulleAnimee } from './poulpe2d'

const NOMS: Record<Humeur, string> = {
  repos: 'Au repos', ecoute: 'Écoute', reflechit: 'Réfléchit', bosse: 'Bosse', accord: 'Attend ton accord', fini: 'Fini', note: 'Écrit ses notes'
}

/**
 * La bulle : l'avatar dessiné, en vidéo, qui déborde d'un disque noir, entouré d'un anneau à la couleur
 * de son humeur. Clic = panneau, glisser = déplacer (on suit le pointeur à la
 * main : une zone `drag` d'Electron mangerait le clic), clic droit = menu.
 */
export default function Bulle(): JSX.Element {
  const [humeur, setHumeur] = useState<Humeur>('repos')
  const [presse, setPresse] = useState(false)
  /** Chaque clic relance l'onde, les gouttes et le rebond (la clé change). */
  const [clic, setClic] = useState(0)
  const [change, setChange] = useState(false)
  const [rebond, setRebond] = useState(false)
  const [espece, setEspece] = useState<Espece | null>(null)

  useEffect(() => {
    // L'avatar du compte en cours ; le main recharge la bulle quand il change.
    void window.api.etat().then(async (e) => {
      const a = avatarDe(e.comptes.find((c) => c.actif)?.avatar)
      const h = await window.api.humeur()
      // Une vidéo qui déborde du rond (le dessin de l'avatar), jamais de WebGL : un avatar en 3D
      // figeait la bulle au changement de compte (0.7.1).
      setEspece(a.espece)
      setHumeur(h)
    })
    const off = window.api.surHumeur((h) => {
      setHumeur(h)
      // L'anneau pulse à chaque changement d'humeur.
      setChange(false)
      requestAnimationFrame(() => setChange(true))
    })
    return off
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
    // Le relâché s'est perdu (macOS ne l'envoie pas toujours à une fenêtre sans focus,
    // surtout quand l'humeur change au même moment) : sans ça, la bulle restait collée
    // à la souris jusqu'au clic suivant.
    if (!(e.buttons & 1)) { glisse.current = null; setPresse(false); return }
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
      window.api.bulleClic()
    }
  }

  return (
    <div
      className={`bulle ${humeur === 'accord' ? 'ping' : ''} ${presse ? 'presse' : ''} ${rebond ? 'clic' : ''} ${change ? 'change' : ''}`}
      style={{ '--mood': COULEURS[humeur] } as React.CSSProperties}
      title={NOMS[humeur]}
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onPointerCancel={() => { glisse.current = null; setPresse(false) }}
      onAnimationEnd={(e) => {
        if (e.animationName === 'change') setChange(false)
        if (e.animationName === 'rebond') setRebond(false)
      }}
      onContextMenu={(e) => { e.preventDefault(); window.api.bulleMenu() }}
    >
      {espece && <video className="debord" src={bulleAnimee(espece)} muted loop autoPlay playsInline />}
      {clic > 0 && (
        // La clé change à chaque clic : l'onde et les gouttes repartent de zéro (la vidéo, elle, ne bouge pas).
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
