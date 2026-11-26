import type { Humeur } from '@shared/types'
import { COULEURS } from './poulpe'
import teteSrc from './assets/tete.png'

/**
 * Le poulpe 2D validé par Lucas le 24/11 (design/refonte-2d.html, design/projets-calme.html) :
 * une forme noire pleine et un visage, 8 bras qui ondulent, rien d'autre.
 * « coin » : il monte du coin bas droit de l'accueil, derrière le contenu, ses bras sortent du cadre.
 * « guetteur » : en conversation, la tête seule dépasse au-dessus du bout du champ.
 * « bulle » : la tête remplit le rond de la bulle (l'anneau d'humeur est en CSS autour).
 */
export type Pose = 'coin' | 'guetteur' | 'bulle'
export interface Poulpe2D { humeur(h: Humeur): void; detruire(): void }

const ENCRE = [30, 18, 54]
const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const css = (c: number[], al = 1): string => `rgba(${c.map(Math.round).join(',')},${al})`
const lim = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v))

const TETE = Object.assign(new Image(), { src: teteSrc }) // la tête dessinée par Lucas, détourée
const pret = (): boolean => TETE.complete && TETE.naturalWidth > 0

// Contour : la silhouette de la tête teintée, posée en couronne derrière elle.
const lis = document.createElement('canvas'), cLis = lis.getContext('2d')!
function teinte(col: string): void {
  if (lis.width !== TETE.width) { lis.width = TETE.width; lis.height = TETE.height }
  cLis.globalCompositeOperation = 'copy'; cLis.drawImage(TETE, 0, 0)
  cLis.globalCompositeOperation = 'source-in'; cLis.fillStyle = col; cLis.fillRect(0, 0, lis.width, lis.height)
}
// Repère de la tête : origine au centre du dôme ; W = largeur, etire = allongement, incl = penché.
function repere(c: CanvasRenderingContext2D, x: number, y: number, W: number, incl: number, etire: number): void {
  c.translate(x, y); c.rotate(incl); c.scale(W / 579, (W / 579) * etire)
}
function anneau(c: CanvasRenderingContext2D, x: number, y: number, W: number, incl: number, etire: number): void {
  c.save(); repere(c, x, y, W, incl, etire)
  const d = (2.6 * 579) / W
  for (let i = 0; i < 8; i++) { const an = (i * Math.PI) / 4; c.drawImage(lis, -290 + Math.cos(an) * d, -250 + Math.sin(an) * d) }
  c.restore()
}
// Silhouette pleine : la forme du dessin, sans ses reflets.
const plein = document.createElement('canvas')
function tete(c: CanvasRenderingContext2D, cv: HTMLCanvasElement, s: Etat, x: number, y: number, W: number, incl: number, etire: number, fs: number, fx = -0.1): void {
  if (!pret()) return
  c.save(); repere(c, x, y, W, incl, etire)
  if (plein.width !== TETE.width) {
    plein.width = TETE.width; plein.height = TETE.height; const p = plein.getContext('2d')!
    p.drawImage(TETE, 0, 0); p.globalCompositeOperation = 'source-in'; p.fillStyle = css(ENCRE); p.fillRect(0, 0, plein.width, plein.height)
  }
  c.drawImage(plein, -290, -250)
  c.restore()
  // Le visage n'est pas étiré avec le crâne : il reste rond.
  c.save(); c.translate(x, y); c.rotate(incl * 0.6)
  c.translate(W * fx, W * 0.2 * etire)
  yeux(c, cv, s, W * 0.036 * fs)
  c.restore()
}

