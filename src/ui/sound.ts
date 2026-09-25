import type { Entry } from '../engine/types.ts'
import { prefs } from '../store.ts'

// A tiny chiptune synth: NES style pulse and triangle voices, softened by a low pass filter
// so the table gets arcade charm without anything shrill. Every jingle is original and synthesized.

export type Sfx =
  | 'coin' | 'bigCoin' | 'jackpot' | 'pay' | 'rent' | 'buy' | 'house' | 'hotel' | 'sell'
  | 'mortgage' | 'unmortgage' | 'jail' | 'free' | 'card' | 'turn' | 'trade' | 'bankrupt'
  | 'victory' | 'undo' | 'error' | 'tick' | 'shuffle' | 'start'

type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle'
type Voice = { at: number; f: number; d: number; w?: Wave; v?: number; to?: number; vib?: number }

const NOTE: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }
/** 'C5', 'F#4', 'Bb3' to hertz, A4 = 440. */
export function hz(n: string) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n)!
  const semis = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12
  return 440 * 2 ** (semis / 12)
}

/** Notes played one after another: [note, seconds] pairs, null note for a rest. */
function seq(start: number, notes: [string | null, number][], w: Wave = 'pulse25', v = 1): Voice[] {
  let t = start
  return notes.flatMap(([n, d]) => { const out = n ? [{ at: t, f: hz(n), d, w, v }] : []; t += d; return out })
}

