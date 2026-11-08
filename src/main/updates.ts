import { app } from 'electron'
import { journal } from './journal'

/**
 * Mise à jour automatique, comme Hublink : `electron-builder` publie
 * l'installeur et un `latest.yml` dans les releases GitHub, `electron-updater`
 * les lit, télécharge en silence et installe à la fermeture d'Encre.
 *
 * Tant que le dépôt est privé et sans release, la vérification échoue
 * proprement (journal) : rien ne s'affiche, rien ne casse.
 */

const INTERVALLE = 3 * 60 * 60 * 1000

export function surveiller(surPrete: (version: string) => void): void {
  // En développement il n'y a pas d'installeur à remplacer.
  if (!app.isPackaged) return
  // Squirrel.Mac exige une app signée et notariée : sur macOS, on reprend le .dmg du site.
  if (process.platform === 'darwin') return void journal('mise à jour auto : pas sur macOS (app non signée), voir le site')
  void chargeur()
    .then((autoUpdater) => {
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-downloaded', (i) => {
        journal(`mise à jour ${i.version} prête, installée à la fermeture`)
        surPrete(i.version)
      })
      autoUpdater.on('error', (e) => journal(`mise à jour : ${String(e?.message ?? e).slice(0, 200)}`))
      const verifier = (): void => void autoUpdater.checkForUpdates().catch(() => {})
      setTimeout(verifier, 30_000)
      setInterval(verifier, INTERVALLE)
    })
    .catch((e) => journal(`mise à jour indisponible : ${String(e)}`))
}

/** `electron-updater` est en CommonJS : chargé dynamiquement, il arrive sous `default`. */
async function chargeur(): Promise<import('electron-updater').AppUpdater> {
  const m = (await import('electron-updater')) as unknown as { autoUpdater?: import('electron-updater').AppUpdater; default?: { autoUpdater: import('electron-updater').AppUpdater } }
  return m.autoUpdater ?? m.default!.autoUpdater
}

/** Installe tout de suite, en silence, et rouvre Encre : sinon il fallait penser à le quitter. */
export async function installer(): Promise<void> {
  ;(await chargeur()).quitAndInstall(true, true)
}
