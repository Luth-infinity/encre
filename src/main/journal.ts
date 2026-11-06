import { app } from 'electron'
import { appendFileSync } from 'fs'
import { join } from 'path'

/** `%APPDATA%/encre/journal.log` : `console.log` du main n'atteint pas la sortie standard sous Windows. */
export function journal(ligne: string): void {
  try {
    appendFileSync(join(app.getPath('userData'), 'journal.log'), `${new Date().toISOString()} ${ligne}\n`, 'utf-8')
  } catch {
    // Un journal qui échoue ne doit rien casser.
  }
}