const SFX: Record<Sfx, () => Voice[]> = {
  coin: () => seq(0, [['E6', 0.07], ['A6', 0.28]], 'pulse25', 0.8),
  bigCoin: () => [...seq(0, [['E6', 0.06], ['A6', 0.12]], 'pulse25', 0.8), ...seq(0.2, [['E6', 0.06], ['C#7', 0.3]], 'pulse25', 0.8)],
  jackpot: () => [
    ...['E6', 'G6', 'A6', 'C7', 'E7', 'A6', 'C7', 'E7'].map((n, i) => ({ at: i * 0.065, f: hz(n), d: 0.14, w: 'pulse25' as Wave, v: 0.6 })),
    { at: 0.56, f: hz('A6'), d: 0.5, w: 'pulse12', v: 0.7, vib: 6 },
  ],
  pay: () => seq(0, [['E5', 0.06], ['C5', 0.06], ['A4', 0.16]], 'triangle', 1.1),
  rent: () => [...seq(0, [['E5', 0.06], ['C5', 0.06], ['A4', 0.12]], 'triangle', 1.1), ...seq(0.26, [['E6', 0.07], ['A6', 0.26]], 'pulse25', 0.7)],
  buy: () => [
    ...seq(0, [['C5', 0.07], ['E5', 0.07], ['G5', 0.07], ['C6', 0.3]], 'pulse25', 0.8),
    ...seq(0.21, [['E6', 0.05], ['G6', 0.05], ['C7', 0.2]], 'pulse12', 0.35),
    { at: 0, f: hz('C4'), d: 0.5, w: 'triangle', v: 0.8 },
  ],
  house: () => seq(0, [['C5', 0.04], ['D5', 0.04], ['E5', 0.04], ['G5', 0.04], ['A5', 0.04], ['C6', 0.18]], 'pulse25', 0.7),
  hotel: () => [
    ...seq(0, [['C5', 0.04], ['E5', 0.04], ['G5', 0.04], ['C6', 0.04], ['E6', 0.04], ['G6', 0.04]], 'pulse25', 0.7),
    ...seq(0.3, [['C6', 0.1], ['G5', 0.1], ['C6', 0.1], ['E6', 0.4]], 'pulse50', 0.55),
    { at: 0.3, f: hz('C4'), d: 0.7, w: 'triangle', v: 0.9 },
  ],
  sell: () => seq(0, [['C6', 0.04], ['A5', 0.04], ['G5', 0.04], ['E5', 0.12]], 'pulse25', 0.6),
  mortgage: () => seq(0, [['A3', 0.09], ['E3', 0.22]], 'triangle', 1.2),
  unmortgage: () => seq(0, [['E4', 0.08], ['A4', 0.08], ['E5', 0.2]], 'triangle', 1.1),
  jail: () => [
    ...seq(0, [['G4', 0.22], ['F#4', 0.22], ['F4', 0.22]], 'triangle', 1.1),
    { at: 0.66, f: hz('E4'), d: 0.7, w: 'triangle', v: 1.1, vib: 5, to: hz('D4') },
  ],
  free: () => [{ at: 0, f: 330, d: 0.16, w: 'pulse50', v: 0.6, to: 990 }, ...seq(0.16, [['E6', 0.12]], 'pulse25', 0.5)],
  card: () => ['B5', 'E6', 'G#6', 'B6', 'E7'].map((n, i) => ({ at: i * 0.045, f: hz(n), d: 0.12, w: 'pulse12' as Wave, v: 0.45 })),
  turn: () => seq(0, [['A5', 0.05], ['E6', 0.1]], 'pulse50', 0.4),
  trade: () => [...seq(0, [['C6', 0.06], ['G5', 0.06]], 'pulse25', 0.6), ...seq(0.14, [['G5', 0.06], ['C6', 0.06], ['E6', 0.18]], 'pulse25', 0.6)],
  bankrupt: () => [
    ...seq(0, [['E5', 0.18], ['D5', 0.18], ['C5', 0.18], ['B4', 0.18], ['G4', 0.3]], 'pulse50', 0.55),
    { at: 1.02, f: hz('C4'), d: 0.9, w: 'triangle', v: 1.2, vib: 4, to: hz('A3') },
    ...seq(0, [['C4', 0.36], ['G3', 0.36], ['E3', 0.3]], 'triangle', 0.9),
  ],
  victory: () => [
    ...seq(0, [['G4', 0.1], ['C5', 0.1], ['E5', 0.1], ['G5', 0.2], ['E5', 0.1], ['G5', 0.6]], 'pulse25', 0.75),
    ...seq(0, [['E4', 0.1], ['G4', 0.1], ['C5', 0.1], ['E5', 0.2], ['C5', 0.1], ['E5', 0.6]], 'pulse12', 0.4),
    ...seq(0, [['C3', 0.3], ['G3', 0.3], ['C4', 0.7]], 'triangle', 1),
    { at: 0.72, f: hz('G6'), d: 0.5, w: 'pulse12', v: 0.25, vib: 7 },
  ],
  undo: () => [{ at: 0, f: 1200, d: 0.09, w: 'pulse25', v: 0.5, to: 500 }, { at: 0.1, f: 900, d: 0.09, w: 'pulse25', v: 0.4, to: 380 }],
  error: () => [{ at: 0, f: 140, d: 0.1, w: 'pulse50', v: 0.5 }, { at: 0.13, f: 110, d: 0.16, w: 'pulse50', v: 0.5 }],
  tick: () => [{ at: 0, f: hz('E6'), d: 0.035, w: 'pulse50', v: 0.22 }],
  shuffle: () => Array.from({ length: 9 }, (_, i) => ({ at: i * 0.045, f: hz(['C6', 'G5', 'E6', 'A5', 'D6', 'F5', 'B5', 'E5', 'C6'][i]), d: 0.04, w: 'pulse50' as Wave, v: 0.35 })),
  start: () => [
    ...seq(0, [['C5', 0.08], ['G4', 0.08], ['C5', 0.08], ['E5', 0.08], ['G5', 0.16], ['C6', 0.4]], 'pulse25', 0.7),
    ...seq(0, [['C3', 0.32], ['G3', 0.16], ['C4', 0.5]], 'triangle', 1),
  ],
}

