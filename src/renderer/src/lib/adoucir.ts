/**
 * La sortie de la voix, adoucie.
 *
 * Certaines voix (ElevenLabs surtout) arrivent normalisées tout près du
 * maximum : les pointes « pètent » dans les oreilles. Un compresseur écrase
 * les pointes, puis un gain ramène le tout un cran plus bas. Toutes les voix
 * passent par là, pour qu'elles aient le même volume entre elles.
 */
export function sortieDouce(ctx: AudioContext): AudioNode {
  const compresseur = ctx.createDynamicsCompressor()
  compresseur.threshold.value = -20
  compresseur.knee.value = 12
  compresseur.ratio.value = 4
  compresseur.attack.value = 0.003
  compresseur.release.value = 0.25
  const gain = ctx.createGain()
  gain.gain.value = 0.85
  compresseur.connect(gain).connect(ctx.destination)
  return compresseur
}
