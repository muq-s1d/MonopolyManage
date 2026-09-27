import { useEffect, useState } from 'react'
import { Gavel } from 'lucide-react'
import { money, name } from '../engine/engine.ts'
import type { Game, State } from '../engine/types.ts'
import type { Auction } from '../net/session.ts'

type Live = Auction & { ends: number }

/** Ready-made raises for the auctioneer, plus their own. */
export const STEP_PRESETS = [[1, 5, 10], [10, 20, 50], [10, 50, 100], [25, 50, 100]]

/** The auctioneer's choice of raises, before the bidding opens. */
export function StepPicker({ steps, onChange }: { steps: number[]; onChange: (s: number[]) => void }) {
  const [own, setOwn] = useState('')
  const key = steps.join(',')
  return (
    <div className="step-picker">
      <p className="field-label">Bids go up by</p>
      <div className="chips" role="radiogroup" aria-label="Bid steps">
        {STEP_PRESETS.map(p => (
          <button key={p.join()} type="button" role="radio" aria-checked={key === p.join(',')}
            className={`chip${key === p.join(',') ? ' on' : ''}`} onClick={() => { setOwn(''); onChange(p) }}>
            {p.map(n => `$${n}`).join(' / ')}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Or your own steps</span>
        <input className="input num" inputMode="numeric" placeholder="For example 5, 15, 40" value={own}
          onChange={e => {
            setOwn(e.target.value)
            const ns = [...new Set(e.target.value.split(/[^0-9]+/).filter(Boolean).map(Number))].filter(n => n >= 1 && n <= 1000).slice(0, 4)
            if (ns.length) onChange(ns.sort((a, b) => a - b))
          }} />
      </label>
    </div>
  )
}

function useSecondsLeft(ends: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [ends])
  return Math.max(0, Math.ceil((ends - now) / 1000))
}

/**
 * The auction running now, docked at the bottom of the screen where a thumb reaches it.
 * A phone bids for its own player; the host screen bids for the players who have no phone, and can stop it.
 */
export default function AuctionDock({ game, state, auction, me, onBid, proxies = [], onProxyBid, onStop }: {
  game: Game; state: State; auction: Live; me: string | null
  onBid?: (amount: number | null) => void
  proxies?: string[]; onProxyBid?: (pid: string, amount: number | null) => void; onStop?: () => void
}) {
  const b = game.board, c = b.cells[auction.cell], m = (n: number) => money(b, n)
  const left = useSecondsLeft(auction.ends)
  const top = auction.high?.amount ?? 0
  const band = b.groups.find(g => g.id === c.group)?.color
  const out = new Set(auction.out)
  const bidders = game.players.filter(p => !state.bankrupt[p.id])
  const call = left <= 2 ? 'Going twice' : left <= 4 ? 'Going once' : null

  const raises = (pid: string, bid: (n: number | null) => void) => {
    if (out.has(pid)) return <p className="muted small">Out of this auction</p>
    if (auction.high?.pid === pid) return <p className="auction-lead">Top bid. Wait for the others.</p>
    return (
      <div className="auction-raises">
        {auction.steps.map(k => (
          <button key={k} className="plaque" disabled={top + k > state.cash[pid]} onClick={() => bid(top + k)}
            title={top + k > state.cash[pid] ? `${name(game, pid)} has ${m(state.cash[pid])}` : undefined}>
            <span className="num">{m(top + k)}</span><small>+{m(k)}</small>
          </button>
        ))}
        <button className="ghost" onClick={() => bid(null)}>I&rsquo;m out</button>
      </div>
    )
  }

  return (
    <section className="auction-dock panel" role="region" aria-label={`Auction for ${c.name}`} aria-live="polite">
      <div className="auction-head">
        <i className="swatch" style={{ background: band ?? 'var(--brass)' }} aria-hidden="true" />
        <p className="auction-title"><Gavel size={18} aria-hidden="true" /> Auction: <strong>{c.name}</strong></p>
        <p className={`auction-clock num${left <= 4 ? ' hot' : ''}`} aria-label={`${left} seconds left`}>{left}s</p>
      </div>
      <div className="auction-bar" aria-hidden="true"><i key={auction.ends} style={{ animationDuration: `${Math.max(0, auction.ends - Date.now())}ms` }} /></div>
      <p className="auction-high">
        {auction.high ? <>Top bid <strong className="num">{m(auction.high.amount)}</strong> by <strong>{auction.high.pid === me ? 'you' : name(game, auction.high.pid)}</strong></> : 'No bids yet'}
        {call && auction.high && <span className="auction-call"> {call}…</span>}
      </p>
      {me && onBid && raises(me, onBid)}
      {proxies.filter(pid => !state.bankrupt[pid]).map(pid => (
        <div key={pid} className="auction-proxy">
          <p className="small"><strong>{name(game, pid)}</strong> <span className="muted">(no phone, {m(state.cash[pid])})</span></p>
          {raises(pid, n => onProxyBid?.(pid, n))}
        </div>
      ))}
      {out.size > 0 && <p className="muted small">Out: {bidders.filter(p => out.has(p.id)).map(p => p.name).join(', ')}</p>}
      {onStop && <button className="ghost small-btn" onClick={onStop}>Stop the auction</button>}
    </section>
  )
}