// ── Le visage : chaque humeur est un jeu de réglages, et le visage glisse vers eux sur un ressort.
// ouv : œil ouvert · k : taille · paup : paupière · biais : paupière en V · sourcil, arc : sourcils · joie : yeux en arc
// suit : suit la souris (sinon gx, gy) · bw, bc, bz, be : bouche, en part de l'œil
type Visage = Record<'ouv' | 'k' | 'paup' | 'biais' | 'sourcil' | 'arc' | 'joie' | 'pup' | 'suit' | 'gx' | 'gy' | 'bw' | 'bc' | 'bz' | 'be', number>
const VISAGES: Record<Humeur, Visage> = {
  repos:     { ouv: 1, k: 1,   paup: 0,   biais: 0,  sourcil: 0,  arc: 0,  joie: 0, pup: 0.8,  suit: 1,   gx: -0.3, gy: 0,    bw: 0.7, bc: 0.35, bz: 0,    be: 0.28 },
  ecoute:    { ouv: 1, k: 1.1, paup: 0,   biais: 0,  sourcil: 0,  arc: 0,  joie: 0, pup: 0.8,  suit: 0.3, gx: 0,    gy: -0.7, bw: 0.5, bc: 0.2,  bz: 0,    be: 0.28 },
  reflechit: { ouv: 1, k: 1,   paup: 0.45, biais: 0, sourcil: 0.8, arc: 1, joie: 0, pup: 0.75, suit: 0,   gx: 0.5,  gy: -0.4, bw: 0.8, bc: 0,    bz: 0.18, be: 0.2 },
  bosse:     { ouv: 1, k: 1,   paup: 0.3, biais: 0.5, sourcil: 0.9, arc: 0.1, joie: 0, pup: 0.8, suit: 0.2, gx: -0.5, gy: 0.4,  bw: 0.5, bc: 0.05, bz: 0,    be: 0.28 },
  accord:    { ouv: 1, k: 1.2, paup: 0,   biais: 0,  sourcil: 0,  arc: 0,  joie: 0, pup: 0.7,  suit: 0.5, gx: 0,    gy: 0,    bw: 0.1, bc: 0,    bz: 0,    be: 0.75 },
  fini:      { ouv: 1, k: 1,   paup: 0,   biais: 0,  sourcil: 0,  arc: 0,  joie: 1, pup: 0.8,  suit: 0,   gx: 0,    gy: 0,    bw: 1.1, bc: 0.8,  bz: 0,    be: 0.35 },
  // Il écrit ses notes : regard baissé, concentré.
  note:      { ouv: 1, k: 1,   paup: 0.35, biais: 0, sourcil: 0,  arc: 0,  joie: 0, pup: 0.8,  suit: 0,   gx: -0.3, gy: 0.8,  bw: 0.5, bc: 0.1,  bz: 0,    be: 0.28 }
}
// Vitesse et ampleur des bras selon l'humeur.
const VITESSE: Record<Humeur, number> = { repos: 1.1, ecoute: 1.4, reflechit: 1.2, bosse: 3, accord: 2, fini: 1.8, note: 0.9 }
const AMPLEUR: Record<Humeur, number> = { repos: 0.3, ecoute: 0.26, reflechit: 0.32, bosse: 0.42, accord: 0.36, fini: 0.34, note: 0.24 }

interface Etat { vis: Visage; vit: Visage; regard: [number, number] | null; ouvert: number }
let souris: [number, number] = [innerWidth / 2, innerHeight / 2]
addEventListener('pointermove', (e) => { souris = [e.clientX, e.clientY] })

