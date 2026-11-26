// Le poulpe 2D validé (24/11), partagé par refonte-2d.html et projets-calme.html.
const HUMEURS = {
  repos:     { nom: 'Repos',     c: ['#B7A6F5', '#FF9ED8', '#8FD3FF'], arc: '#7C66D9', halo: '#C9BCFF' },
  ecoute:    { nom: 'Écoute',    c: ['#3CC8F2', '#8FF0FF', '#B7A6F5'], arc: '#1BA9D6', halo: '#A8E6FF' },
  reflechit: { nom: 'Réfléchit', c: ['#FF6FB5', '#B7A6F5', '#FFB3D9'], arc: '#E0479A', halo: '#FFC2E2' },
  bosse:     { nom: 'Bosse',     c: ['#FF9A3C', '#FF6FB5', '#FFD27A'], arc: '#F07A12', halo: '#FFD0A6' },
  accord:    { nom: 'Demande',   c: ['#FFC933', '#FFE58A', '#FF9A3C'], arc: '#D9A100', halo: '#FFE7A3' },
  fini:      { nom: 'Fini',      c: ['#3DDC84', '#8FF0C0', '#3CC8F2'], arc: '#1FB565', halo: '#B5F2CF' },
}
const fige = location.search.includes('fige') // captures sans écran : tout à l'état final
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
let humeur = 'repos'

// ── Couleurs : l'humeur glisse d'une palette à l'autre au lieu de sauter ──
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mel = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const css = (c, al = 1) => `rgba(${c.map(Math.round).join(',')},${al})`
const BLANC = [255, 255, 255], NUIT = [27, 21, 48]
let pal = HUMEURS.repos.c.map(rgb), cible = pal
let souris = [innerWidth / 2, innerHeight / 2]
addEventListener('pointermove', e => souris = [e.clientX, e.clientY])

function toile(cv, w, h) {
  const d = devicePixelRatio || 1
  cv.width = w * d; cv.height = h * d; cv.style.width = w + 'px'; cv.style.height = h + 'px'
  const c = cv.getContext('2d'); c.scale(d, d); return c
}

// Le poulpe est noir d'encre (tirant sur le violet). Il est grand, coupé par le cadre : il passe une tête
// dans la fenêtre et laisse traîner ses bras, au lieu de poser au centre comme un logo.
const ENCRE = [30, 18, 54]
let nuit = false
const charge = src => Object.assign(new Image(), { src }), pret = im => im.complete && im.naturalWidth
const TETE = charge('tete.png') // la tête dessinée par Lucas, détourée
const lim = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))

// Contour : la silhouette de la tête teintée, posée en couronne derrière elle.
const lis = document.createElement('canvas'), cLis = lis.getContext('2d')
function teinte(col) {
  if (lis.width !== TETE.width) { lis.width = TETE.width; lis.height = TETE.height }
  cLis.globalCompositeOperation = 'copy'; cLis.drawImage(TETE, 0, 0)
  cLis.globalCompositeOperation = 'source-in'; cLis.fillStyle = col; cLis.fillRect(0, 0, lis.width, lis.height)
}
// Repère de la tête : origine au centre du dôme ; W = largeur, etire = allongement, incl = penché.
function repere(c, x, y, W, incl, etire) { c.translate(x, y); c.rotate(incl); c.scale(W / 579, W / 579 * etire) }
function anneau(c, x, y, W, incl, etire) {
  c.save(); repere(c, x, y, W, incl, etire)
  const d = 2.6 * 579 / W
  for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; c.drawImage(lis, -290 + Math.cos(an) * d, -250 + Math.sin(an) * d) }
  c.restore()
}
const plein = document.createElement('canvas')
function tete(c, cv, x, y, W, incl, etire, fs, fx = -.1) {
  if (!pret(TETE)) return
  c.save(); repere(c, x, y, W, incl, etire)
  // Silhouette pleine : la forme du dessin, sans ses reflets. Une forme noire et un visage, rien d'autre.
  if (plein.width !== TETE.width) {
    plein.width = TETE.width; plein.height = TETE.height; const p = plein.getContext('2d')
    p.drawImage(TETE, 0, 0); p.globalCompositeOperation = 'source-in'; p.fillStyle = css(ENCRE); p.fillRect(0, 0, plein.width, plein.height)
  }
  c.drawImage(plein, -290, -250)
  c.restore()
  // Le visage n'est pas étiré avec le crâne : il reste rond. Bas et un peu à gauche, tourné vers le champ.
  c.save(); c.translate(x, y); c.rotate(incl * .6)
  c.translate(W * fx, W * .2 * etire)
  yeux(c, cv, W * .036 * fs)
  c.restore()
}

