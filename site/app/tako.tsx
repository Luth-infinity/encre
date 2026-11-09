'use client';

import { useEffect, useRef, useState } from 'react';
import { creerAbysses } from './abysses';
import { COULEURS, creerPoulpe, type Espece, type Geste, type Humeur, type Poulpe } from './poulpe';

/**
 * Vrai quand l'élément approche de l'écran. Une page avec sept créatures 3D
 * ne doit pas garder sept rendus WebGL allumés : chacune naît en arrivant
 * près de l'écran et disparaît quand on s'en éloigne.
 */
function useProche<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [proche, setProche] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => setProche(e.isIntersecting), { rootMargin: '300px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, proche];
}

type Creature = { espece?: Espece; peau?: string; motif?: string };

/** Le canvas d'une créature, créé seulement quand il est proche de l'écran. */
function Toile({
  humeur,
  creature,
  remplir,
  salut,
  piloter
}: {
  humeur: Humeur;
  creature: Creature;
  remplir: number;
  salut?: boolean;
  piloter: React.RefObject<Poulpe | null>;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!toile.current) return;
    const p = creerPoulpe(toile.current, { remplir, plongee: 0.1, ...creature });
    piloter.current = p;
    p.humeur(humeur);
    const id = salut ? setTimeout(() => p.geste('coucou'), 700) : undefined;
    return () => {
      clearTimeout(id);
      p.detruire();
      piloter.current = null;
    };
    // L'humeur suit par l'effet plus bas : la changer ne doit pas recréer la créature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creature.espece, creature.peau, creature.motif, remplir]);
  useEffect(() => piloter.current?.humeur(humeur), [humeur, piloter]);
  return <canvas ref={toile} className="absolute inset-0 size-full rounded-full" />;
}

/**
 * Tako (ou Nori, ou Momo), la même créature 3D que dans l'app, dans sa bulle
 * noire. L'anneau prend la couleur de son humeur, comme sur le bureau. Un
 * clic : un geste.
 */
export function Tako({
  humeur = 'repos',
  className = '',
  creature = {},
  geste = 'coucou',
  salut = true,
  nom = 'Tako'
}: {
  humeur?: Humeur;
  className?: string;
  creature?: Creature;
  geste?: Geste;
  salut?: boolean;
  nom?: string;
}) {
  const [ref, proche] = useProche<HTMLButtonElement>();
  const poulpe = useRef<Poulpe | null>(null);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${nom}, l’avatar d’Encre. Clique pour un geste.`}
      onClick={() => poulpe.current?.geste(geste)}
      className={`bulle relative aspect-square rounded-full bg-[#0b0c0e] ${className}`}
      style={{ '--anneau': COULEURS[humeur] } as React.CSSProperties}
    >
      {proche && <Toile humeur={humeur} creature={creature} remplir={0.62} salut={salut} piloter={poulpe} />}
    </button>
  );
}

/** Le fond de bulles d'encre en 3D, derrière le haut de page. */
export function Abysses({ className = '' }: { className?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!toile.current) return;
    const sombre = matchMedia('(prefers-color-scheme: dark)').matches;
    const a = creerAbysses(toile.current, sombre ? { couleurs: ['#2a2d32', '#b7a6f5', '#a9e4f5', '#ffc7d9', '#b7a6f5', '#3a3d44'], encre: '#000000' } : {});
    return () => a.detruire();
  }, []);
  return <canvas ref={toile} aria-hidden className={`pointer-events-none ${className}`} />;
}

const ETAPES: { id: Humeur; nom: string; texte: string }[] = [
  { id: 'repos', nom: 'Au repos', texte: 'Il vit sa vie : il regarde ailleurs, s’étire, fait coucou.' },
  { id: 'ecoute', nom: 'Il t’écoute', texte: 'Tu as appuyé sur Alt+Maj+E. Il tend l’oreille.' },
  { id: 'reflechit', nom: 'Il réfléchit', texte: 'Il lit ton projet et prépare sa réponse.' },
  { id: 'bosse', nom: 'Il bosse', texte: 'Il écrit, lance, cherche. Tu peux lui écrire en même temps.' },
  { id: 'accord', nom: 'Il attend ton accord', texte: 'Une action à valider : la bulle pulse jusqu’à ce que tu répondes.' },
  { id: 'note', nom: 'Il prend des notes', texte: 'Le projet dort depuis 45 minutes : il sort son carnet et résume où vous en êtes, pour repartir léger.' },
  { id: 'fini', nom: 'C’est fait', texte: 'Il sautille, puis revient au repos.' }
];

