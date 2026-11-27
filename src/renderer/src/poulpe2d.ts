import type { Espece, Humeur } from '@shared/types'
import takoCoinSrc from './assets/tako-coin.webm'
import takoBulleSrc from './assets/tako-bulle.webm'
import takoPortraitSrc from './assets/tako-portrait.png'
import noriCoinSrc from './assets/nori-coin.webm'
import noriBulleSrc from './assets/nori-bulle.webm'
import noriPortraitSrc from './assets/nori-portrait.png'
import momoCoinSrc from './assets/momo-coin.webm'
import momoBulleSrc from './assets/momo-bulle.webm'
import momoPortraitSrc from './assets/momo-portrait.png'

/**
 * Les avatars en 2D (piste validée le 24/11, design/refonte-2d.html). Tako, Nori et Momo sont
 * dessinés à la main par Lucas (26 et 27/11) et animés hors de l'app (design/tako, design/nori,
 * design/momo) en deux boucles transparentes de 4 s : le dessin entier déformé en douceur, son
 * visage et son clignement compris. Rien n'est redessiné en code : on pose la vidéo.
 * « coin » : il monte du coin bas droit de l'accueil, derrière le contenu, et sort du cadre.
 * « guetteur » : en conversation, la bulle sans son rond dépasse au-dessus du bout du champ.
 * « bulle » : la barre d'appel, coupée au rond (la vraie bulle le laisse déborder, `Bulle.tsx`).
 */
export type Pose = 'coin' | 'guetteur' | 'bulle'
export interface Poulpe2D { humeur(h: Humeur): void; detruire(): void }

const lim = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v))

// Créées au premier besoin (le décodage coûte), partagées entre les poses.
const boucles = new Map<string, HTMLVideoElement>()
function boucle(src: string): HTMLVideoElement {
  let v = boucles.get(src)
  if (!v) {
    v = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true })
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) v.currentTime = 0.5
    else void v.play().catch(() => undefined)
    boucles.set(src, v)
  }
  return v
}
const lue = (v: HTMLVideoElement): boolean => v.readyState >= 2

/**
 * Chaque boucle et ses repères. La bulle (264) = la fenêtre de 132 autour du rond de 96.
 * coin : taille de la vidéo et placement dans la scène de 640 (voir `coin`).
 * guette : dans la bulle, haut (y0), ligne qui passe sous le bord du canvas (y1), milieu (x).
 */
interface Anime {
  coin: string; bulle: string; portrait: string
  scene: { w: number; h: number; x: number; y: number; k: number; saut: number }
  guette: { x: number; y0: number; y1: number }
}
const ANIMES: Record<Espece, Anime> = {
  // tako-coin.webm (954 × 858) = le dessin (2160 × 1856) à 0,55 depuis (344, 252) ; la tête,
  // centrée en (1440, 560) et large de 560, va en (465, 250), large de 236 : les bras sortent du cadre.
  poulpe: {
    coin: takoCoinSrc, bulle: takoBulleSrc, portrait: takoPortraitSrc,
    scene: { w: 954, h: 858, x: 465 + (344 - 1440) * (236 / 560), y: 250 + (252 - 560) * (236 / 560), k: 236 / 560 / 0.55, saut: 1 },
    guette: { x: 163, y0: 53, y1: 191 }
  },
  // nori-coin.webm (888 × 954) = le dessin à 0,55 depuis (469, 120) ; la cloche, centrée en
  // (1500, 500), va en (455, 235), à la même échelle que Tako : les filaments sortent par le bas.
  meduse: {
    coin: noriCoinSrc, bulle: noriBulleSrc, portrait: noriPortraitSrc,
    scene: { w: 888, h: 954, x: 455 + (469 - 1500) * 0.4, y: 235 + (120 - 500) * 0.4, k: 0.4 / 0.55, saut: 1 },
    guette: { x: 158, y0: 49, y1: 188 }
  },
  // momo-coin.webm (745 × 870) : debout en bas à droite, pied droit en (725, 856), haut de 822.
  axolotl: {
    coin: momoCoinSrc, bulle: momoBulleSrc, portrait: momoPortraitSrc,
    scene: { w: 745, h: 870, x: 630 - 725 * (500 / 822), y: 640 - 856 * (500 / 822), k: 500 / 822, saut: 0.4 }, // debout : il flotte moins
    guette: { x: 146.5, y0: 49, y1: 228 }
  }
}

