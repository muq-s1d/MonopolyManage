import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Player } from '../engine/types.ts'
import { sfx } from './sound.ts'

export const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl2') } catch { return false } })()

export const PLAYER_COLORS = [
  { name: 'Garnet', hex: '#B83A4B' }, { name: 'Sapphire', hex: '#3563B5' },
  { name: 'Marigold', hex: '#E3A42B' }, { name: 'Amethyst', hex: '#8457B3' },
  { name: 'Coral', hex: '#E27455' }, { name: 'Pearl', hex: '#E4DAC4' },
  { name: 'Turquoise', hex: '#3AAFA9' }, { name: 'Rose', hex: '#D9829B' },
]
export const ACCESSORIES = ['Top hat', 'Monocle', 'Cloche', 'Bowler', 'Newsboy cap', 'Flapper band', 'Pearls', 'Bow tie']

/** Dark or light ink, whichever reads better on a hex background (WCAG relative luminance). */
export function inkOn(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16)
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.22 ? '#1B1A17' : '#FFF9EA'
}

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- guilloche seal: layered hypotrochoids, unique per seed ----------

const sealCache = new Map<number, string[]>()
function rosette(seed: number): string[] {
  const hit = sealCache.get(seed)
  if (hit) return hit
  const rand = rng(seed * 7919 + 13)
  const layers = [{ r: 44, k: 0 }, { r: 34, k: 0 }, { r: 22, k: 0 }].map(({ r }) => {
    const k = 7 + Math.floor(rand() * 13)        // petals
    const d = 0.35 + rand() * 0.9                // pen distance, relative to the rolling circle
    const R = 1, rr = R / k, D = d * rr * k * 0.9
    const steps = 720
    const pts: string[] = []
    const scale = r / (R - rr + D)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2
      const x = (R - rr) * Math.cos(t) + D * Math.cos(((R - rr) / rr) * t)
      const y = (R - rr) * Math.sin(t) - D * Math.sin(((R - rr) / rr) * t)
      pts.push(`${(50 + x * scale).toFixed(1)} ${(50 + y * scale).toFixed(1)}`)
    }
    return `M${pts.join('L')}Z`
  })
  sealCache.set(seed, layers)
  return layers
}

export function Seal({ player, size = 56, initial = true }: { player: Player; size?: number; initial?: boolean }) {
  const [a, b, c] = rosette(player.seed)
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="var(--surface-2)" stroke="var(--brass)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="45.5" fill="none" stroke="var(--brass)" strokeWidth="0.5" strokeDasharray="1 1.6" />
      <g fill="none" stroke={player.color} strokeLinejoin="round">
        <path d={a} strokeWidth="0.7" />
        <path d={b} strokeWidth="0.6" opacity="0.85" />
        <path d={c} strokeWidth="0.55" opacity="0.9" />
      </g>
      {initial && (
        <>
          <circle cx="50" cy="50" r="13" fill={player.color} stroke="var(--brass-hi)" strokeWidth="1" />
          <text x="50" y="50" dy="0.36em" textAnchor="middle" className="seal-initial" fontSize="16" fill={inkOn(player.color)} style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / .25)', strokeWidth: 1 }}>
            {player.name.trim().charAt(0).toUpperCase() || '?'}
          </text>
        </>
      )}
    </svg>
  )
}

// ---------- odometer money ----------

const STRIP = <span>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <span key={d}>{d}</span>)}</span>

export function Money({ value, cur, className = '' }: { value: number; cur: string; className?: string }) {
  const s = Math.abs(value).toLocaleString('en-US')
  return (
    <span className={`money ${className}`}>
      <span className="sr-only">{`${value < 0 ? 'minus ' : ''}${cur}${s}`}</span>
      <span aria-hidden="true" style={{ display: 'contents' }}>
        {value < 0 && '-'}
        <span className="cur">{cur}</span>
        {[...s].map((ch, i) => {
          const key = s.length - i // keyed from the right so digits keep their column as the number grows
          return /\d/.test(ch)
            ? <span key={key} className="odo" style={{ ['--d' as string]: ch }}>{STRIP}</span>
            : <span key={`s${key}`}>{ch}</span>
        })}
      </span>
    </span>
  )
}

// ---------- teller window sheet on a native dialog ----------

export function Sheet({ title, eyebrow, onClose, children, foot, wide }: {
  title: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const d = ref.current!
    if (!d.open) { d.showModal(); sfx('tick') }
    const cancel = (e: Event) => { e.preventDefault(); close.current() }
    d.addEventListener('cancel', cancel)
    return () => d.removeEventListener('cancel', cancel)
  }, [])
  return (
    <dialog ref={ref} className="sheet" style={wide ? { width: 'min(1040px, calc(100vw - 24px))' } : undefined}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <header className="sheet-head">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        <button className="ghost icon-btn close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>
      <div className="sheet-body">{children}</div>
      {foot && <footer className="sheet-foot">{foot}</footer>}
    </dialog>
  )
}

export function Switch({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
      {help && <small>{help}</small>}
    </label>
  )
}

export function Pips({ level }: { level: number }) {
  if (!level) return null
  return (
    <span className="pips" aria-label={level === 5 ? 'hotel' : `${level} ${level === 1 ? 'house' : 'houses'}`}>
      {level === 5 ? <i className="pip hotel" /> : Array.from({ length: level }, (_, i) => <i key={i} className="pip" />)}
    </span>
  )
}
