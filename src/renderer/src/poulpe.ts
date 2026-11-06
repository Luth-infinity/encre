import * as THREE from 'three'
import type { Humeur } from '@shared/types'

/**
 * Le poulpe d'Encre, d'après le tatouage de Lucas : rendu « dessin animé »
 * (toon + contour d'encre en coque inversée), tête lisse, motifs irezumi
 * (vagues seigaiha + fleurs de cerisier) uniquement sur les tentacules, en
 * trait léger. Visage kawaii : grosses pupilles, regard qui suit à peine la
 * souris. Validé sur la page de pistes (design/pistes.html), à garder tel quel.
 */

export const COULEURS: Record<Humeur, string> = {
  repos: '#B7A6F5', ecoute: '#3CC8F2', reflechit: '#FF6FB5', bosse: '#FF9A3C', accord: '#FFC933', fini: '#3DDC84'
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

function motifTentacules(): THREE.CanvasTexture {
  const w = 512, h = 256, R = 51.2
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = LAVANDE; x.fillRect(0, 0, w, h)
  let rang = 0
  for (let y = -R; y < h + R; y += R / 2, rang++) {
    const dec = (rang % 2) * R
    for (let cx = -2 * R + dec; cx < w + 2 * R; cx += 2 * R) {
      x.beginPath(); x.arc(cx, y, R * 0.96, 0, Math.PI * 2); x.fillStyle = LAVANDE; x.fill()
      x.strokeStyle = '#7E68E3'; x.lineWidth = R * 0.06
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

export type Options = { distance?: number; fov?: number; hauteurCamera?: number; vise?: number }

export type Poulpe = { humeur: (h: Humeur) => void; detruire: () => void }

export function creerPoulpe(canvas: HTMLCanvasElement, o: Options = {}): Poulpe {
  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(o.fov ?? 28, 1, 0.1, 50)
  camera.position.set(0, o.hauteurCamera ?? 0.9, o.distance ?? 8.2)
  camera.lookAt(0, o.vise ?? 0.15, 0)

  const rampe = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat)
  rampe.minFilter = rampe.magFilter = THREE.NearestFilter
  rampe.needsUpdate = true

  const peau = new THREE.MeshToonMaterial({ color: LAVANDE, gradientMap: rampe })
  const peauMotif = new THREE.MeshToonMaterial({ map: motifTentacules(), gradientMap: rampe })
  const trait = new THREE.MeshBasicMaterial({ color: ENCRE, side: THREE.BackSide })
  const blanc = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe })
  const noir = new THREE.MeshBasicMaterial({ color: 0x111018 })
  const reflet = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const joue = new THREE.MeshBasicMaterial({ color: COULEURS.repos, transparent: true, opacity: 0.9 })

  // Depuis three r155, les intensités sont physiques : ×π par rapport à l'ancien réglage.
  scene.add(new THREE.HemisphereLight(0xffffff, '#5B43D0', 0.6 * Math.PI))
  const soleil = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI)
  soleil.position.set(3, 5, 4)
  scene.add(soleil)

  const racine = new THREE.Group(); scene.add(racine)
  const corps = new THREE.Group(); racine.add(corps)

  const tete = new THREE.Group(); tete.position.y = 0.78; corps.add(tete)
  const sphere = new THREE.SphereGeometry(1, 64, 48)
  const crane = new THREE.Mesh(sphere, peau); crane.scale.set(1.1, 0.96, 1); tete.add(crane)
  const contour = new THREE.Mesh(sphere, trait); contour.scale.set(1.15, 1.0, 1.04); tete.add(contour)

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

  const SEGS = 56, RAD = 14
  const tentacules = Array.from({ length: 8 }, (_, k) => {
    const g = tube(SEGS, RAD), gl = tube(SEGS, RAD)
    corps.add(new THREE.Mesh(g, peauMotif)); corps.add(new THREE.Mesh(gl, trait))
    const pts = Array.from({ length: 12 }, () => new THREE.Vector3())
    return { g, gl, pts, courbe: new THREE.CatmullRomCurve3(pts), a: ((k + 0.5) / 8) * Math.PI * 2 + Math.PI / 2, leve: 0 }
  })

  let humeur: Humeur = 'repos'
  const cible = { penche: 0, vitesse: 1, pupY: 0, oeil: 1, bouche: 1, incline: 0 }
  const cur = { ...cible }
  let t = 0, mx = 0, my = 0, tx = 0, ty = 0, clin = 1, avantClin = 2

  function changer(h: Humeur): void {
    humeur = h
    joue.color.set(COULEURS[h])
    Object.assign(cible, { penche: 0, vitesse: 1, pupY: 0, oeil: 1, bouche: 1, incline: 0 })
    if (h === 'ecoute') Object.assign(cible, { penche: 0.18, vitesse: 0.6, oeil: 1.12, bouche: 0.6 })
    if (h === 'reflechit') Object.assign(cible, { pupY: 0.09, incline: 0.16, vitesse: 0.7, bouche: 0.5 })
    if (h === 'bosse') Object.assign(cible, { vitesse: 2.6, pupY: -0.06, penche: 0.06 })
    if (h === 'accord') Object.assign(cible, { incline: -0.08, oeil: 1.08 })
    if (h === 'fini') Object.assign(cible, { oeil: 0.32, bouche: 1.6, vitesse: 1.4 })
  }

  function redimensionner(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    rendu.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(redimensionner); ro.observe(canvas); redimensionner()

  const souris = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect()
    mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)))
    my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)))
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
    tx += (mx - tx) * k; ty += (my - ty) * k

    racine.rotation.y = tx * 0.45
    racine.rotation.x = ty * 0.18 + cur.penche
    racine.position.y = Math.sin(tt * 1.5) * 0.07 + (humeur === 'fini' ? Math.abs(Math.sin(tt * 4.2)) * 0.28 : 0)
    tete.rotation.z = cur.incline + Math.sin(tt * 0.9) * 0.03
    const souffle = 1 + Math.sin(tt * 2.1) * 0.02
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

    tentacules.forEach((tn, i) => {
      tn.leve += ((humeur === 'accord' && i === 1 ? 1 : 0) - tn.leve) * k
      const ph = i * 0.85
      tn.pts.forEach((p, s) => {
        const u = s / (tn.pts.length - 1)
        const vague = Math.sin(t * 2.2 + ph - u * 3.2) * 0.34 * u
        let dist = 0.3 + u * 1.2, y = 0.12 - u * 0.85 + Math.sin(u * Math.PI) * 0.1
        if (u > 0.5) { const c = (u - 0.5) / 0.5; y += c * c * 0.85; dist -= c * c * 0.55 }
        const l = tn.leve
        dist = dist * (1 - l) + (0.4 + u * 0.9) * l
        y = y * (1 - l) + (0.15 + u * 1.55 + Math.sin(tt * 6 + u * 4) * 0.1 * u) * l
        const a = tn.a + vague * 0.5
        p.set(Math.cos(a) * dist, y + vague * 0.35, Math.sin(a) * dist * 0.95)
      })
      tn.courbe.updateArcLengths()
      majTube(tn.g, tn.courbe, SEGS, RAD, 0.27, 0.05)
      majTube(tn.gl, tn.courbe, SEGS, RAD, 0.31, 0.08)
    })
    rendu.render(scene, camera)
  }
  anim = requestAnimationFrame(image)

  return {
    humeur: changer,
    detruire: () => {
      vivant = false
      cancelAnimationFrame(anim)
      ro.disconnect()
      removeEventListener('pointermove', souris)
      rendu.dispose()
    }
  }
}
