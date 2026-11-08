import { getReleases, getTelechargements, PAGE_VERSIONS, type Telechargements } from './releases';
import { Humeurs, Tako } from './tako';

const DEPOT = 'https://github.com/Luth-infinity/encre';
const SUITE = 'https://luth-apps.vercel.app';

const FONCTIONS: [string, string][] = [
  ['Un vrai Claude Code', 'Pas un chat de plus : Tako lit, écrit et lance des commandes dans le dossier de ton projet, avec ton CLAUDE.md, tes outils et tes sessions.'],
  ['Un projet par client', 'Chaque projet est un dossier, avec son contexte et ses outils. Dis « je bosse sur la refonte du site de mon client » : Tako crée le projet ou l’ouvre.'],
  ['Écris pendant qu’il bosse', 'Une autre idée en cours de route ? Envoie-la : il la prend entre deux étapes, sans tout arrêter.'],
  ['Réponds à un passage', 'Sélectionne un bout de sa réponse, clique « Répondre » : il sait exactement de quoi tu parles.'],
  ['Tes limites sous les yeux', 'Les jauges des 5 heures et de la semaine sont sous la saisie, avec l’heure où elles repartent à zéro.'],
  ['Tu gardes la main', 'Demander, Modifs auto ou Auto : chaque action passe par toi, ou seulement celles qui comptent.']
];

/**
 * Le panneau, rejoué en HTML : une capture ne montrerait pas le message
 * glissé pendant que Tako bosse.
 */
