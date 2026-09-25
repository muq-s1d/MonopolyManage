import { prefs } from '../store.ts'

let ctx: AudioContext | null = null

/** A small brass clink per coin, synthesized so the app ships no audio files. */
export function clink(coins: number) {
  if (prefs.get().sound === false) return
  try {
    ctx ??= new AudioContext()
    const t0 = ctx.currentTime
    for (let i = 0; i < Math.min(coins, 4); i++) {
      const t = t0 + i * 0.07
      for (const [freq, level] of [[2093, 0.12], [3136, 0.07], [4699, 0.035]]) {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq * (1 + i * 0.015)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(level, t + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.4)
      }
    }
  } catch { /* audio unavailable: stay silent */ }
}