function yeux(c: CanvasRenderingContext2D, cv: HTMLCanvasElement, s: Etat, e: number): void {
  const V = s.vis
  // Regard : vers la souris ou vers un point fixe selon l'humeur, toujours amorti.
  const r = cv.getBoundingClientRect(), dx = souris[0] - (r.left + r.width / 2), dy = souris[1] - (r.top + r.height / 2), n = Math.hypot(dx, dy) || 1
  const sv = lim(V.suit), cx = (dx / n) * sv + V.gx * (1 - sv), cy = (dy / n) * sv + V.gy * (1 - sv)
  const g = (s.regard ??= [cx, cy]); g[0] += (cx - g[0]) * 0.12; g[1] += (cy - g[1]) * 0.12
  const joie = lim(V.joie), ouv = lim(V.ouv) * (1 - joie * 0.97) * s.ouvert
  const blanc = 'rgba(255,255,255,.96)'
  c.lineCap = c.lineJoin = 'round'
  for (const sd of [-1, 1]) {
    const w = e * 0.78 * V.k * 1.45, hp = e * 1.3 * V.k * 1.45, h = hp * Math.max(0.04, ouv)
    c.save(); c.translate(sd * e * 2.6, -e * 0.5)
    if (joie > 0.02) { // yeux de joie : un arc qui monte à mesure que l'œil se ferme
      c.strokeStyle = `rgba(255,255,255,${joie})`; c.lineWidth = Math.max(1.3, e * 0.45)
      c.beginPath(); c.arc(0, e * 0.5, w * 1.2, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
    }
    if (ouv > 0.03) {
      c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); c.fillStyle = blanc; c.fill(); c.save(); c.clip()
      // Œil de vieux cartoon : pupille haute et noire, entaillée d'une part de tarte qui fait le reflet.
      const qw = w * 0.58, qh = hp * 0.66, qx = g[0] * w * 0.35, qy = hp * 0.18 + g[1] * hp * 0.2
      c.fillStyle = css(ENCRE); c.beginPath(); c.moveTo(qx, qy)
      c.ellipse(qx, qy, qw, qh, 0, -Math.PI * 0.14, -Math.PI * 0.4 + Math.PI * 2); c.closePath(); c.fill()
      const yl = -hp + 2 * hp * lim(V.paup) * 1.02, inc = V.biais * hp * 0.5 // paupière, en V quand il est concentré
      if (V.paup > 0.01) {
        c.fillStyle = css(ENCRE); c.beginPath(); c.moveTo(-w * 2, -hp * 2); c.lineTo(w * 2, -hp * 2)
        c.lineTo(w * 2, yl - sd * inc * 2); c.lineTo(-w * 2, yl + sd * inc * 2); c.fill()
      }
      c.restore()
    }
    if (V.sourcil > 0.02) {
      const yb = -hp * 1.45, inc = V.biais * hp * 0.45
      c.strokeStyle = `rgba(255,255,255,${lim(V.sourcil)})`; c.lineWidth = Math.max(1.1, e * 0.28)
      c.beginPath(); c.moveTo(sd * w * 1.4, yb - inc); c.quadraticCurveTo(0, yb - hp * 0.5 * V.arc, -sd * w * 1.4, yb + inc); c.stroke()
    }
    c.restore()
  }
  // Bouche : une seule ligne qui se courbe, ondule, s'épaissit en « o » ou se remplit en sourire.
  const my = e * 1.9, mw = V.bw * e, ep = Math.max(1.1, V.be * e)
  const pt = (u: number): [number, number] => [u * mw, my + V.bc * e * (1 - u * u) + V.bz * e * Math.sin(u * Math.PI * 3)]
  c.beginPath(); for (let i = 0; i <= 24; i++) c.lineTo(...pt(-1 + i / 12))
  c.strokeStyle = c.fillStyle = blanc; c.lineWidth = ep
  if (V.bc > 0.3) c.fill()
  c.stroke()
}

