import { Reveal } from './reveal';
import { getReleases, getTelechargements, PAGE_VERSIONS, type Telechargements } from './releases';

const DEPOT = 'https://github.com/Luth-infinity/encre';
const SUITE = 'https://luth-apps.vercel.app';

/** Les humeurs de Tako, dans l'ordre d'un tour : les mêmes couleurs que dans l'app. */
const HUMEURS: [string, string, string][] = [
  ['repos', 'Au repos', '#B7A6F5'],
  ['ecoute', 'Il t’écoute', '#7CC4FF'],
  ['reflechit', 'Il réfléchit', '#FF8FC7'],
  ['bosse', 'Il bosse', '#FF9A3C'],
  ['accord', 'Il attend ton accord', '#FFC933'],
  ['fini', 'C’est fait', '#3DDC84']
];

const FONCTIONS: [string, string][] = [
  ['Un vrai Claude Code', 'Pas un chat de plus : Tako lit, écrit, lance des commandes dans le dossier de ton projet, avec ton CLAUDE.md, tes outils et tes sessions.'],
  ['Un projet par client', 'Chaque projet est un dossier, avec son contexte et ses outils. Dis « je bosse sur L’Oréal, projet BIM » : Tako crée le projet ou l’ouvre.'],
  ['Écris pendant qu’il bosse', 'Une autre idée en cours de route ? Envoie-la : Tako la prend entre deux étapes, sans tout arrêter.'],
  ['Réponds à un passage', 'Sélectionne un bout de sa réponse, clique « Répondre » : il sait exactement de quoi tu parles.'],
  ['Tes limites sous les yeux', 'Les jauges des 5 heures et de la semaine, sous la saisie, avec l’heure où elles repartent à zéro.'],
  ['Parle-lui', 'Alt+Maj+E de n’importe où, ou dis « Tako ». Il t’écoute, travaille, et te répond à voix haute.'],
  ['Tu gardes la main', 'Demander, Modifs auto ou Auto : chaque action passe par toi, ou seulement celles qui comptent.'],
  ['Figma et compagnie', 'Branche le bon compte Figma sur le bon projet, range tes jetons chiffrés : rien en clair dans les fichiers.']
];

// ─── Fragments ──────────────────────────────────────────────────────────────

/** La bulle de Tako, avec l'anneau qui passe par toutes ses humeurs. */
function Bulle({ taille = 'size-56 sm:size-72' }: { taille?: string }) {
  return (
    <div className={`bulle relative ${taille}`}>
      <span className="anneau absolute inset-[-10px] rounded-full" />
      <span className="ping absolute inset-[-10px] rounded-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="Tako, le poulpe d’Encre" className="flotte relative size-full drop-shadow-2xl" />
    </div>
  );
}

/**
 * Le panneau, rejoué en HTML : une capture ne montrerait pas le message
 * glissé pendant que Tako bosse, ni les jauges qui bougent.
 */
