import * as THREE from 'three'
// Copie de src/renderer/src/poulpe.ts (l'app) : la garder identique, seuls ces types sont recopiés ici.
export type Humeur = 'repos' | 'ecoute' | 'reflechit' | 'bosse' | 'accord' | 'fini' | 'note'
export type Espece = 'poulpe' | 'meduse' | 'axolotl'

/**
 * Le poulpe d'Encre, d'après le tatouage de Lucas : rendu « dessin animé »
 * (toon + contour d'encre en coque inversée), tête lisse, motifs irezumi
 * (vagues seigaiha + fleurs de cerisier) uniquement sur les tentacules, en
 * trait léger. Visage kawaii : grosses pupilles, regard qui suit à peine la
 * souris. Validé sur la page de pistes (design/pistes.html), à garder tel quel.
 */

export const COULEURS: Record<Humeur, string> = {
  repos: '#B7A6F5', ecoute: '#3CC8F2', reflechit: '#FF6FB5', bosse: '#FF9A3C', accord: '#FFC933', fini: '#3DDC84', note: '#7E8BFF'
}
const LAVANDE = '#B7A6F5'
const ENCRE = '#1B1530'

// ─── Tentacules : tubes effilés recalculés à chaque image ────────────────────

function tube(segs: number, radial: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * (radial + 1) * 3), 3))
  const idx: number[] = []
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j
    idx.push(a, a + 1, b, b, a + 1, b + 1)
  }
  g.setIndex(idx)
  const uv = new Float32Array((segs + 1) * (radial + 1) * 2)
  let q = 0
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) { uv[q++] = i / segs; uv[q++] = j / radial }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

const P = new THREE.Vector3()
function majTube(g: THREE.BufferGeometry, courbe: THREE.CatmullRomCurve3, segs: number, radial: number, r0: number, r1: number): void {
  const fr = courbe.computeFrenetFrames(segs, false)
  const p = g.attributes.position.array as Float32Array
  let k = 0
  for (let i = 0; i <= segs; i++) {
    const u = i / segs
    courbe.getPointAt(u, P)
    let r = r0 + (r1 - r0) * u
    if (u > 0.9) r *= Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2))
    const N = fr.normals[i], B = fr.binormals[i]
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2, c = Math.cos(v), s = Math.sin(v)
      p[k++] = P.x + r * (c * N.x + s * B.x)
      p[k++] = P.y + r * (c * N.y + s * B.y)
      p[k++] = P.z + r * (c * N.z + s * B.z)
    }
  }
  g.attributes.position.needsUpdate = true
  g.computeVertexNormals()
}

// ─── Motif irezumi des tentacules ────────────────────────────────────────────

function sakura(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot: number): void {
  x.save(); x.translate(cx, cy); x.rotate(rot)
  for (let p = 0; p < 5; p++) {
    x.save(); x.rotate((p * Math.PI * 2) / 5)
    x.beginPath(); x.moveTo(0, 0)
    x.bezierCurveTo(-s * 0.55, -s * 0.35, -s * 0.45, -s * 1.05, -s * 0.12, -s * 1.02)
    x.lineTo(0, -s * 0.86); x.lineTo(s * 0.12, -s * 1.02)
    x.bezierCurveTo(s * 0.45, -s * 1.05, s * 0.55, -s * 0.35, 0, 0)
    x.fillStyle = '#FFA9CF'; x.fill(); x.lineWidth = s * 0.11; x.strokeStyle = ENCRE; x.stroke()
    x.restore()
  }
  x.beginPath(); x.arc(0, 0, s * 0.16, 0, Math.PI * 2); x.fillStyle = '#FFE27A'; x.fill(); x.lineWidth = s * 0.08; x.stroke()
  x.restore()
}

