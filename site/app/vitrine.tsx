import { JOURNAL, dateLisible } from './journal';
import { getTelechargements, PAGE_VERSIONS, type Telechargements } from './releases';
import { Abysses, Avatars, Humeurs, Tako, TakoNotes } from './tako';

const DEPOT = 'https://github.com/Luth-infinity/encre';
const SUITE = 'https://luth-apps.vercel.app';

const BASES: [string, string][] = [
  ['Un vrai Claude Code', 'Pas un chat de plus : Tako lit, écrit et lance des commandes dans le dossier de ton projet, avec ton CLAUDE.md, tes outils et tes sessions.'],
  ['Un projet par client', 'Chaque projet est un dossier, avec son contexte et ses outils. Dis « je bosse sur la refonte du site de mon client » : Tako crée le projet ou l’ouvre.'],
  ['Écris pendant qu’il bosse', 'Une autre idée en cours de route ? Envoie-la : il la prend entre deux étapes, sans tout arrêter.'],
  ['Réponds à un passage', 'Sélectionne un bout de sa réponse, clique « Répondre » : il sait exactement de quoi tu parles.'],
  ['Parle-lui', 'Alt+Maj+E de n’importe où, même panneau fermé. Il écoute, répond à voix haute, et tout s’écrit dans le fil.'],
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
        <span className="grid size-8 place-items-center rounded-[10px] bg-[#ffc933] text-[11px] font-extrabold text-[#1b1530]">CS</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[13.5px] leading-tight">Client · Refonte du site</strong>
          <small className="block truncate text-[11px] text-ink-soft">Documents/Encre/Projets</small>
        </span>
        <span className="text-ink-soft">＋ ⋯ ✕</span>
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
    'inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-card transition-transform hover:-translate-y-0.5';
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
        <a href="#journal" className={second}>Ce qui a changé</a>
      </div>
    </div>
  );
}

/** Une carte des nouveautés : la démo d'abord, puis le titre et le texte. */
function Carte({ titre, texte, version, children, large = false }: { titre: string; texte: string; version: string; children: React.ReactNode; large?: boolean }) {
  return (
    <article className={`carte flex flex-col rounded-[28px] bg-card p-6 sm:p-7 ${large ? 'lg:col-span-2' : ''}`}>
      <div className="demo flex min-h-[200px] flex-1 items-center justify-center rounded-[20px] bg-canvas p-5">{children}</div>
      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h3 className="text-[21px] font-bold tracking-tight">{titre}</h3>
        <span className="shrink-0 rounded-full bg-canvas px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">{version}</span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{texte}</p>
    </article>
  );
}

