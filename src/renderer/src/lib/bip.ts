/**
 * Deux petits sons pour savoir où on en est sans regarder : une note qui
 * monte quand le micro s'ouvre, une qui descend quand ce que tu as dit part.
 */
let ctx: AudioContext | null = null

function note(de: number, a: number): void {
  ctx ??= new AudioContext()
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(de, t)
  osc.frequency.exponentialRampToValueAtTime(a, t + 0.12)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.2)
}

export const bipOuvert = (): void => note(660, 990)
export const bipEnvoye = (): void => note(880, 520)