/** Plus rien à charger avant d'afficher : les portraits sont des PNG. Gardé pour `main.tsx`. */
export const dessinsPrets = Promise.resolve()
/** La bulle en vidéo, pour `Bulle.tsx` : elle déborde du rond, comme sur les dessins. */
export const bulleAnimee = (e: Espece): string => ANIMES[e].bulle
/** Un portrait fixe de l'avatar dans son rond (fil, choix du compte), tiré de son dessin. */
export const portrait = (e: Espece): string => ANIMES[e].portrait

export function creerPoulpe2D(cv: HTMLCanvasElement, pose: Pose, depart: Humeur = 'repos', espece: Espece = 'poulpe'): Poulpe2D {
  const A = ANIMES[espece]
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
  let humeur = depart
  let c = cv.getContext('2d')!, w = 0, h = 0
  const taille = (): void => {
    const d = devicePixelRatio || 1, r = cv.getBoundingClientRect()
    w = r.width; h = r.height; cv.width = Math.round(w * d); cv.height = Math.round(h * d)
    c = cv.getContext('2d')!; c.setTransform(d, 0, 0, d, 0, 0)
  }
  const obs = new ResizeObserver(taille); obs.observe(cv); taille()

  // « Fini » : petits sauts de joie, qui arrivent et repartent en douceur.
  let joie = humeur === 'fini' ? 1 : 0, avant = performance.now(), raf = 0
  const debut = avant
  const ressort = (u: number): number => (u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2)) // dépasse un peu puis revient
  const image = (now: number): void => {
    raf = requestAnimationFrame(image)
    if (!w || !h) return
    const dt = Math.min(0.05, (now - avant) / 1000); avant = now
    const t = reduit ? 0 : now / 1000
    joie += ((humeur === 'fini' ? 1 : 0) - joie) * (1 - Math.exp(-dt * 6))
    c.clearRect(0, 0, w, h)
    const v = boucle(pose === 'coin' ? A.coin : A.bulle)
    if (!lue(v)) return
    if (pose === 'bulle') {
      c.save(); c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.clip()
      const T = (w * 132) / 96
      c.drawImage(v, (w - T) / 2, (h - T) / 2, T, T)
      c.restore()
      return
    }
    if (pose === 'guetteur') {
      const G = A.guette, k = (h + 6) / (G.y1 - G.y0), dy = Math.sin(t * 1.2) * 3
      c.drawImage(v, w / 2 - G.x * k, h + 6 - G.y1 * k + dy, 264 * k, 264 * k)
      return
    }
    // Coin : il monte du coin à l'ouverture, puis flotte. Scène pensée dans un carré de 640.
    const s = w > 700 ? 0.9 : 0.42
    const monte = reduit ? 1 : Math.max(0, ressort(Math.min(1, (now - debut) / 900)))
    const flotte = Math.sin(t * 1.2) * 5 - lim(joie) * Math.abs(Math.sin(t * 5)) * 16
    const S = A.scene
    c.save(); c.translate(w - 640 * s, h - 640 * s + (1 - monte) * 420 * s); c.scale(s, s)
    c.drawImage(v, S.x, S.y + flotte * S.saut, S.w * S.k, S.h * S.k)
    c.restore()
  }
  raf = requestAnimationFrame(image)
  return {
    humeur: (x) => { humeur = x },
    detruire: () => { cancelAnimationFrame(raf); obs.disconnect() }
  }
}