function DemoProjets() {
  const lignes: [string, string, string, string][] = [
    ['CS', '#ffc933', 'Client · Refonte du site', 'travaille'],
    ['AP', '#3cc8f2', 'App mobile', 'attend'],
    ['ND', '#ff9a3c', 'Notes de réunion', ''],
    ['✦', '#0b0c0e', 'Libre', '']
  ];
  return (
    <ul className="grid w-full max-w-[340px] gap-1.5">
      {lignes.map(([tag, couleur, nom, etat]) => (
        <li key={nom} className="flex items-center gap-3 rounded-[14px] bg-card px-3 py-2.5 text-[13.5px] font-semibold">
          <span className="grid size-7 -rotate-6 place-items-center rounded-[9px] text-[10px] font-extrabold" style={{ background: couleur, color: couleur === '#0b0c0e' ? '#b7a6f5' : '#1b1530' }}>{tag}</span>
          <span className="flex-1 truncate">{nom}</span>
          {etat && (
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
              <i className={`point ${etat}`} />
              {etat === 'travaille' ? 'Tako travaille…' : 'Attend ton accord'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DemoSujets() {
  const sujets: [string, boolean][] = [['Général', false], ['Ticket 142', true], ['Ticket 151', false]];
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-4 text-[13px]">
      <div className="flex flex-wrap gap-1.5">
        {sujets.map(([nom, on]) => (
          <span key={nom} className={`rounded-full px-3 py-1 font-semibold ${on ? 'bg-ink text-card' : 'bg-card text-ink-soft'}`}>{nom}</span>
        ))}
        <span className="rounded-full px-3 py-1 font-semibold text-ink-soft ring-1 ring-inset ring-black/10">＋ Sujet</span>
      </div>
      <ul className="grid gap-1.5">
        <li className="flex items-center justify-between rounded-[14px] bg-card px-3 py-2.5"><span className="text-ink-soft">Trois tickets dans une conversation</span><strong>746 k relus</strong></li>
        <li className="flex items-center justify-between rounded-[14px] bg-card px-3 py-2.5"><span className="text-ink-soft">Un sujet par ticket</span><strong>48 k relus</strong></li>
      </ul>
    </div>
  );
}

function DemoSuites() {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-3 text-[13px]">
      <p className="leading-relaxed">C’est en ligne : le formulaire envoie bien les messages, et j’ai ajouté un accusé de réception.</p>
      <p className="fait-mini">Fait en 14 s · Sonnet</p>
      <div className="flex flex-wrap justify-end gap-1.5">
        {['Montre-moi le résultat', 'Ajoute un captcha', 'Écris le message de confirmation'].map((s) => (
          <span key={s} className="suite rounded-full bg-card px-3 py-1.5 font-medium">{s}</span>
        ))}
      </div>
    </div>
  );
}

function DemoModele() {
  const tris: [string, string][] = [
    ['Corrige la faute dans le titre', 'Sonnet'],
    ['Pourquoi la connexion plante une fois sur deux ?', 'Opus'],
    ['Vas-y', 'Opus']
  ];
  return (
    <ul className="grid w-full max-w-[380px] gap-2 text-[13px]">
      {tris.map(([demande, modele]) => (
        <li key={demande} className="flex items-center gap-3">
          <span className="moi-mini flex-1">{demande}</span>
          <span className={`w-16 shrink-0 rounded-full px-2 py-1 text-center text-[11.5px] font-bold ${modele === 'Opus' ? 'bg-ink text-card' : 'bg-card'}`}>{modele}</span>
        </li>
      ))}
    </ul>
  );
}

function DemoEconomie() {
  return (
    <div className="flex w-full items-center justify-center gap-6">
      <TakoNotes className="size-36 flex-none sm:size-40" />
      <div className="grid gap-2 text-[13px]">
        <p className="font-semibold">Notes de reprise</p>
        <p className="leading-relaxed text-ink-soft">Formulaire fini, reste le captcha. Les couleurs sont dans globals.css.</p>
        <p className="fait-mini">Fait en 9 s · fil 32 k · coût ≈ 24 k</p>
      </div>
    </div>
  );
}

function DemoVoix() {
  return (
    <div className="flex w-full max-w-[380px] flex-col items-center gap-5">
      <div className="onde flex h-12 items-center gap-[5px]" aria-hidden>
        {Array.from({ length: 22 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 900}ms` }} />)}
      </div>
      <div className="grid w-full gap-1.5 text-[13px]">
        <p className="flex justify-between gap-3"><span className="font-mono text-ink-soft">RDV à 14:30</span><span>« rendez-vous à quatorze heures trente »</span></p>
        <p className="flex justify-between gap-3"><span className="font-mono text-ink-soft">le 3e PDF</span><span>« le troisième pé-dé-èf »</span></p>
      </div>
    </div>
  );
}

function DemoLimites() {
  const ligne = (nom: string, pct: number, ecoule: number, sous: string, couleur: string) => (
    <div className="grid gap-1">
      <div className="flex justify-between text-[12.5px] font-semibold"><span>{nom}</span><b>{pct} %</b></div>
      <i className="barre"><b style={{ width: `${pct}%`, background: couleur }} /><u style={{ left: `${ecoule}%` }} /></i>
      <small className="text-[11.5px] text-ink-soft">{sous}</small>
    </div>
  );
  return (
    <div className="grid w-full max-w-[320px] gap-3 rounded-[16px] bg-card p-4">
      <strong className="text-[12.5px]">Limites de ton compte Claude</strong>
      {ligne('5 heures glissantes', 82, 64, 'Reste 18 % · repart à zéro à 18:20 (dans 1 h 48)', '#ff9a3c')}
      {ligne('Semaine', 41, 55, 'Au rythme actuel, ~75 % à la fin', '#3ddc84')}
    </div>
  );
}

export default async function Vitrine() {
  const dl = await getTelechargements();
  const [recentes, anciennes] = [JOURNAL.slice(0, 6), JOURNAL.slice(6)];

  return (
    <>
      <header className="sticky top-0 z-30 bg-page">
        <nav className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
          <span className="flex items-center gap-2 font-bold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="size-7" />
            Encre
          </span>
          <span className="flex-1" />
          <a href="#nouveautes" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Nouveautés</a>
          <a href="#avatars" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Avatars</a>
          <a href="#installer" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Installer</a>
          <a href="#journal" className="hidden text-sm text-ink-soft hover:text-ink sm:block">Journal</a>
          <a href="#telecharger" className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-card">Télécharger</a>
        </nav>
      </header>

      <main>
        <section className="relative isolate overflow-hidden px-5 pb-28 pt-14 sm:pt-20">
          <Abysses className="absolute inset-0 -z-10 size-full" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            <div className="text-center sm:text-left">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[13px] font-semibold">
                <i className="point travaille" /> Nouveau : plusieurs projets à la fois, trois avatars, voix ElevenLabs
              </p>
              <h1 className="headline text-[12vw] sm:text-[78px] lg:text-[96px]">
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
              <Tako className="size-72 sm:size-[27rem]" />
            </div>
          </div>
        </section>

        <section id="nouveautes" className="scroll-mt-16 px-5 pb-28">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="headline max-w-[14ch] text-[44px] sm:text-[64px]">Ce qui vient d’arriver.</h2>
              <p className="max-w-[40ch] text-[15px] leading-relaxed text-ink-soft">
                Encre bouge vite : ces nouveautés sont toutes arrivées ces derniers jours. Le détail version par version est dans le{' '}
                <a href="#journal" className="font-semibold text-ink underline underline-offset-4">journal</a>.
              </p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <Carte large version="0.4.7" titre="Un sujet par ticket" texte="Dans un projet, ouvre un sujet par ticket ou par chantier : même dossier, mêmes outils, mais chacun sa conversation. Tako ne relit plus les autres à chaque action, et tes limites tiennent bien plus longtemps.">
                <DemoSujets />
              </Carte>
              <Carte large version="0.3.2" titre="Plusieurs projets en même temps" texte="Lance un chantier, passe à un autre projet, lances-en un deuxième : rien ne s’arrête. Un point te dit qui travaille et qui attend ton accord, la bulle prend la couleur la plus urgente.">
                <DemoProjets />
              </Carte>
              <Carte version="0.3.5" titre="Des réponses toutes prêtes" texte="Sous chaque réponse, trois choses que tu pourrais lui dire ensuite. Un clic, c’est parti.">
                <DemoSuites />
              </Carte>
              <Carte version="0.3.7" titre="Le bon modèle, tout seul" texte="Une question simple part sur Sonnet, un vrai problème sur Opus. Haiku trie en un mot pendant que Claude Code démarre.">
                <DemoModele />
              </Carte>
              <Carte large version="0.3.9" titre="Il prend des notes, tu paies moins" texte="Chaque réponse affiche ce qu’elle a coûté. Après 45 minutes de pause, Tako résume où vous en êtes et repart d’une session légère : plus de fil géant relu à chaque action.">
                <DemoEconomie />
              </Carte>
              <Carte large version="0.4.1" titre="Une vraie voix, en vrai français" texte="Branche ElevenLabs et donne à chaque avatar sa voix. Les heures, les nombres et les sigles sont dits comme tu les dirais.">
                <DemoVoix />
              </Carte>
              <Carte version="0.3.2" titre="Tes limites, en détail" texte="Survole les jauges : ce qui reste, l’heure de remise à zéro, et si ton rythme tiendra jusqu’au bout. Plusieurs comptes Claude ? Passe de l’un à l’autre d’un clic.">
                <DemoLimites />
              </Carte>
            </div>
          </div>
        </section>

        <section id="avatars" className="scroll-mt-16 px-5 pb-28">
          <div className="mx-auto max-w-6xl rounded-[36px] bg-canvas px-5 py-16 sm:px-12">
            <h2 className="headline max-w-[16ch] text-[44px] sm:text-[64px]">Trois têtes, un seul Claude.</h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
              Chaque compte Claude choisit son avatar : sa créature, ses couleurs, son nom, sa voix et son ton. Survole-les, clique-les.
            </p>
            <div className="mt-14">
              <Avatars />
            </div>
          </div>
        </section>

        <section className="px-5 pb-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
            <Panneau />
            <div>
              <h2 className="headline text-[44px] sm:text-[60px]">Tu lui parles comme à un collègue.</h2>
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

        <section className="px-5 pb-28">
          <div className="mx-auto max-w-6xl">
            <h2 className="headline max-w-[18ch] text-[44px] sm:text-[60px]">Un coup d’œil suffit.</h2>
            <p className="mt-4 max-w-[52ch] text-ink-soft">Sa couleur te dit où il en est, même panneau fermé. Choisis une humeur pour la voir.</p>
            <div className="mt-12">
              <Humeurs />
            </div>
          </div>
        </section>

        <section id="fonctions" className="px-5 pb-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="headline max-w-[16ch] text-[44px] sm:text-[60px]">Et tout Claude Code, en plus mignon.</h2>
            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {BASES.map(([titre, texte]) => (
                <div key={titre}>
                  <h3 className="text-[18px] font-bold tracking-tight">{titre}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="installer" className="scroll-mt-16 px-5 py-24">
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
                <p className="mt-2 text-[15px] text-ink-soft">Dans un terminal, tape <code className="font-mono">claude</code>, puis <code className="font-mono">/login</code>. Un autre compte ? Ajoute-le ensuite dans les réglages d’Encre.</p>
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

        <section id="telecharger" className="scroll-mt-16 px-5 py-8">
          <div className="relative isolate mx-auto flex max-w-5xl flex-col items-center overflow-hidden rounded-[36px] bg-canvas px-6 py-20 text-center">
            <Abysses className="absolute inset-0 -z-10 size-full" />
            <h2 className="headline text-[44px] sm:text-[64px]">Adopte Tako.</h2>
            <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Sur Windows, il se met à jour tout seul, en un clic. Sur Mac, reviens ici pour la nouvelle version.
            </p>
            <div className="mt-10">
              <Telecharger dl={dl} centre />
            </div>
          </div>
        </section>

        <section id="journal" className="scroll-mt-16 px-5 py-28">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="headline text-[44px] sm:text-[64px]">Journal des versions</h2>
              <p className="max-w-[38ch] text-[15px] leading-relaxed text-ink-soft">Ce qui change à chaque version, et pourquoi. Sur Windows, Encre te propose la mise à jour tout seul.</p>
            </div>
            <ol className="journal mt-14">
              {recentes.map((e) => <Version key={e.version} e={e} />)}
            </ol>
            {anciennes.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer list-none rounded-full bg-canvas px-5 py-3 text-center text-[15px] font-semibold hover:bg-card sm:inline-block">
                  Voir les {anciennes.length} versions précédentes
                </summary>
                <ol className="journal mt-10">
                  {anciennes.map((e) => <Version key={e.version} e={e} />)}
                </ol>
              </details>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-8 px-5 py-12">
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

function Version({ e }: { e: (typeof JOURNAL)[number] }) {
  const tag = !/^0\.[12]\./.test(e.version) ? `${PAGE_VERSIONS}/tag/v${e.version}` : null;
  return (
    <li className="version grid gap-3 pb-12 sm:grid-cols-[11rem_1fr] sm:gap-10">
      <div className="flex items-baseline gap-3 sm:block">
        {tag ? (
          <a href={tag} target="_blank" rel="noreferrer" className="headline text-[28px] hover:opacity-70">{e.version}</a>
        ) : (
          <span className="headline text-[28px]">{e.version}</span>
        )}
        <p className="text-[13px] text-ink-soft sm:mt-1">{dateLisible(e.date)}</p>
      </div>
      <div>
        <h3 className={`font-bold tracking-tight ${e.majeure ? 'text-[24px]' : 'text-[19px]'}`}>{e.titre}</h3>
        <p className="mt-2 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-soft">{e.texte}</p>
        {e.points.length > 0 && (
          <ul className="mt-4 grid max-w-[62ch] gap-1.5">
            {e.points.map((p) => (
              <li key={p} className="flex gap-3 text-[14.5px] leading-relaxed">
                <span className="mt-[9px] size-1.5 flex-none rounded-full bg-ink" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