function motifTentacules(peau: string, motif: string): THREE.CanvasTexture {
  const w = 512, h = 256, R = 51.2
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = peau; x.fillRect(0, 0, w, h)
  let rang = 0
  for (let y = -R; y < h + R; y += R / 2, rang++) {
    const dec = (rang % 2) * R
    for (let cx = -2 * R + dec; cx < w + 2 * R; cx += 2 * R) {
      x.beginPath(); x.arc(cx, y, R * 0.96, 0, Math.PI * 2); x.fillStyle = peau; x.fill()
      x.strokeStyle = motif; x.lineWidth = R * 0.06
      for (const k of [0.96, 0.6]) { x.beginPath(); x.arc(cx, y, R * k, Math.PI, 0); x.stroke() }
    }
  }
  sakura(x, 140, 128, 34, 0.6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(1.3, 1)
  t.anisotropy = 4
  return t
}

// ─── Le poulpe ───────────────────────────────────────────────────────────────

/**
 * `remplir` : la part du cadre (0 à 1) que le poulpe occupe, mesurée sur sa
 * vraie silhouette. `plongee` : la caméra le regarde un peu d'en haut (radians).
 * `espece`, `peau`, `motif` : la créature de l'avatar et ses couleurs (Tako par défaut).
 */
export type Options = { remplir?: number; plongee?: number; fov?: number; espece?: Espece; peau?: string; motif?: string }

/**
 * Un membre : tentacule, bras, branchie, patte ou queue. Un tube recalculé à
 * chaque image le long de 12 points, avec son contour d'encre. `a` et `b` :
 * ce que sa sorte veut (angle, côté, rang, profondeur).
 */
type Sorte = 'tentacule' | 'filament' | 'bras' | 'branchie' | 'patte' | 'queue'
type Membre = { sorte: Sorte; g: THREE.BufferGeometry; gl: THREE.BufferGeometry; pts: THREE.Vector3[]; courbe: THREE.CatmullRomCurve3; r0: number; r1: number; a: number; b: number; leve: number }
const SEGS = 56, RAD = 14

export type Geste = 'coucou' | 'saut' | 'etire' | 'clins' | 'tour'
export type Poulpe = { humeur: (h: Humeur) => void; geste: (g: Geste) => void; detruire: () => void }

export function creerPoulpe(canvas: HTMLCanvasElement, o: Options = {}): Poulpe {
  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(o.fov ?? 28, 1, 0.1, 50)

  const rampe = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat)
  rampe.minFilter = rampe.magFilter = THREE.NearestFilter
  rampe.needsUpdate = true

  const peau = new THREE.MeshToonMaterial({ color: o.peau ?? LAVANDE, gradientMap: rampe })
  const peauMotif = new THREE.MeshToonMaterial({ map: motifTentacules(o.peau ?? LAVANDE, o.motif ?? '#7E68E3'), gradientMap: rampe })
  const trait = new THREE.MeshBasicMaterial({ color: ENCRE, side: THREE.BackSide })
  const blanc = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe })
  const noir = new THREE.MeshBasicMaterial({ color: 0x111018 })
  const reflet = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const joue = new THREE.MeshBasicMaterial({ color: COULEURS.repos, transparent: true, opacity: 0.9 })
  const accent = new THREE.MeshToonMaterial({ color: o.motif ?? '#7E68E3', gradientMap: rampe })
  const espece = o.espece ?? 'poulpe'

  // Depuis three r155, les intensités sont physiques : ×π par rapport à l'ancien réglage.
  scene.add(new THREE.HemisphereLight(0xffffff, '#5B43D0', 0.6 * Math.PI))
  const soleil = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI)
  soleil.position.set(3, 5, 4)
  scene.add(soleil)

  const racine = new THREE.Group(); scene.add(racine)
  const corps = new THREE.Group(); racine.add(corps)

  const tete = new THREE.Group(); tete.position.y = 0.78; corps.add(tete)
  const sphere = new THREE.SphereGeometry(1, 64, 48)
  // Le crâne : rond pour le poulpe, cloche aplatie pour la méduse, large pour l'axolotl.
  const [cx, cy, cz] = espece === 'meduse' ? [1.15, 0.82, 1.05] : espece === 'axolotl' ? [1.3, 0.88, 1] : [1.1, 0.96, 1]
  const crane = new THREE.Mesh(sphere, peau); crane.scale.set(cx, cy, cz); tete.add(crane)
  const contour = new THREE.Mesh(sphere, trait); contour.scale.set(cx + 0.05, cy + 0.04, cz + 0.04); tete.add(contour)
  /** Une boule de peau cerclée d'encre (festons de la méduse, ventre de l'axolotl). */
  const boule = (parent: THREE.Object3D, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): void => {
    const geo = new THREE.SphereGeometry(r, 24, 18)
    const m = new THREE.Mesh(geo, peau); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m)
    const c = new THREE.Mesh(geo, trait); c.position.copy(m.position); c.scale.set(sx * 1.13, sy * 1.13, sz * 1.13); parent.add(c)
  }

  const yeux = [-1, 1].map((sx) => {
    const g = new THREE.Group(); g.position.set(sx * 0.42, -0.12, 0.86); tete.add(g)
    const geo = new THREE.SphereGeometry(0.24, 32, 24)
    g.add(new THREE.Mesh(geo, blanc))
    const bord = new THREE.Mesh(geo, trait); bord.scale.setScalar(1.12); g.add(bord)
    const pupille = new THREE.Mesh(new THREE.SphereGeometry(0.185, 24, 18), noir); pupille.scale.z = 0.55; g.add(pupille)
    const r1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), reflet); g.add(r1)
    const r2 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), reflet); g.add(r2)
    return { g, pupille, r1, r2 }
  })
  const joues = [-1, 1].map((sx) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), joue)
    m.position.set(sx * 0.74, -0.36, 0.66); m.scale.set(1.25, 0.7, 0.3); m.lookAt(sx * 2, -0.6, 2); tete.add(m)
    return m
  })
  const bouche = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.026, 10, 24, Math.PI), noir)
  bouche.position.set(0, -0.36, 0.94); bouche.rotation.z = Math.PI; tete.add(bouche)

  const membres: Membre[] = []
  const membre = (parent: THREE.Object3D, mat: THREE.Material, sorte: Sorte, r0: number, r1: number, a = 0, b = 0): void => {
    const g = tube(SEGS, RAD), gl = tube(SEGS, RAD)
    parent.add(new THREE.Mesh(g, mat)); parent.add(new THREE.Mesh(gl, trait))
    const pts = Array.from({ length: 12 }, () => new THREE.Vector3())
    membres.push({ sorte, g, gl, pts, courbe: new THREE.CatmullRomCurve3(pts), r0, r1, a, b, leve: 0 })
  }
  /** Les membres qui se lèvent : pour demander l'accord, et pour faire coucou. */
  let iAccord = 1, iCoucou = 2
  const angle = (k: number, n: number): number => ((k + 0.5) / n) * Math.PI * 2 + Math.PI / 2
  if (espece === 'meduse') {
    // Un bord festonné sous la cloche, des filaments fins qui flottent, quatre bras frisés au centre.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      boule(tete, 0.17, Math.cos(a) * 0.9, -0.5, Math.sin(a) * 0.82, 1, 0.7, 1)
    }
    for (let k = 0; k < 8; k++) membre(corps, peau, 'filament', 0.07, 0.025, angle(k, 8))
    for (let k = 0; k < 4; k++) membre(corps, accent, 'bras', 0.13, 0.05, (k / 4) * Math.PI * 2 + Math.PI / 4)
  } else if (espece === 'axolotl') {
    // Trois branchies de chaque côté de la tête, un petit ventre, quatre pattes et une queue.
    boule(corps, 1, 0, -0.18, -0.2, 0.82, 0.62, 0.85)
    for (const [s, z] of [[-1, 0.3], [1, 0.3], [-1, -0.5], [1, -0.5]]) membre(corps, peau, 'patte', 0.16, 0.11, s, z)
    membre(corps, peau, 'queue', 0.26, 0.04)
    for (const s of [-1, 1]) for (let j = 0; j < 3; j++) membre(tete, accent, 'branchie', 0.11, 0.07, s, j)
    iAccord = 0; iCoucou = 1
  } else {
    for (let k = 0; k < 8; k++) membre(corps, peauMotif, 'tentacule', 0.27, 0.05, angle(k, 8))
  }

  // Le carnet : Tako y écrit ses notes quand Encre range la session d'un
  // projet (humeur `note`). Un membre tient le crayon, des lignes d'encre
  // s'écrivent une à une, puis la page se vide et il recommence.
  const papier = new THREE.MeshToonMaterial({ color: 0xfffcf2, gradientMap: rampe })
  const carnet = new THREE.Group(); carnet.position.set(0.05, espece === 'poulpe' ? -0.12 : -0.32, 1.32); carnet.rotation.x = -1.0; carnet.visible = false; corps.add(carnet)
  const feuille = new THREE.BoxGeometry(0.8, 0.58, 0.04)
  carnet.add(new THREE.Mesh(feuille, papier))
  const bordFeuille = new THREE.Mesh(feuille, trait); bordFeuille.scale.set(1.07, 1.09, 1.6); carnet.add(bordFeuille)
  const reliure = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.08), accent); reliure.position.set(0, 0.3, 0.02); carnet.add(reliure)
  const LIGNES = [0.58, 0.46, 0.6, 0.34]
  const lignes = LIGNES.map((_, j) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 0.028, 0.012), accent)
    l.position.set(-0.31, 0.17 - j * 0.12, 0.026); l.scale.x = 0.001; carnet.add(l)
    return l
  })
  // Le crayon a son pivot à la pointe ; sa tige part en arrière, vers le membre qui le tient.
  const crayon = new THREE.Group(); carnet.add(crayon)
  const tige = new THREE.Group(); tige.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.45, 0.2, 0.87).normalize()); crayon.add(tige)
  const mine = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 16), papier); mine.rotation.x = Math.PI; mine.position.y = 0.05; tige.add(mine)
  const pointe = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.035, 12), noir); pointe.rotation.x = Math.PI; pointe.position.y = 0.017; tige.add(pointe)
  const bois = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 16)
  const fut = new THREE.Mesh(bois, accent); fut.position.y = 0.3; tige.add(fut)
  const futBord = new THREE.Mesh(bois, trait); futBord.position.y = 0.3; futBord.scale.set(1.35, 1.04, 1.35); tige.add(futBord)
  const bout = new THREE.Object3D(); bout.position.y = 0.46; tige.add(bout)
  /** Où le membre tient le crayon, dans le repère du corps (recalculé à chaque image). */
  const prise = new THREE.Vector3(), chemin = new THREE.Vector3(), base = new THREE.Vector3()
  let ecriture = 0

  /** La position du point `u` (0 à 1, de la base au bout) d'un membre. */
  function forme(p: THREE.Vector3, m: Membre, i: number, u: number, t: number, tt: number): void {
    const l = m.leve
    const agite = Math.sin(tt * 6 + u * 4) * 0.1 * u
    switch (m.sorte) {
      case 'tentacule': {
        const vague = Math.sin(t * 2.2 + i * 0.85 - u * 3.2) * 0.34 * u
        let dist = 0.3 + u * 1.2, y = 0.12 - u * 0.85 + Math.sin(u * Math.PI) * 0.1
        if (u > 0.5) { const c = (u - 0.5) / 0.5; y += c * c * 0.85; dist -= c * c * 0.55 }
        dist = dist * (1 - l) + (0.4 + u * 0.9) * l
        y = y * (1 - l) + (0.15 + u * 1.55 + agite) * l
        const a = m.a + vague * 0.5
        p.set(Math.cos(a) * dist, y + vague * 0.35, Math.sin(a) * dist * 0.95)
        return
      }
      case 'filament': {
        // Ils pendent sous la cloche et ondulent de côté, le bout plus que la base.
        const ondule = Math.sin(t * 1.8 + i * 1.3 - u * 4) * 0.22 * u
        const dist = (0.7 - u * 0.12) * (1 - l) + (0.75 + u * 0.6) * l
        const y = (0.3 - u * 1.25) * (1 - l) + (0.3 + u * 1.1 + agite) * l
        const a = m.a + ondule * (1 - l)
        p.set(Math.cos(a) * dist, y, Math.sin(a) * dist * 0.9)
        return
      }
      case 'bras': {
        const frise = Math.sin(u * 9 - t * 2 + m.a) * 0.07
        const dist = 0.22 + frise + u * 0.08
        p.set(Math.cos(m.a) * dist, 0.3 - u * 0.95, Math.sin(m.a) * dist + 0.1)
        return
      }
      case 'patte': {
        const s = m.a, pas = Math.sin(t * 2.4 + i * 1.6) * 0.12 * u
        const x = s * (0.6 + u * 0.32), y = -0.3 - u * 0.42
        p.set(x * (1 - l) + s * (0.62 + u * 0.3) * l, y * (1 - l) + (-0.3 + u * 0.7 + agite * 0.6) * l, m.b + pas * (1 - l) + 0.1 * u * l)
        return
      }
      case 'queue': {
        p.set(Math.sin(t * 2 - u * 3) * 0.45 * u, -0.25 + u * 0.15, -0.75 - u * 0.85)
        return
      }
      case 'branchie': {
        // Dans le repère de la tête : elles suivent ses mouvements et frémissent.
        const s = m.a, j = m.b, frisson = Math.sin(tt * 4 + j * 1.7 + s) * 0.06 * u
        p.set(s * (1.12 + u * 0.55), 0.28 - j * 0.3 + u * (0.4 - j * 0.32) + frisson + u * u * 0.12, -0.15 - u * 0.12)
        return
      }
    }
  }

  let humeur: Humeur = 'repos'
  const cible = { penche: 0, vitesse: 1, pupY: 0, oeil: 1, bouche: 1, incline: 0, note: 0 }
  const cur = { ...cible }
  let t = 0, mx = 0, my = 0, tx = 0, ty = 0, clin = 1, avantClin = 2

  // Tako vit sa vie : il regarde ailleurs, fait coucou, sautille, s'étire.
  // Il ne suit la souris que quand elle passe tout près, et quelques
  // secondes seulement (la suivre tout le temps était « relou »).
  let suivreJusqua = 0
  let regard = { x: 0, y: 0 }, avantRegard = 1.5
  let geste: { nom: Geste; p: number; duree: number } | null = null
  let avantGeste = 5 + Math.random() * 5
  const GESTES: [Geste, number][] = [['coucou', 1.8], ['saut', 0.9], ['etire', 1.4], ['clins', 0.7], ['tour', 2.2]]

  function changer(h: Humeur): void {
    humeur = h
    joue.color.set(COULEURS[h])
    Object.assign(cible, { penche: 0, vitesse: 1, pupY: 0, oeil: 1, bouche: 1, incline: 0, note: 0 })
    if (h === 'ecoute') Object.assign(cible, { penche: 0.18, vitesse: 0.6, oeil: 1.12, bouche: 0.6 })
    if (h === 'reflechit') Object.assign(cible, { pupY: 0.09, incline: 0.16, vitesse: 0.7, bouche: 0.5 })
    if (h === 'bosse') Object.assign(cible, { vitesse: 2.6, pupY: -0.06, penche: 0.06 })
    if (h === 'accord') Object.assign(cible, { incline: -0.08, oeil: 1.08 })
    if (h === 'fini') Object.assign(cible, { oeil: 0.32, bouche: 1.6, vitesse: 1.4 })
    // Penché sur son carnet, les yeux sur la page, appliqué.
    if (h === 'note') Object.assign(cible, { note: 1, penche: 0.16, pupY: -0.07, vitesse: 0.55, bouche: 0.65, incline: -0.06 })
  }

  function poserMembres(t: number, tt: number, k: number): void {
    membres.forEach((m, i) => {
      const leve = (humeur === 'accord' && i === iAccord) || (geste?.nom === 'coucou' && i === iCoucou && geste.p > 0.05 && geste.p < 0.85)
      m.leve += ((leve ? 1 : 0) - m.leve) * k
      m.pts.forEach((p, n) => forme(p, m, i, n / (m.pts.length - 1), t, tt))
      // Le membre qui écrit va chercher le crayon : la base reste en place, le bout rejoint la prise.
      if (i === iAccord && cur.note > 0.02) {
        base.copy(m.pts[0])
        m.pts.forEach((p, n) => {
          const u = n / (m.pts.length - 1)
          chemin.lerpVectors(base, prise, u)
          chemin.y += Math.sin(u * Math.PI) * 0.28
          p.lerp(chemin, cur.note * Math.pow(u, 0.7))
        })
      }
      m.courbe.updateArcLengths()
      majTube(m.g, m.courbe, SEGS, RAD, m.r0, m.r1)
      majTube(m.gl, m.courbe, SEGS, RAD, m.r0 + Math.min(0.04, m.r0 * 0.5), m.r1 + Math.min(0.03, m.r1 * 0.8))
    })
  }

  // Cadrage sur la vraie silhouette : le centre de la créature (tête + membres)
  // est ramené à l'origine, qui est aussi le pivot des rotations. Il reste
  // centré quel que soit le cadre, et tourner ne le décale plus.
  poserMembres(0, 0, 1)
  corps.updateMatrixWorld(true)
  const boite = new THREE.Box3().setFromObject(corps, true)
  const centre = boite.getCenter(new THREE.Vector3())
  corps.position.sub(centre)
  const taille = boite.getSize(new THREE.Vector3())
  const remplir = o.remplir ?? 0.8
  const plongee = o.plongee ?? 0.08

  function cadrer(): void {
    // La silhouette (plus une marge pour la nage) tient dans le cadre, en largeur comme en hauteur.
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const th = tv * camera.aspect
    const d = Math.max(taille.y / 2 / tv, taille.x / 2 / th) / remplir + taille.z / 2
    camera.position.set(0, Math.sin(plongee) * d, Math.cos(plongee) * d)
    camera.lookAt(0, 0, 0)
  }

  function redimensionner(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    rendu.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    cadrer()
  }
  const ro = new ResizeObserver(redimensionner); ro.observe(canvas); redimensionner()

  const souris = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    const portee = Math.max(r.width, 140) * 1.2
    if (Math.hypot(dx, dy) > portee) return
    mx = Math.max(-1, Math.min(1, dx / portee))
    my = Math.max(-1, Math.min(1, dy / portee))
    suivreJusqua = performance.now() + 2500
  }
  addEventListener('pointermove', souris)

  const lent = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.15 : 1
  let avant = performance.now(), anim = 0, vivant = true
  function image(maintenant: number): void {
    if (!vivant) return
    anim = requestAnimationFrame(image)
    if (document.hidden) return
    const dt = Math.min(0.05, (maintenant - avant) / 1000); avant = maintenant
    const k = 1 - Math.pow(0.02, dt)
    for (const c in cible) (cur as Record<string, number>)[c] += ((cible as Record<string, number>)[c] - (cur as Record<string, number>)[c]) * k
    t += dt * lent * cur.vitesse
    const tt = (maintenant / 1000) * lent
    // Où regarder : la souris si elle vient d'approcher, sinon un point qu'il choisit lui-même.
    avantRegard -= dt
    if (avantRegard < 0) {
      avantRegard = 1.8 + Math.random() * 3.5
      regard = Math.random() < 0.3 ? { x: 0, y: 0 } : { x: (Math.random() * 2 - 1) * 0.8, y: (Math.random() * 2 - 1) * 0.5 }
    }
    const suit = maintenant < suivreJusqua && humeur !== 'note'
    // En écrivant, il regarde sa page et rien d'autre.
    const vx = humeur === 'note' ? 0.05 : suit ? mx : regard.x, vy = humeur === 'note' ? 0.7 : suit ? my : regard.y
    const kr = suit ? k : 1 - Math.pow(0.25, dt)
    tx += (vx - tx) * kr; ty += (vy - ty) * kr

    // Un petit geste de temps en temps, seulement au repos.
    if (geste) {
      geste.p += dt / geste.duree
      if (geste.p >= 1) geste = null
    } else if (humeur === 'repos' && !suit && lent === 1) {
      avantGeste -= dt
      if (avantGeste < 0) {
        avantGeste = 6 + Math.random() * 8
        const [nom, duree] = GESTES[Math.floor(Math.random() * GESTES.length)]
        geste = { nom, p: 0, duree }
        if (nom === 'clins') clin = 0
      }
    }
    const gp = geste?.p ?? 0
    const cloche = Math.sin(gp * Math.PI)

    racine.rotation.y = tx * 0.3 + (geste?.nom === 'tour' ? Math.sin(gp * Math.PI * 2) * 0.55 : 0)
    racine.rotation.x = ty * 0.12 + cur.penche
    racine.position.y = Math.sin(tt * 1.5) * 0.07 + (humeur === 'fini' ? Math.abs(Math.sin(tt * 4.2)) * 0.28 : 0)
      + (geste?.nom === 'saut' ? Math.abs(Math.sin(gp * Math.PI * 2)) * 0.3 : 0)
    tete.rotation.z = cur.incline + Math.sin(tt * 0.9) * 0.03 + (geste?.nom === 'coucou' ? cloche * 0.12 : 0)
    if (geste?.nom === 'clins' && gp > 0.45 && gp < 0.5 && clin > 0.9) clin = 0
    const souffle = 1 + Math.sin(tt * 2.1) * 0.02 + (geste?.nom === 'etire' ? cloche * 0.12 : 0)
    tete.scale.set(1 / Math.sqrt(souffle), souffle, 1 / Math.sqrt(souffle))

    avantClin -= dt
    if (avantClin < 0) { clin = 0; avantClin = 2.5 + Math.random() * 3 }
    clin = Math.min(1, clin + dt * 9)
    const paupiere = Math.min(cur.oeil, 0.1 + 0.9 * clin * cur.oeil)
    for (const { g, pupille, r1, r2 } of yeux) {
      g.scale.set(cur.oeil > 1 ? cur.oeil : 1, paupiere, 1)
      const px = tx * 0.045, py = -ty * 0.035 + cur.pupY * 0.6
      pupille.position.set(px, py, 0.14)
      r1.position.set(px + 0.06, py + 0.07, 0.25)
      r2.position.set(px - 0.06, py - 0.06, 0.25)
      pupille.visible = r1.visible = r2.visible = cur.oeil > 0.45
    }
    bouche.scale.set(cur.bouche, cur.bouche, 1)
    joue.opacity = 0.55 + Math.sin(tt * 3) * 0.25
    void joues

    carnet.visible = cur.note > 0.02
    if (carnet.visible) {
      carnet.scale.setScalar(Math.max(0.001, cur.note))
      if (humeur === 'note') ecriture += dt * lent
      // 4 lignes de 1,4 s, une pause d'une seconde (page pleine), puis une page neuve.
      const cycle = ecriture % 6.6, plein = cycle >= 5.6
      const j = Math.min(3, Math.floor(cycle / 1.4)), q = plein ? 1 : Math.min(1, (cycle - j * 1.4) / 1.4)
      lignes.forEach((l, n) => {
        const v = plein || n < j ? 1 : n === j ? q : 0
        l.scale.x = Math.max(0.001, v * LIGNES[n])
        l.position.x = -0.31 + l.scale.x / 2
      })
      const gribouille = plein ? 0 : Math.sin(tt * 34) * 0.014
      crayon.position.set(-0.31 + (plein ? 0.25 : q * LIGNES[j]), 0.17 - (plein ? 1.5 : j) * 0.12 + gribouille, plein ? 0.14 : 0.03 + Math.abs(Math.sin(tt * 17)) * 0.018)
      racine.updateMatrixWorld(true)
      bout.getWorldPosition(prise)
      corps.worldToLocal(prise)
    }

    poserMembres(t, tt, k)
    rendu.render(scene, camera)
  }
  anim = requestAnimationFrame(image)

  return {
    humeur: changer,
    // Un geste demandé de l'extérieur (clic sur la bulle, panneau qui s'ouvre) passe devant tout.
    geste: (nom) => {
      const d = GESTES.find(([n]) => n === nom)?.[1] ?? 1
      geste = { nom, p: 0, duree: d }
      if (nom === 'clins') clin = 0
    },
    detruire: () => {
      vivant = false
      cancelAnimationFrame(anim)
      ro.disconnect()
      removeEventListener('pointermove', souris)
      rendu.dispose()
    }
  }
}
