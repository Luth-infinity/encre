import * as THREE from 'three';

/**
 * Le fond 3D du site : des bulles qui montent dans l'encre, dessinées comme
 * Tako (toon à trois tons + contour d'encre en coque inversée) pour que le
 * décor et la mascotte parlent la même langue. Pas de dégradé ni de halo :
 * des aplats et des traits. La souris écarte les bulles proches, la caméra
 * suit un peu le pointeur ; tout s'arrête quand le fond sort de l'écran.
 */

export type Abysses = { detruire: () => void };

type Options = {
  /** Nombre de bulles (réduit tout seul sur petit écran). */
  nombre?: number;
  /** Les couleurs des bulles, piochées au hasard. */
  couleurs?: string[];
  /** La couleur du trait (le contour d'encre). */
  encre?: string;
};

export function creerAbysses(canvas: HTMLCanvasElement, o: Options = {}): Abysses {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const petit = innerWidth < 700;
  const n = Math.round((o.nombre ?? 60) * (petit ? 0.45 : 1));
  const couleurs = o.couleurs ?? ['#ffffff', '#f4f6f7', '#b7a6f5', '#ffffff', '#a9e4f5', '#ffc7d9'];

  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  rendu.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const rampe = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  rampe.minFilter = rampe.magFilter = THREE.NearestFilter;
  rampe.needsUpdate = true;
  scene.add(new THREE.HemisphereLight(0xffffff, '#5b43d0', 0.65 * Math.PI));
  const soleil = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
  soleil.position.set(3, 5, 6);
  scene.add(soleil);

  // Une géométrie, deux maillages instanciés par couleur : la bulle et son trait.
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const trait = new THREE.MeshBasicMaterial({ color: o.encre ?? '#1b1530', side: THREE.BackSide });
  const reflet = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const parCouleur = couleurs.map((c) => ({
    peau: new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: c, gradientMap: rampe }), n),
    bord: new THREE.InstancedMesh(geo, trait, n),
    reflet: new THREE.InstancedMesh(geo, reflet, n),
    compte: 0
  }));
  for (const p of parCouleur) scene.add(p.peau, p.bord, p.reflet);

  type Bulle = { c: number; i: number; pos: THREE.Vector3; r: number; v: number; phase: number; ecart: THREE.Vector3 };
  const largeur = 13;
  const hauteur = 9;
  const bulles: Bulle[] = Array.from({ length: n }, () => {
    const c = Math.floor(Math.random() * couleurs.length);
    const i = parCouleur[c].compte++;
    // Les petites bulles plus nombreuses : la profondeur vient de la taille autant que de z.
    const r = 0.06 + Math.pow(Math.random(), 2.6) * 0.42;
    return {
      c,
      i,
      pos: new THREE.Vector3((Math.random() - 0.5) * largeur * 2, (Math.random() - 0.5) * hauteur * 2, -6 + Math.random() * 9),
      r,
      v: 0.25 + (0.6 - r) * 0.9 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      ecart: new THREE.Vector3()
    };
  });
  for (const p of parCouleur) {
    p.peau.count = p.bord.count = p.reflet.count = p.compte;
  }

  const souris = new THREE.Vector2(9, 9);
  const vise = new THREE.Vector2();
  const pointeur = new THREE.Vector3();
  const rayon = new THREE.Raycaster();
  const plan = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const bouger = (e: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    souris.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  addEventListener('pointermove', bouger, { passive: true });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const placer = (b: Bulle, t: number): void => {
    const g = parCouleur[b.c];
    // Une bulle respire un peu en montant : elle n'est jamais une bille rigide.
    const souffle = 1 + Math.sin(t * 2 + b.phase) * 0.04;
    p.copy(b.pos).add(b.ecart);
    s.set(b.r * souffle, b.r / souffle, b.r);
    g.peau.setMatrixAt(b.i, m.compose(p, q, s));
    s.multiplyScalar(1.09);
    g.bord.setMatrixAt(b.i, m.compose(p, q, s));
    // Le reflet : un petit point blanc en haut à gauche, comme dans les yeux de Tako.
    s.set(b.r * 0.2, b.r * 0.2, b.r * 0.2);
    g.reflet.setMatrixAt(b.i, m.compose(p.clone().add(new THREE.Vector3(-b.r * 0.38, b.r * 0.4, b.r * 0.75)), q, s));
  };

  const taille = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    rendu.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const obs = new ResizeObserver(taille);
  obs.observe(canvas);
  taille();

  let visible = true;
  const vue = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !anim) anim = requestAnimationFrame(image);
  });
  vue.observe(canvas);

  let anim = 0;
  let avant = performance.now();
  let t = 0;
  function image(maintenant: number): void {
    anim = 0;
    const dt = Math.min(0.05, (maintenant - avant) / 1000);
    avant = maintenant;
    t += dt;
    // La caméra suit le pointeur à distance : un léger relief, pas un manège.
    vise.lerp(souris.x > 5 ? new THREE.Vector2() : souris, 0.04);
    camera.position.x = vise.x * 0.9;
    camera.position.y = vise.y * 0.6;
    camera.lookAt(0, 0, 0);
    rayon.setFromCamera(souris, camera);
    rayon.ray.intersectPlane(plan, pointeur);
    for (const b of bulles) {
      if (!calme) {
        b.pos.y += b.v * dt;
        b.pos.x += Math.sin(t * 0.8 + b.phase) * dt * 0.15;
        if (b.pos.y > hauteur + 1) {
          b.pos.y = -hauteur - 1;
          b.pos.x = (Math.random() - 0.5) * largeur * 2;
        }
        // Le pointeur pousse les bulles proches, elles reviennent doucement à leur place.
        const dx = b.pos.x - pointeur.x;
        const dy = b.pos.y - pointeur.y;
        const d = Math.hypot(dx, dy);
        const portee = 2.6;
        if (souris.x < 5 && d < portee && d > 0.001) {
          const force = (1 - d / portee) * 1.6;
          b.ecart.x += ((dx / d) * force - b.ecart.x) * 0.12;
          b.ecart.y += ((dy / d) * force - b.ecart.y) * 0.12;
        } else {
          b.ecart.multiplyScalar(0.94);
        }
      }
      placer(b, t);
    }
    for (const g of parCouleur) {
      g.peau.instanceMatrix.needsUpdate = g.bord.instanceMatrix.needsUpdate = g.reflet.instanceMatrix.needsUpdate = true;
    }
    rendu.render(scene, camera);
    if (visible && !calme) anim = requestAnimationFrame(image);
  }
  anim = requestAnimationFrame(image);

  return {
    detruire: () => {
      cancelAnimationFrame(anim);
      obs.disconnect();
      vue.disconnect();
      removeEventListener('pointermove', bouger);
      rendu.dispose();
    }
  };
}