// ── Le visage : petit, deux yeux ovales et un sourire minuscule. Chaque humeur est un jeu de réglages,
// et le visage glisse vers eux sur un ressort : rien ne saute.
// ouv : œil ouvert · k : taille · paup : paupière du haut · biais : paupière en V · sourcil, arc : sourcils
// joie : yeux en arc · pup : pupille · suit : suit la souris (sinon gx, gy) · bw, bc, bz, be : bouche, en part de l'œil
const VISAGES = {
  repos:     { ouv: 1, k: 1,    paup: 0,   biais: 0,   sourcil: 0,  arc: 0,  joie: 0, pup: .8,  suit: 1,  gx: -.3, gy: 0,   bw: .7,  bc: .35, bz: 0,   be: .28 },
  ecoute:    { ouv: 1, k: 1.1,  paup: 0,   biais: 0,   sourcil: 0,  arc: 0,  joie: 0, pup: .8,  suit: .3, gx: 0,   gy: -.7, bw: .5,  bc: .2,  bz: 0,   be: .28 },
  reflechit: { ouv: 1, k: 1,    paup: .45, biais: 0,   sourcil: .8, arc: 1,  joie: 0, pup: .75, suit: 0,  gx: .5,  gy: -.4, bw: .8,  bc: 0,   bz: .18, be: .2 },
  bosse:     { ouv: 1, k: 1,    paup: .3,  biais: .5,  sourcil: .9, arc: .1, joie: 0, pup: .8,  suit: .2, gx: -.5, gy: .4,  bw: .5,  bc: .05, bz: 0,   be: .28 },
  accord:    { ouv: 1, k: 1.2,  paup: 0,   biais: 0,   sourcil: 0,  arc: 0,  joie: 0, pup: .7,  suit: .5, gx: 0,   gy: 0,   bw: .1,  bc: 0,   bz: 0,   be: .75 },
  fini:      { ouv: 1, k: 1,    paup: 0,   biais: 0,   sourcil: 0,  arc: 0,  joie: 1, pup: .8,  suit: 0,  gx: 0,   gy: 0,   bw: 1.1, bc: .8,  bz: 0,   be: .35 },
}
const vis = { ...VISAGES.repos }, vit = Object.fromEntries(Object.keys(vis).map(k => [k, 0]))
function ressorts(dt) { // un peu sous-amorti : le visage dépasse à peine sa cible, ça le rend vivant
  const C = VISAGES[humeur]
  for (const k in vis) { vit[k] += ((C[k] - vis[k]) * 170 - vit[k] * 17) * dt; vis[k] += vit[k] * dt }
}
// Clignement : une vraie courbe (fermeture rapide, réouverture plus lente), parfois double.
function paupiere(t) {
  const p = t % 4.3, q = (t + 2.1) % 9.7, f = (p, d) => p < d ? Math.sin(Math.PI * Math.pow(p / d, .7)) : 0
  return 1 - Math.max(f(p, .2), f(q, .18) * (Math.floor(t / 9.7) % 2))
}
let ouvert = 1