// ── Les bras : un vrai tentacule, la courbure s'accumule de la base vers le bout et une onde le parcourt.
interface Bras { lx: number; a: number; L: number; r: number; courbe: number; ph: number; amp?: number }
function membre(b: Bras, phase: number, ampl: number, ox: number, oy: number): [number, number, number, number][] {
  const N = Math.max(6, Math.round(b.L / 4)), pts: [number, number, number, number][] = []
  let x = ox, y = oy, a = b.a
  for (let i = 0; i <= N; i++) {
    const u = i / N
    pts.push([x, y, a, b.r * (1 - 0.6 * u)])
    // La base reste ancrée sous la tête (sinon les bras fusionnent en colonne), l'onde grandit vers le bout.
    const onde = Math.sin(phase * 1.3 + b.ph - u * 7) + 0.5 * Math.sin(phase * 0.8 + b.ph * 1.7 - u * 11)
    const balance = i ? 0 : Math.sin(phase * 0.45 + b.ph) * ampl * 0.3
    a += balance + (b.courbe * 3 * u * u * (1 + 0.2 * Math.sin(phase * 0.5 + b.ph)) + onde * ampl * 9 * (0.25 + u)) / N
    x += (Math.cos(a) * b.L) / N; y += (Math.sin(a) * b.L) / N
  }
  return pts
}
function dessineBras(c: CanvasRenderingContext2D, pts: [number, number, number, number][], fond: string): void {
  const g: [number, number][] = [], d: [number, number][] = []
  for (const [x, y, a, r] of pts) { const nx = -Math.sin(a) * r, ny = Math.cos(a) * r; g.push([x + nx, y + ny]); d.push([x - nx, y - ny]) }
  const [xe, ye, ae, re] = pts[pts.length - 1], [x0, y0, a0, r0] = pts[0]
  c.beginPath(); c.moveTo(...g[0]); g.forEach((p) => c.lineTo(...p))
  c.arc(xe, ye, re, ae + Math.PI / 2, ae - Math.PI / 2, true)
  for (let i = d.length - 1; i >= 0; i--) c.lineTo(...d[i])
  c.arc(x0, y0, r0, a0 - Math.PI / 2, a0 + Math.PI / 2, true); c.closePath()
  // Un fin liseré de la couleur du fond sépare les bras quand ils se croisent.
  c.lineJoin = 'round'; c.strokeStyle = fond; c.lineWidth = 5; c.stroke()
  c.fillStyle = css(ENCRE); c.fill()
}
// Du fond vers l'avant. Trois bras du fond plus fins ; le 5e, long, s'enroule vers la gauche.
const BRAS: Bras[] = [
  { lx: 80, a: Math.PI * 0.22, L: 480, r: 26, courbe: -0.8, ph: 0.4 },
  { lx: 20, a: Math.PI * 0.4, L: 500, r: 27, courbe: 0.7, ph: 2.8 },
  { lx: -48, a: Math.PI * 0.6, L: 500, r: 27, courbe: -0.6, ph: 5.7, amp: 0.7 },
  { lx: 66, a: Math.PI * 0.36, L: 520, r: 30, courbe: -1.1, ph: 4.2 },
  { lx: -66, a: Math.PI * 0.62, L: 520, r: 31, courbe: 2.6, amp: 0.45, ph: 1.3 },
  { lx: 36, a: Math.PI * 0.44, L: 520, r: 32, courbe: -0.5, ph: 3.4 },
  { lx: -32, a: Math.PI * 0.56, L: 520, r: 33, courbe: 0.5, ph: 2.1 },
  { lx: 4, a: Math.PI * 0.5, L: 520, r: 34, courbe: -0.1, ph: 5.1 }
]
// La scène du coin est pensée dans un carré de 640 : tête en (465, 250), large de 236, penchée.
const TX = 465, TY = 250, TW = 236, ETIRE = 1.22, INCL = 0.2