/**
 * Un tour de Tako joué en boucle, jusqu'à ce qu'on choisisse soi-même une
 * humeur : la boucle montre que la couleur raconte où il en est, le clic
 * laisse vérifier chaque état à son rythme.
 */
export function Humeurs() {
  const [i, setI] = useState(0);
  const [libre, setLibre] = useState(true);

  useEffect(() => {
    if (!libre) return;
    const id = setInterval(() => setI((n) => (n + 1) % ETAPES.length), 2800);
    return () => clearInterval(id);
  }, [libre]);

  const etape = ETAPES[i];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex justify-center">
        <Tako humeur={etape.id} className="size-64 sm:size-80" salut={false} />
      </div>
      <div>
        <ul className="grid gap-1">
          {ETAPES.map((e, n) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setLibre(false);
                  setI(n);
                }}
                aria-pressed={n === i}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  n === i ? 'bg-card' : 'hover:bg-card/60'
                }`}
              >
                <span className="size-3 flex-none rounded-full" style={{ background: COULEURS[e.id] }} />
                <span className={`text-[16px] font-semibold ${n === i ? '' : 'text-ink-soft'}`}>{e.nom}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 min-h-[4.5em] px-4 text-[15px] leading-relaxed text-ink-soft">{etape.texte}</p>
      </div>
    </div>
  );
}

/** Les trois avatars, comme dans l'app (`AVATARS`) : un par compte Claude. */
const AVATARS: { nom: string; espece: Espece; peau: string; motif: string; qui: string; ton: string; geste: Geste }[] = [
  { nom: 'Tako', espece: 'poulpe', peau: '#B7A6F5', motif: '#7E68E3', qui: 'Le poulpe', ton: 'Chaleureux et un peu espiègle.', geste: 'coucou' },
  { nom: 'Nori', espece: 'meduse', peau: '#A9E4F5', motif: '#F59AC8', qui: 'La méduse', ton: 'Calme, précise, un humour discret.', geste: 'tour' },
  { nom: 'Momo', espece: 'axolotl', peau: '#FFC7D9', motif: '#F2558C', qui: 'L’axolotl', ton: 'Énergique, direct, droit au but.', geste: 'saut' }
];

/**
 * Les avatars côte à côte. Survoler l'un le fait réagir (il te regarde
 * travailler), cliquer déclenche son geste.
 */
export function Avatars() {
  const [survol, setSurvol] = useState<number | null>(null);
  return (
    <div className="grid gap-10 sm:grid-cols-3">
      {AVATARS.map((a, n) => (
        <div key={a.nom} className="flex flex-col items-center text-center" onPointerEnter={() => setSurvol(n)} onPointerLeave={() => setSurvol(null)}>
          <Tako
            nom={a.nom}
            creature={{ espece: a.espece, peau: a.peau, motif: a.motif }}
            humeur={survol === n ? 'bosse' : 'repos'}
            geste={a.geste}
            salut={false}
            className="size-52 lg:size-60"
          />
          <h3 className="headline mt-8 text-[34px]">{a.nom}</h3>
          <p className="mt-1 text-[15px] font-semibold">{a.qui}</p>
          <p className="mt-1 max-w-[24ch] text-[15px] leading-relaxed text-ink-soft">{a.ton}</p>
        </div>
      ))}
    </div>
  );
}

/** Tako qui écrit ses notes, pour la carte « Économie ». */
export function TakoNotes({ className = '' }: { className?: string }) {
  return <Tako humeur="note" salut={false} geste="clins" className={className} />;
}