function Panneau() {
  return (
    <div className="panneau mx-auto w-full max-w-[400px] overflow-hidden rounded-[22px] bg-card text-[13px] text-left">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <span className="grid size-8 place-items-center rounded-[10px] bg-[#3FA9F5] text-[11px] font-extrabold text-white">EA</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[13.5px] leading-tight">Encre · Site</strong>
          <small className="block truncate text-[11px] text-ink-soft">Documents/Apps/encre</small>
        </span>
        <span className="text-ink-soft">⚙ ＋ ✕</span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        <div className="moi">Ajoute un mode sombre au site</div>
        <div className="qui"><img src="/tako.png" alt="" />Tako</div>
        <p className="leading-relaxed">Je regarde comment les couleurs sont rangées, puis je bascule tout sur des variables.</p>
        <div className="etapes">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-soft">
            <span>4 étapes</span>
            <span>Tout voir</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 font-medium"><b className="point" />Modifie globals.css</div>
        </div>
        <div className="moi pendant">
          Et garde le violet pour les liens
          <small>glissé en route</small>
        </div>
        <div className="attente"><i /><i /><i /></div>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex items-center gap-2 rounded-[18px] bg-canvas py-2 pl-3.5 pr-2">
          <span className="flex-1 text-ink-soft">Une autre idée ? Tako la prend en route…</span>
          <span className="grid size-8 place-items-center rounded-full bg-erreur text-[10px] text-white">■</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-full bg-canvas p-[3px] text-[11px] font-semibold text-ink-soft">
            <span className="px-2.5 py-1">Demander</span>
            <span className="rounded-full bg-ink px-2.5 py-1 text-card">Modifs auto</span>
            <span className="px-2.5 py-1">Auto</span>
          </div>
          <div className="flex gap-2.5 text-[11px] text-ink-soft">
            <span className="flex items-center gap-1"><b className="font-semibold">5 h</b><i className="jauge"><b style={{ width: '58%' }} /></i>58 %</span>
            <span className="flex items-center gap-1"><b className="font-semibold">Sem.</b><i className="jauge"><b style={{ width: '28%' }} /></i>28 %</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Telecharger({ dl }: { dl: Telechargements }) {
  const principal =
    'inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-card transition hover:-translate-y-0.5 hover:shadow-lg';
  const second = 'text-sm text-ink-soft underline-offset-4 hover:underline';
  return (
    <div className="flex flex-col items-center gap-4 sm:items-start">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a data-cta="win" href={dl.win ?? PAGE_VERSIONS} className={principal}>Télécharger pour Windows</a>
        <a data-cta="mac" href={dl.macArm ?? PAGE_VERSIONS} className={principal}>Télécharger pour Mac</a>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {dl.version && <span className="text-sm text-ink-soft">Version {dl.version}</span>}
        <a data-cta="mac" href={dl.macIntel ?? PAGE_VERSIONS} className={second}>Mac Intel</a>
        <a href={PAGE_VERSIONS} className={second}>Toutes les versions</a>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function Vitrine() {
  const [dl, releases] = await Promise.all([getTelechargements(), getReleases('fr')]);

  return (
    <>
      <Reveal />

      <header className="sticky top-0 z-20 border-b border-line/70 bg-page/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
          <span className="flex items-center gap-2 font-bold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="size-7" />
            Encre
          </span>
          <span className="flex-1" />
          <a href="#fonctions" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Ce qu’il fait</a>
          <a href="#installer" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Installer</a>
          <a href="#versions" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Versions</a>
          <a href="#telecharger" className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-card">Télécharger</a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
            <div className="text-center sm:text-left">
              <p className="reveal inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-line">
                <span className="humeur-point size-2 rounded-full" /> Salut, moi c’est Tako
              </p>
              <h1 className="reveal headline mt-6 text-[12vw] sm:text-[78px] lg:text-[92px]">
                Claude Code,<br />
                <span className="encre">dans une bulle.</span>
              </h1>
              <p className="reveal mt-7 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft sm:mx-0 mx-auto">
                Un petit poulpe qui flotte sur ton bureau, toujours au-dessus. Un clic, et c’est Claude Code qui
                travaille dans ton projet : il lit, il écrit, il lance, il te demande avant de toucher à quoi que ce soit.
              </p>
              <div className="reveal mt-10">
                <Telecharger dl={dl} />
              </div>
              <p className="reveal mt-5 text-sm text-ink-soft">
                Gratuit · Windows et macOS · passe par ton abonnement Claude, aucune clé à saisir
              </p>
            </div>
            <div className="reveal flex justify-center">
              <Bulle />
            </div>
          </div>
        </section>

        {/* Le panneau */}
        <section className="px-5 pb-24">
          <div className="reveal mx-auto grid max-w-6xl items-center gap-12 rounded-[32px] bg-canvas px-5 py-14 sm:px-12 lg:grid-cols-[1fr_1.1fr]">
            <Panneau />
            <div>
              <h2 className="headline text-[40px] sm:text-[56px]">Tu lui parles comme à un collègue.</h2>
              <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-ink-soft">
                Il dit ce qu’il fait avant chaque étape, regroupe ses actions, te montre le diff avant d’écrire. Et si
                une idée te vient pendant qu’il bosse, tu l’envoies : il la prend au vol.
              </p>
              <ul className="mt-8 grid gap-3 text-[15px]">
                <li className="flex gap-3"><span className="puce" />Ctrl+Maj+Espace l’ouvre de n’importe où</li>
                <li className="flex gap-3"><span className="puce" />Alt+Maj+E pour lui parler à voix haute</li>
                <li className="flex gap-3"><span className="puce" />Glisse un fichier, colle une capture, tape « / » pour les commandes</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Humeurs */}
        <section className="px-5 pb-24">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="reveal headline text-[36px] sm:text-[48px]">Un coup d’œil à Tako suffit.</h2>
            <p className="reveal mx-auto mt-4 max-w-[50ch] text-ink-soft">
              Sa couleur te dit où il en est, même panneau fermé. Quand il attend ton accord, la bulle pulse.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {HUMEURS.map(([id, nom, couleur]) => (
                <span key={id} className="reveal inline-flex items-center gap-2.5 rounded-full bg-card py-2 pl-2 pr-4 text-sm font-semibold ring-1 ring-line">
                  <span className="size-6 rounded-full" style={{ background: couleur }} />
                  {nom}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Fonctions */}
        <section id="fonctions" className="px-5 py-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="reveal headline max-w-[16ch] text-[40px] sm:text-[56px]">Tout Claude Code. En plus mignon.</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FONCTIONS.map(([titre, texte], i) => (
                <div key={titre} className="carte reveal rounded-3xl bg-card p-6 ring-1 ring-line" style={{ '--c': HUMEURS[i % HUMEURS.length][2] } as React.CSSProperties}>
                  <span className="block h-1.5 w-10 rounded-full" style={{ background: 'var(--c)' }} />
                  <h3 className="mt-5 text-[17px] font-bold tracking-tight">{titre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Installer */}
        <section id="installer" className="px-5 py-24">
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
            <div className="reveal lg:col-span-1">
              <h2 className="headline text-[40px] sm:text-[52px]">Trois minutes, montre en main.</h2>
              <p className="mt-4 text-ink-soft">Encre passe par le Claude Code de ta machine : c’est ton compte Claude (Pro ou Max) qui travaille.</p>
            </div>
            <ol className="grid gap-4 lg:col-span-2">
              <li className="reveal rounded-3xl bg-card p-6 ring-1 ring-line">
                <span className="headline text-[26px] text-ink-soft">1</span>
                <h3 className="mt-2 font-bold">Installe Claude Code</h3>
                <code className="mt-3 block overflow-x-auto rounded-xl bg-canvas px-4 py-3 font-mono text-[13px]">npm install -g @anthropic-ai/claude-code</code>
              </li>
              <li className="reveal rounded-3xl bg-card p-6 ring-1 ring-line">
                <span className="headline text-[26px] text-ink-soft">2</span>
                <h3 className="mt-2 font-bold">Connecte-toi une fois</h3>
                <p className="mt-2 text-sm text-ink-soft">Dans un terminal : <code className="font-mono">claude</code>, puis <code className="font-mono">/login</code>.</p>
              </li>
              <li className="reveal rounded-3xl bg-card p-6 ring-1 ring-line">
                <span className="headline text-[26px] text-ink-soft">3</span>
                <h3 className="mt-2 font-bold">Lance Encre</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Tako apparaît en bas à droite. Sur Mac, l’app n’est pas encore signée par Apple : au premier
                  lancement, clic droit sur Encre dans Applications, puis « Ouvrir ».
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* Téléchargement */}
        <section id="telecharger" className="px-5 py-8">
          <div className="reveal fond-encre mx-auto flex max-w-4xl flex-col items-center rounded-[36px] px-6 py-16 text-center">
            <Bulle taille="size-28" />
            <h2 className="headline mt-10 text-[40px] sm:text-[56px]">Adopte Tako.</h2>
            <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Il se met à jour tout seul sur Windows. Sur Mac, reviens ici pour la nouvelle version.
            </p>
            <div className="mt-10 [&>div]:items-center">
              <Telecharger dl={dl} />
            </div>
          </div>
        </section>

        {/* Versions */}
        {releases.length > 0 && (
          <section id="versions" className="px-5 py-24">
            <div className="mx-auto max-w-6xl">
              <h2 className="reveal headline text-[40px] sm:text-[54px]">Ce qui a changé</h2>
              <ul className="mt-12 grid gap-4">
                {releases.map((release) => (
                  <li key={release.version} className="reveal grid gap-4 rounded-3xl bg-card p-6 ring-1 ring-line sm:grid-cols-[10rem_1fr]">
                    <div>
                      <a href={release.page} className="headline text-[24px] hover:opacity-80" target="_blank" rel="noreferrer">
                        {release.version}
                      </a>
                      <p className="mt-1 text-xs text-ink-soft">{release.date}</p>
                    </div>
                    <ul className="grid gap-2">
                      {release.points.map((point) => (
                        <li key={point} className="text-sm leading-relaxed text-ink-soft">{point}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-16 border-t border-line px-5 py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="size-5" />
            Encre
          </span>
          <span className="flex-1" />
          <a href={SUITE} className="text-sm text-ink-soft hover:text-ink">Les autres apps Luth</a>
          <a href={DEPOT} className="text-sm text-ink-soft hover:text-ink">Le code</a>
          <a href={PAGE_VERSIONS} className="text-sm text-ink-soft hover:text-ink">Toutes les versions</a>
        </div>
      </footer>
    </>
  );
}
