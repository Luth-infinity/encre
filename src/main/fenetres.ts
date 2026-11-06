import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

/**
 * Deux fenêtres :
 * - la bulle, petite, transparente, toujours au-dessus, qui ne prend jamais le focus ;
 * - le panneau, qui s'ouvre à côté de la bulle, du côté où il y a de la place.
 */

export const TAILLE_BULLE = 132
const PANNEAU = { largeur: 420, hauteur: 660 }

let bulle: BrowserWindow | null = null
let panneau: BrowserWindow | null = null
/** Le panneau occupe tout l'écran de travail (la bulle se cache, elle ferait doublon). */
let plein = false

const vivante = (f: BrowserWindow | null): BrowserWindow | null => (f && !f.isDestroyed() ? f : null)
export const laBulle = (): BrowserWindow | null => vivante(bulle)
export const lePanneau = (): BrowserWindow | null => vivante(panneau)

function charger(f: BrowserWindow, vue: 'bulle' | 'panneau'): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) void f.loadURL(`${process.env.ELECTRON_RENDERER_URL}?vue=${vue}`)
  else void f.loadFile(join(__dirname, '../renderer/index.html'), { query: { vue } })
  f.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

const preferences = { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }

export function creerBulle(): BrowserWindow {
  const zone = screen.getPrimaryDisplay().workArea
  bulle = new BrowserWindow({
    width: TAILLE_BULLE,
    height: TAILLE_BULLE,
    x: zone.x + zone.width - TAILLE_BULLE - 24,
    y: zone.y + zone.height - TAILLE_BULLE - 24,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Encre',
    webPreferences: preferences
  })
  // Au-dessus des fenêtres ordinaires, mais pas d'un jeu en plein écran.
  bulle.setAlwaysOnTop(true, 'floating')
  bulle.once('ready-to-show', () => bulle?.showInactive())
  charger(bulle, 'bulle')
  bulle.on('closed', () => (bulle = null))
  return bulle
}

export function creerPanneau(): BrowserWindow {
  panneau = new BrowserWindow({
    width: PANNEAU.largeur,
    height: PANNEAU.hauteur,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Encre',
    // La veille (« Encre ») vit dans le panneau, qui reste caché la plupart du
    // temps : sans ça, Chromium ralentit une fenêtre cachée et l'oreille s'endort.
    webPreferences: { ...preferences, backgroundThrottling: false }
  })
  panneau.setAlwaysOnTop(true, 'floating')
  // En plein écran, le panneau est une fenêtre comme les autres : s'il passe
  // derrière (clic sur Firefox…), la bulle revient, sinon Tako disparaissait.
  panneau.on('blur', () => { if (plein) laBulle()?.showInactive() })
  panneau.on('focus', () => { if (plein) laBulle()?.hide() })
  charger(panneau, 'panneau')
  panneau.on('closed', () => (panneau = null))
  return panneau
}

/** Place le panneau contre la bulle, du côté de l'écran où il tient. */
function placer(): void {
  const b = laBulle(), p = lePanneau()
  if (!b || !p || plein) return
  const [bx, by] = b.getPosition()
  const zone = screen.getDisplayNearestPoint({ x: bx, y: by }).workArea
  const aGauche = bx + TAILLE_BULLE / 2 > zone.x + zone.width / 2
  const x = aGauche ? bx - PANNEAU.largeur - 4 : bx + TAILLE_BULLE + 4
  const y = Math.min(Math.max(zone.y + 8, by + TAILLE_BULLE - PANNEAU.hauteur), zone.y + zone.height - PANNEAU.hauteur - 8)
  p.setBounds({ x: Math.round(x), y: Math.round(y), width: PANNEAU.largeur, height: PANNEAU.hauteur })
}

/** D'où part l'encre : le centre de la bulle, en coordonnées du panneau. */
function origine(): { x: number; y: number } {
  const p = lePanneau(), b = laBulle()
  if (!p) return { x: 0, y: 0 }
  const [pw, ph] = p.getSize()
  if (!b || plein) return { x: pw / 2, y: ph / 2 }
  const [px, py] = p.getPosition(), [bx, by] = b.getPosition()
  return { x: bx + TAILLE_BULLE / 2 - px, y: by + TAILLE_BULLE / 2 - py }
}