function Panneau() {
  return (
    <div className="panneau mx-auto w-full max-w-[400px] overflow-hidden rounded-[22px] bg-card text-left text-[13px]">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-[11px] font-extrabold text-card">ES</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[13.5px] leading-tight">Encre · Site</strong>
          <small className="block truncate text-[11px] text-ink-soft">Documents/Apps/encre</small>
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        <div className="moi">Ajoute un mode sombre au site</div>
        <div className="qui">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tako.png" alt="" />
          Tako
        </div>
        <p className="leading-relaxed">Je regarde comment les couleurs sont rangées, puis je bascule tout sur des variables.</p>
        <p className="text-[12px] font-medium text-ink-soft">4 étapes · Modifie globals.css</p>
        <div className="moi pendant">Et garde le violet pour les liens</div>
        <div className="attente"><i /><i /><i /></div>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex items-center gap-2 rounded-[18px] bg-canvas py-2 pl-3.5 pr-2">
          <span className="flex-1 text-ink-soft">Une autre idée ? Tako la prend en route…</span>
          <span className="grid size-8 place-items-center rounded-full bg-erreur text-[10px] text-white">■</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
          <div className="flex gap-1 rounded-full bg-canvas p-[3px] font-semibold">
            <span className="px-2.5 py-1">Demander</span>
            <span className="rounded-full bg-ink px-2.5 py-1 text-card">Modifs auto</span>
            <span className="px-2.5 py-1">Auto</span>
          </div>
          <div className="flex gap-2.5">
            <span className="flex items-center gap-1"><b className="font-semibold">5 h</b><i className="jauge"><b style={{ width: '58%' }} /></i>58 %</span>
            <span className="flex items-center gap-1"><b className="font-semibold">Sem.</b><i className="jauge"><b style={{ width: '28%' }} /></i>28 %</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Telecharger({ dl, centre = false }: { dl: Telechargements; centre?: boolean }) {
  const principal =
    'inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-card transition-opacity hover:opacity-85';
  const second = 'text-sm text-ink-soft underline-offset-4 hover:underline';
  return (
    <div className={`flex flex-col gap-4 ${centre ? 'items-center' : 'items-center sm:items-start'}`}>
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

export default async function Vitrine() {
  const [dl, releases] = await Promise.all([getTelechargements(), getReleases('fr')]);

  return (
    <>
      <header className="sticky top-0 z-20 bg-page">
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
        <section className="px-5 pb-24 pt-14 sm:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <div className="text-center sm:text-left">
              <h1 className="headline text-[12vw] sm:text-[78px] lg:text-[92px]">
                Claude Code,
                <br />
                <span className="text-ink-soft">dans une bulle.</span>
              </h1>
              <p className="mx-auto mt-7 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft sm:mx-0">
                Tako est un petit poulpe qui flotte sur ton bureau, toujours au-dessus. Un clic, et c’est Claude Code qui
                travaille dans ton projet : il lit, il écrit, il lance, et il te demande avant de toucher à quoi que ce soit.
              </p>
              <div className="mt-10">
                <Telecharger dl={dl} />
              </div>
              <p className="mt-5 text-sm text-ink-soft">Gratuit, sur Windows et macOS. Il passe par ton propre compte Claude.</p>
            </div>
            <div className="flex justify-center">
              <Tako className="size-72 sm:size-[26rem]" />
            </div>
          </div>
        </section>

        <section className="px-5 pb-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 rounded-[32px] bg-canvas px-5 py-14 sm:px-12 lg:grid-cols-[1fr_1.1fr]">
            <Panneau />
            <div>
              <h2 className="headline text-[40px] sm:text-[56px]">Tu lui parles comme à un collègue.</h2>
              <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-ink-soft">
                Il dit ce qu’il fait avant chaque étape, regroupe ses actions et te montre le diff avant d’écrire. Si une
                idée te vient pendant qu’il bosse, envoie-la : il la prend au vol.
              </p>
              <dl className="mt-8 grid gap-4 text-[15px]">
                <div><dt className="font-semibold">Ctrl+Maj+Espace</dt><dd className="text-ink-soft">l’ouvre de n’importe où</dd></div>
                <div><dt className="font-semibold">Alt+Maj+E</dt><dd className="text-ink-soft">pour lui parler à voix haute</dd></div>
                <div><dt className="font-semibold">Glisser, coller, « / »</dt><dd className="text-ink-soft">pour joindre un fichier ou lancer une commande</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="px-5 pb-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="headline max-w-[18ch] text-[40px] sm:text-[56px]">Un coup d’œil à Tako suffit.</h2>
            <p className="mt-4 max-w-[52ch] text-ink-soft">Sa couleur te dit où il en est, même panneau fermé. Choisis une humeur pour la voir.</p>
            <div className="mt-12">
              <Humeurs />
            </div>
          </div>
        </section>

        <section id="fonctions" className="px-5 py-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="headline max-w-[16ch] text-[40px] sm:text-[56px]">Tout Claude Code, en plus mignon.</h2>
            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONS.map(([titre, texte]) => (
                <div key={titre}>
                  <h3 className="text-[18px] font-bold tracking-tight">{titre}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="installer" className="px-5 py-24">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-3">
            <div>
              <h2 className="headline text-[40px] sm:text-[52px]">Trois minutes pour l’installer.</h2>
              <p className="mt-4 text-ink-soft">Encre passe par le Claude Code de ta machine : c’est ton compte Claude (Pro ou Max) qui travaille.</p>
            </div>
            <ol className="grid gap-8 lg:col-span-2">
              <li>
                <h3 className="font-bold"><span className="text-ink-soft">1.</span> Installe Claude Code</h3>
                <code className="mt-3 block overflow-x-auto rounded-xl bg-canvas px-4 py-3 font-mono text-[13px]">npm install -g @anthropic-ai/claude-code</code>
              </li>
              <li>
                <h3 className="font-bold"><span className="text-ink-soft">2.</span> Connecte-toi une fois</h3>
                <p className="mt-2 text-[15px] text-ink-soft">Dans un terminal, tape <code className="font-mono">claude</code>, puis <code className="font-mono">/login</code>.</p>
              </li>
              <li>
                <h3 className="font-bold"><span className="text-ink-soft">3.</span> Lance Encre</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                  Tako apparaît en bas à droite. Sur Mac, l’app n’est pas encore signée par Apple : au premier lancement,
                  fais un clic droit sur Encre dans Applications, puis « Ouvrir ».
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section id="telecharger" className="px-5 py-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center rounded-[36px] bg-canvas px-6 py-16 text-center">
            <h2 className="headline text-[40px] sm:text-[56px]">Adopte Tako.</h2>
            <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Sur Windows, il se met à jour tout seul. Sur Mac, reviens ici pour la nouvelle version.
            </p>
            <div className="mt-10">
              <Telecharger dl={dl} centre />
            </div>
          </div>
        </section>

        {releases.length > 0 && (
          <section id="versions" className="px-5 py-24">
            <div className="mx-auto max-w-6xl">
              <h2 className="headline text-[40px] sm:text-[54px]">Ce qui a changé</h2>
              <ul className="mt-12 grid gap-10">
                {releases.map((release) => (
                  <li key={release.version} className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                    <div>
                      <a href={release.page} className="headline text-[24px] hover:opacity-80" target="_blank" rel="noreferrer">
                        {release.version}
                      </a>
                      <p className="mt-1 text-xs text-ink-soft">{release.date}</p>
                    </div>
                    <ul className="grid gap-2">
                      {release.points.map((point) => (
                        <li key={point} className="text-[15px] leading-relaxed text-ink-soft">{point}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-16 px-5 py-12">
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