export function creerPoulpe2D(cv: HTMLCanvasElement, pose: Pose, depart: Humeur = 'repos'): Poulpe2D {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
  const sombre = matchMedia('(prefers-color-scheme: dark)')
  let humeur = depart
  const s: Etat = { vis: { ...VISAGES[depart] }, vit: Object.fromEntries(Object.keys(VISAGES.repos).map((k) => [k, 0])) as Visage, regard: null, ouvert: 1 }
  let pal = rgb(COULEURS[depart])
  let c = cv.getContext('2d')!, w = 0, h = 0
  const taille = (): void => {
    const d = devicePixelRatio || 1, r = cv.getBoundingClientRect()
    w = r.width; h = r.height; cv.width = Math.round(w * d); cv.height = Math.round(h * d)
    c = cv.getContext('2d')!; c.setTransform(d, 0, 0, d, 0, 0)
  }
  const obs = new ResizeObserver(taille); obs.observe(cv); taille()

  let phase = 0, vS = VITESSE[depart], aS = AMPLEUR[depart], avant = performance.now(), debut = avant, raf = 0
  const ressort = (u: number): number => (u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2)) // dépasse un peu puis revient
  const image = (now: number): void => {
    raf = requestAnimationFrame(image)
    if (!w || !h) return
    const dt = Math.min(0.05, (now - avant) / 1000); avant = now
    const t = reduit ? 0 : now / 1000
    pal = pal.map((v, i) => v + (rgb(COULEURS[humeur])[i] - v) * 0.06)
    const C = VISAGES[humeur]
    if (reduit) Object.assign(s.vis, C)
    else for (const k in s.vis) { const q = k as keyof Visage; s.vit[q] += ((C[q] - s.vis[q]) * 170 - s.vit[q] * 17) * dt; s.vis[q] += s.vit[q] * dt }
    // Clignement : fermeture rapide, réouverture plus lente, parfois double.
    const p = t % 4.3, q = (t + 2.1) % 9.7, f = (x: number, d: number): number => (x < d ? Math.sin(Math.PI * Math.pow(x / d, 0.7)) : 0)
    s.ouvert = reduit ? 1 : 1 - Math.max(f(p, 0.2), f(q, 0.18) * (Math.floor(t / 9.7) % 2))
    const kk = 1 - Math.exp(-dt * 2.5); vS += (VITESSE[humeur] - vS) * kk; aS += (AMPLEUR[humeur] - aS) * kk
    if (!reduit) phase += dt * vS
    // Le liseré prend la couleur du fond (il sépare les bras) ; en sombre, la couleur d'humeur, pour détacher le poulpe.
    const nuit = sombre.matches
    const fond = nuit ? css(pal) : getComputedStyle(cv.parentElement ?? cv).backgroundColor || '#fff'
    if (pret()) teinte(fond === 'rgba(0, 0, 0, 0)' ? '#fff' : fond)
    c.clearRect(0, 0, w, h)
    if (pose === 'bulle') {
      // Repris de refonte-2d.html (rond intérieur de 48) : la tête déborde, le cercle la recadre.
      const f = w / 96
      c.save(); c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.clip()
      tete(c, cv, s, w / 2 + Math.sin(t * 1.3) * f, h / 2 + (-22 + Math.sin(t * 1.5) * 1.5) * f, 160 * f, Math.sin(t * 0.9) * 0.03, 1.05, 1.15, 0)
      c.restore()
      return
    }
    if (pose === 'guetteur') {
      const gy = h * 0.52 + Math.sin(t * 1.2) * 3, W = Math.min(w, h) * 0.92
      if (nuit && pret()) anneau(c, w / 2, gy, W, -0.12, 1.1)
      tete(c, cv, s, w / 2, gy, W, -0.12, 1.1, 1.5, 0)
      return
    }
    // Coin : il monte du coin à l'ouverture, puis flotte et respire. « Fini » : petits sauts de joie.
    const k = w > 700 ? 0.9 : 0.42
    const monte = reduit ? 1 : Math.max(0, ressort(Math.min(1, (now - debut) / 900)))
    const flotte = Math.sin(t * 1.2) * 5 - lim(s.vis.joie) * Math.abs(Math.sin(t * 5)) * 16
    const incl = INCL + Math.sin(t * 0.9) * 0.03, cs = Math.cos(incl), sn = Math.sin(incl), ly = 90
    c.save(); c.translate(w - (640 - TX) * k, h - (640 - TY) * k + (1 - monte) * 420 * k); c.scale(k, k)
    const hx = 0, hy = flotte
    if (pret()) anneau(c, hx, hy, TW, incl, ETIRE)
    for (const B of BRAS) dessineBras(c, membre({ ...B, a: B.a + incl * 0.5 }, phase, aS * (B.amp ?? 1), hx + B.lx * cs - ly * sn, hy + B.lx * sn + ly * cs), fond)
    tete(c, cv, s, hx, hy, TW, incl, ETIRE, 1)
    c.restore()
  }
  raf = requestAnimationFrame(image)
  return {
    humeur: (x) => { humeur = x },
    detruire: () => { cancelAnimationFrame(raf); obs.disconnect() }
  }
}