let fermeture: NodeJS.Timeout | null = null

export function ouvrirPanneau(): void {
  const p = lePanneau() ?? creerPanneau()
  if (fermeture) { clearTimeout(fermeture); fermeture = null }
  placer()
  // Le panneau prépare son entrée (encre à zéro) avant de se montrer : pas d'éclair du panneau entier.
  p.webContents.send('ouvert', origine())
  setTimeout(() => {
    p.show()
    p.focus()
  }, 50)
}

function poserPlein(oui: boolean): void {
  const p = lePanneau(), b = laBulle()
  if (!p) return
  plein = oui
  if (oui) {
    const [x, y] = p.getPosition()
    const zone = screen.getDisplayNearestPoint({ x, y }).workArea
    // Plus au-dessus de tout : en grand, c'est une fenêtre de travail comme les autres.
    p.setAlwaysOnTop(false)
    p.setBounds(zone)
    b?.hide()
  } else {
    p.setAlwaysOnTop(true, 'floating')
    b?.showInactive()
    placer()
  }
  p.webContents.send('plein', oui)
}

export function basculerPlein(): void {
  poserPlein(!plein)
}

/**
 * Fermer le panneau, c'est toujours revenir à la bulle : en plein écran, la
 * bulle est cachée et le panneau n'est plus au premier plan, et la croix
 * faisait tout disparaître.
 */
export function fermerPanneau(): void {
  const p = lePanneau()
  if (!p?.isVisible() || fermeture) return
  // L'encre se résorbe vers la bulle, puis on cache. Filet : on cache quand même si le panneau ne répond pas.
  p.webContents.send('a-fermer', origine())
  fermeture = setTimeout(cacherPanneau, 700)
}

export function cacherPanneau(): void {
  if (fermeture) { clearTimeout(fermeture); fermeture = null }
  lePanneau()?.hide()
  if (plein) poserPlein(false)
  laBulle()?.showInactive()
}

export function basculerPanneau(): void {
  const p = lePanneau()
  // Plein écran passé derrière une autre fenêtre : la bulle le ramène devant.
  if (p?.isVisible() && plein && !p.isFocused()) {
    p.show()
    p.focus()
    return
  }
  if (p?.isVisible()) fermerPanneau()
  else ouvrirPanneau()
}

/**
 * Toujours `setBounds` avec la taille fixe, jamais `setPosition` : sous
 * Windows avec un affichage mis à l'échelle (125 %, 150 %), chaque
 * `setPosition` arrondit la taille vers le haut et la bulle gonflait à vue
 * d'œil pendant qu'on la traînait.
 */
function poserBulle(b: BrowserWindow, x: number, y: number): void {
  b.setBounds({ x: Math.round(x), y: Math.round(y), width: TAILLE_BULLE, height: TAILLE_BULLE })
}

export function deplacerBulle(dx: number, dy: number): void {
  const b = laBulle()
  if (!b) return
  const [x, y] = b.getPosition()
  poserBulle(b, x + dx, y + dy)
  if (lePanneau()?.isVisible()) placer()
}

/** Au lâcher, la bulle reste où on la pose ; on la ramène seulement si elle dépasse de l'écran. */
export function rangerBulle(): void {
  const b = laBulle()
  if (!b) return
  const [x, y] = b.getPosition()
  const zone = screen.getDisplayNearestPoint({ x: x + TAILLE_BULLE / 2, y: y + TAILLE_BULLE / 2 }).workArea
  const nx = Math.min(Math.max(zone.x, x), zone.x + zone.width - TAILLE_BULLE)
  const ny = Math.min(Math.max(zone.y, y), zone.y + zone.height - TAILLE_BULLE)
  poserBulle(b, nx, ny)
  if (lePanneau()?.isVisible()) placer()
}

export function aTous(canal: string, ...args: unknown[]): void {
  laBulle()?.webContents.send(canal, ...args)
  lePanneau()?.webContents.send(canal, ...args)
}
