'use client';

import { useEffect, useRef, useState } from 'react';
import { COULEURS, creerPoulpe, type Humeur, type Poulpe } from './poulpe';

/**
 * Tako, le même poulpe 3D que dans l'app, dans sa bulle noire. L'anneau prend
 * la couleur de son humeur, comme sur le bureau. Un clic : il fait coucou.
 */
export function Tako({ humeur = 'repos', className = '' }: { humeur?: Humeur; className?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const poulpe = useRef<Poulpe | null>(null);

  useEffect(() => {
    if (!toile.current) return;
    const p = creerPoulpe(toile.current, { remplir: 0.62, plongee: 0.1 });
    poulpe.current = p;
    // Il dit bonjour en arrivant, une fois.
    const salut = setTimeout(() => p.geste('coucou'), 700);
    return () => {
      clearTimeout(salut);
      p.detruire();
      poulpe.current = null;
    };
  }, []);

  useEffect(() => poulpe.current?.humeur(humeur), [humeur]);

  return (
    <button
      type="button"
      aria-label="Tako, le poulpe d’Encre. Clique pour qu’il te salue."
      onClick={() => poulpe.current?.geste('coucou')}
      className={`bulle relative aspect-square rounded-full bg-[#0b0c0e] ${className}`}
      style={{ '--anneau': COULEURS[humeur] } as React.CSSProperties}
    >
      <canvas ref={toile} className="absolute inset-0 size-full rounded-full" />
    </button>
  );
}

const ETAPES: { id: Humeur; nom: string; texte: string }[] = [
  { id: 'repos', nom: 'Au repos', texte: 'Il vit sa vie : il regarde ailleurs, s’étire, fait coucou.' },
  { id: 'ecoute', nom: 'Il t’écoute', texte: 'Tu as appuyé sur Alt+Maj+E ou dit « Tako ». Il tend l’oreille.' },
  { id: 'reflechit', nom: 'Il réfléchit', texte: 'Il lit ton projet et prépare sa réponse.' },
  { id: 'bosse', nom: 'Il bosse', texte: 'Il écrit, lance, cherche. Tu peux lui écrire en même temps.' },
  { id: 'accord', nom: 'Il attend ton accord', texte: 'Une action à valider : la bulle pulse jusqu’à ce que tu répondes.' },
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
    const id = setInterval(() => setI((n) => (n + 1) % ETAPES.length), 2600);
    return () => clearInterval(id);
  }, [libre]);

  const etape = ETAPES[i];
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex justify-center">
        <Tako humeur={etape.id} className="size-64 sm:size-80" />
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
        <p className="mt-6 min-h-[3em] px-4 text-[15px] leading-relaxed text-ink-soft">{etape.texte}</p>
      </div>
    </div>
  );
}
