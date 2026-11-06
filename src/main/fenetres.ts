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
  charger(panneau, 'panneau')
  panneau.on('closed', () => (panneau = null))
  return panneau
}

/** Place le panneau contre la bulle, du côté de l'écran où il tient. */
function placer(): void {
  const b = laBulle(), p = lePanneau()
  if (!b || !p) return
  const [bx, by] = b.getPosition()
  const zone = screen.getDisplayNearestPoint({ x: bx, y: by }).workArea
  const aGauche = bx + TAILLE_BULLE / 2 > zone.x + zone.width / 2
  const x = aGauche ? bx - PANNEAU.largeur - 4 : bx + TAILLE_BULLE + 4
  const y = Math.min(Math.max(zone.y + 8, by + TAILLE_BULLE - PANNEAU.hauteur), zone.y + zone.height - PANNEAU.hauteur - 8)
  p.setBounds({ x: Math.round(x), y: Math.round(y), width: PANNEAU.largeur, height: PANNEAU.hauteur })
}

export function ouvrirPanneau(): void {
  const p = lePanneau() ?? creerPanneau()
  placer()
  p.show()
  p.focus()
  p.webContents.send('ouvert')
}

export function basculerPanneau(): void {
  const p = lePanneau()
  if (p?.isVisible()) p.hide()
  else ouvrirPanneau()
}

export function deplacerBulle(dx: number, dy: number): void {
  const b = laBulle()
  if (!b) return
  const [x, y] = b.getPosition()
  b.setPosition(Math.round(x + dx), Math.round(y + dy))
  if (lePanneau()?.isVisible()) placer()
}

/** Au lâcher, la bulle se range contre le bord gauche ou droit le plus proche. */
export function rangerBulle(): void {
  const b = laBulle()
  if (!b) return
  const [x, y] = b.getPosition()
  const zone = screen.getDisplayNearestPoint({ x, y }).workArea
  const gauche = x + TAILLE_BULLE / 2 < zone.x + zone.width / 2
  const nx = gauche ? zone.x + 12 : zone.x + zone.width - TAILLE_BULLE - 12
  const ny = Math.min(Math.max(zone.y + 12, y), zone.y + zone.height - TAILLE_BULLE - 12)
  b.setPosition(nx, ny)
  if (lePanneau()?.isVisible()) placer()
}

export function aTous(canal: string, ...args: unknown[]): void {
  laBulle()?.webContents.send(canal, ...args)
  lePanneau()?.webContents.send(canal, ...args)
}