// ?yeux=cartoon|actuel|grands|iris : variantes à comparer.
const YEUX = new URLSearchParams(location.search).get('yeux') || 'cartoon'
function yeux(c, cv, e) {
  const V = vis, G = YEUX !== 'actuel', kk = G ? 1.45 : 1
  // Regard : vers la souris ou vers un point fixe selon l'humeur, toujours amorti (par toile).
  const r = cv.getBoundingClientRect(), dx = souris[0] - (r.left + r.width / 2), dy = souris[1] - (r.top + r.height / 2), n = Math.hypot(dx, dy) || 1
  const s = lim(V.suit), cx = (dx / n) * s + V.gx * (1 - s), cy = (dy / n) * s + V.gy * (1 - s)
  const g = cv._regard ??= [cx, cy]; g[0] += (cx - g[0]) * .12; g[1] += (cy - g[1]) * .12
  const joie = lim(V.joie), ouv = lim(V.ouv) * (1 - joie * .97) * ouvert
  const blanc = 'rgba(255,255,255,.96)'
  c.lineCap = c.lineJoin = 'round'
  for (const sd of [-1, 1]) {
    const w = e * .78 * V.k * kk, hp = e * 1.3 * V.k * kk, h = hp * Math.max(.04, ouv)
    c.save(); c.translate(sd * e * (G ? 2.6 : 2.3), G ? -e * .5 : 0)
    if (joie > .02) { // yeux de joie : un arc qui monte à mesure que l'œil se ferme
      c.strokeStyle = `rgba(255,255,255,${joie})`; c.lineWidth = Math.max(1.3, e * .45)
      c.beginPath(); c.arc(0, e * .5, w * 1.2, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
    }
    if (ouv > .03) {
      c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); c.fillStyle = blanc; c.fill(); c.save(); c.clip()
      // Grosse pupille ovale qui laisse un liseré blanc, et un reflet : l'œil du croquis.
      // Grands yeux : la pupille remplit presque l'œil et bouge peu, sinon le regard part en coin.
      const pr = w * (G ? .88 : V.pup), px = g[0] * (w - pr) * (G ? .6 : 1.2), py = g[1] * (hp - pr * 1.3) * (G ? .4 : .7)
      if (YEUX === 'cartoon') {
        // Œil de vieux cartoon : pupille haute et noire, entaillée d'une part de tarte qui fait le reflet.
        const qw = w * .58, qh = hp * .66, qx = g[0] * w * .35, qy = hp * .18 + g[1] * hp * .2
        c.fillStyle = css(ENCRE); c.beginPath(); c.moveTo(qx, qy)
        c.ellipse(qx, qy, qw, qh, 0, -Math.PI * .14, -Math.PI * .4 + Math.PI * 2); c.closePath(); c.fill()
      } else {
      if (YEUX === 'iris') { c.fillStyle = '#A994F0'; c.beginPath(); c.ellipse(px, py, pr, pr * 1.3, 0, 0, Math.PI * 2); c.fill() }
      const pp = YEUX === 'iris' ? pr * .58 : pr
      c.fillStyle = css(ENCRE); c.beginPath(); c.ellipse(px, py, pp, pp * 1.3, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = blanc; c.beginPath(); c.ellipse(px - pr * .3, py - pr * .45, pr * .32, pr * .42, 0, 0, Math.PI * 2); c.fill()
      if (G) { c.beginPath(); c.ellipse(px + pr * .38, py + pr * .5, pr * .13, pr * .16, 0, 0, Math.PI * 2); c.fill() }
      }
      const yl = -hp + 2 * hp * lim(V.paup) * 1.02, inc = V.biais * hp * .5 // paupière, en V quand il est concentré
      if (V.paup > .01) {
        c.fillStyle = css(ENCRE); c.beginPath(); c.moveTo(-w * 2, -hp * 2); c.lineTo(w * 2, -hp * 2)
        c.lineTo(w * 2, yl - sd * inc * 2); c.lineTo(-w * 2, yl + sd * inc * 2); c.fill()
      }
      c.restore()
    }
    if (V.sourcil > .02) {
      const yb = -hp * 1.45, inc = V.biais * hp * .45
      c.strokeStyle = `rgba(255,255,255,${lim(V.sourcil)})`; c.lineWidth = Math.max(1.1, e * .28)
      c.beginPath(); c.moveTo(sd * w * 1.4, yb - inc); c.quadraticCurveTo(0, yb - hp * .5 * V.arc, -sd * w * 1.4, yb + inc); c.stroke()
    }
    c.restore()
  }
  // Bouche : une seule ligne qui se courbe, ondule, s'épaissit en « o » ou se remplit en sourire.
  const my = e * 1.9, mw = V.bw * e, ep = Math.max(1.1, V.be * e)
  const pt = u => [u * mw, my + V.bc * e * (1 - u * u) + V.bz * e * Math.sin(u * Math.PI * 3)]
  c.beginPath(); for (let i = 0; i <= 24; i++) c.lineTo(...pt(-1 + i / 12))
  c.strokeStyle = c.fillStyle = blanc; c.lineWidth = ep
  if (V.bc > .3) c.fill()
  c.stroke()
}

// ── Les bras : de longs tentacules qui sortent du cadre, chacun tracé d'un seul contour lisse.
// Un fin liseré de la couleur du fond les sépare quand ils se croisent. Aucun reflet ni motif : une forme noire.
// Un vrai tentacule : la courbure s'accumule de la base vers le bout, et une onde la parcourt en descendant.
// phase : intégrée image par image, pour que changer de vitesse ne fasse jamais sauter les bras.
function membre(b, phase, ampl, ox, oy, pousse = 1) {
  const L = b.L * pousse, N = Math.max(6, Math.round(L / 4)), pts = []
  let x = ox, y = oy, a = b.a
  for (let i = 0; i <= N; i++) {
    const u = i / N
    pts.push([x, y, a, b.r * (1 - .6 * u)])
    // La base reste ancrée sous la tête (sinon les bras fusionnent en colonne), l'onde grandit vers le bout : des S qui descendent le long du bras, plus un lent balancement d'ensemble.
    const onde = Math.sin(phase * 1.3 + b.ph - u * 7) + .5 * Math.sin(phase * .8 + b.ph * 1.7 - u * 11)
    const balance = i ? 0 : Math.sin(phase * .45 + b.ph) * ampl * .3
    a += balance + (b.courbe * 3 * u * u * (1 + .2 * Math.sin(phase * .5 + b.ph)) + onde * ampl * 9 * (.25 + u)) / N
    x += Math.cos(a) * L / N; y += Math.sin(a) * L / N
  }
  return pts
}
function contour(c, pts) {
  const g = [], d = []
  for (const [x, y, a, r] of pts) { const nx = -Math.sin(a) * r, ny = Math.cos(a) * r; g.push([x + nx, y + ny]); d.push([x - nx, y - ny]) }
  const [xe, ye, ae, re] = pts.at(-1), [x0, y0, a0, r0] = pts[0]
  c.beginPath(); c.moveTo(...g[0]); g.forEach(p => c.lineTo(...p))
  c.arc(xe, ye, re, ae + Math.PI / 2, ae - Math.PI / 2, true)
  for (let i = d.length - 1; i >= 0; i--) c.lineTo(...d[i])
  c.arc(x0, y0, r0, a0 - Math.PI / 2, a0 + Math.PI / 2, true); c.closePath()
}
function dessineBras(c, pts, b, fond) {
  contour(c, pts); c.lineJoin = 'round'
  c.strokeStyle = fond; c.lineWidth = 5; c.stroke()
  c.fillStyle = css(ENCRE); c.fill()
}

// Bras du plein écran, du fond vers l'avant. Le 5e, long, va s'enrouler sous les suggestions (amp : il ondule moins, pour ne jamais les couvrir). lx : départ sous la tête (repère de la tête).
const BRAS = [
  // Trois bras du fond, plus fins : un poulpe en a huit.
  { lx: 80,  a: Math.PI * .22, L: 480, r: 26, courbe: -.8, ph: .4, cote: -1 },
  { lx: 20,  a: Math.PI * .4,  L: 500, r: 27, courbe: .7,  ph: 2.8, cote: -1 },
  { lx: -48, a: Math.PI * .6,  L: 500, r: 27, courbe: -.6, ph: 5.7, cote: 1, amp: .7 },
  { lx: 66,  a: Math.PI * .36, L: 520, r: 30, courbe: -1.1, ph: 4.2, cote: -1 },
  { lx: -66, a: Math.PI * .62, L: 520, r: 31, courbe: 2.6, amp: .45,  ph: 1.3, cote: 1 },
  { lx: 36,  a: Math.PI * .44, L: 520, r: 32, courbe: -.5,  ph: 3.4, cote: -1 },
  { lx: -32, a: Math.PI * .56, L: 520, r: 33, courbe: .5,   ph: 2.1, cote: 1 },
  { lx: 4,   a: Math.PI * .5,  L: 520, r: 34, courbe: -.1,  ph: 5.1, cote: -1 },
]
const TX = 465, TY = 250, TW = 236, ETIRE = 1.22, INCL = .2