/** Which sound a ledger entry makes, read from its operations. */
export function soundFor(e: Entry): Sfx {
  const ops = e.ops
  const has = (op: string) => ops.some(o => o.op === op)
  if (has('bankrupt')) return 'bankrupt'
  const jail = ops.find(o => o.op === 'jail')
  if (jail && jail.op === 'jail') return jail.in ? 'jail' : 'free'
  const build = ops.find(o => o.op === 'build')
  if (build && build.op === 'build') {
    const paid = ops.some(o => o.op === 'transfer' && o.to === 'bank')
    return paid ? (build.level === 5 ? 'hotel' : 'house') : 'sell'
  }
  const mort = ops.find(o => o.op === 'mortgage')
  if (mort && mort.op === 'mortgage') return mort.on ? 'mortgage' : 'unmortgage'
  const owns = ops.filter(o => o.op === 'own')
  if (owns.length) {
    // A purchase is one deed for one payment to the bank. Anything else that moves deeds is a trade.
    // ponytail: a trade of a single mortgaged deed with no cash (only the 10% fee) chimes like a purchase
    const cash = ops.filter(o => o.op === 'transfer')
    return owns.length === 1 && cash.length === 1 && cash[0].op === 'transfer' && cash[0].to === 'bank' ? 'buy' : 'trade'
  }
  if (has('turn')) return 'turn'
  if (has('jailCard')) return ops.some(o => o.op === 'jailCard' && o.delta > 0) ? 'card' : 'free'
  const moves = ops.flatMap(o => (o.op === 'transfer' ? [o] : []))
  if (!moves.length) return 'tick'
  if (moves.some(m => m.from === 'pot')) return 'jackpot'
  const player = (p: string) => p !== 'bank' && p !== 'pot'
  if (moves.every(m => player(m.from) && player(m.to))) return 'rent'
  if (moves.every(m => player(m.to))) return moves.reduce((n, m) => n + m.amount, 0) >= 200 ? 'bigCoin' : 'coin'
  return 'pay'
}

// ---------- playback ----------

const waves = new WeakMap<BaseAudioContext, Record<string, PeriodicWave>>()
function wave(ctx: BaseAudioContext, w: Wave) {
  let cache = waves.get(ctx)
  if (!cache) { cache = {}; waves.set(ctx, cache) }
  if (cache[w]) return cache[w]
  const duty = w === 'pulse12' ? 0.125 : w === 'pulse25' ? 0.25 : 0.5
  const n = 32, re = new Float32Array(n), im = new Float32Array(n)
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) // Fourier series of a pulse wave
  return (cache[w] = ctx.createPeriodicWave(re, im))
}

/** Schedules a sound on any audio context (live or offline) and returns its length in seconds. */
export function render(ctx: BaseAudioContext, name: Sfx, at = ctx.currentTime, volume = 0.22) {
  const out = ctx.createGain()
  out.gain.value = volume
  const soften = ctx.createBiquadFilter()
  soften.type = 'lowpass'
  soften.frequency.value = 4200
  out.connect(soften).connect(ctx.destination)
  let end = 0
  for (const v of SFX[name]()) {
    const t = at + v.at, osc = ctx.createOscillator(), env = ctx.createGain()
    if (v.w === 'triangle') osc.type = 'triangle'
    else osc.setPeriodicWave(wave(ctx, v.w ?? 'pulse25'))
    osc.frequency.setValueAtTime(v.f, t)
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t + v.d)
    if (v.vib) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain()
      lfo.frequency.value = v.vib
      depth.gain.value = v.f * 0.02
      lfo.connect(depth).connect(osc.frequency)
      lfo.start(t); lfo.stop(t + v.d + 0.05)
    }
    const peak = (v.v ?? 1) * (v.w === 'triangle' ? 0.9 : 1.5) // balanced by measured RMS: normalized pulses came out ~15 dB under triangles
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.006)
    env.gain.setValueAtTime(peak, t + Math.max(0.006, v.d * 0.55))
    env.gain.exponentialRampToValueAtTime(0.0001, t + v.d + 0.04)
    osc.connect(env).connect(out)
    osc.start(t); osc.stop(t + v.d + 0.06)
    end = Math.max(end, v.at + v.d + 0.06)
  }
  return end
}

let live: AudioContext | null = null

export function sfx(name: Sfx) {
  if (prefs.get().sound === false) return
  try {
    live ??= new AudioContext()
    if (live.state === 'suspended') void live.resume()
    render(live, name)
  } catch { /* audio unavailable: stay silent */ }
}
