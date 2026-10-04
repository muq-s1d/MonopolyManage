import { apply, initialState, netWorth } from './engine.ts'
import type { Entry, Game, Op } from './types.ts'

/** What a finished game looks like in numbers, read from its ledger. */
export type Highlights = {
  /** Net worth of every player at the start (round 0), after each round, and now (the round in progress). */
  worth: { round: number; values: Record<string, number> }[]
  /** Rent each player collected. */
  rent: Record<string, number>
  /** Times each player passed or landed on Go. */
  go: Record<string, number>
  /** Times each player went to jail. */
  jail: Record<string, number>
  /** The priciest deed bought, at the printed price or at auction. */
  buy: { pid: string; cell: number; amount: number } | null
  /** The biggest single payment from one player to another. */
  payment: { from: string; to: string; amount: number; memo: string } | null
}

const isPlayer = (p: string) => p !== 'bank' && p !== 'pot'

export function highlights(g: Game, entries: Entry[]): Highlights {
  const per = () => Object.fromEntries(g.players.map(p => [p.id, 0]))
  const h: Highlights = { worth: [], rent: per(), go: per(), jail: per(), buy: null, payment: null }
  const s = initialState(g)
  const snapshot = () => ({ round: s.round, values: Object.fromEntries(g.players.map(p => [p.id, netWorth(g, s, p.id).total])) })
  h.worth.push({ ...snapshot(), round: 0 })
  let fresh = false // entries since the last round ended
  for (const e of entries) {
    fresh = true
    const at = e.ops.findIndex(o => o.op === 'at')
    const before = at < 0 ? [] : e.ops.slice(0, at), after = at < 0 ? e.ops : e.ops.slice(at + 1)
    const transfers = (ops: Op[]) => ops.flatMap(o => (o.op === 'transfer' ? [o] : []))
    // a landing: the salary on the way, then rent paid on the square
    for (const t of transfers(before)) if (t.from === 'bank' && isPlayer(t.to)) h.go[t.to]++
    if (at >= 0) for (const t of transfers(after)) if (isPlayer(t.from) && isPlayer(t.to)) h.rent[t.to] += t.amount
    // a purchase: one deed, paid to the bank by its new owner
    const owns = after.flatMap(o => (o.op === 'own' ? [o] : [])), paid = transfers(after)
    if (owns.length === 1 && paid.length === 1 && paid[0].to === 'bank' && paid[0].from === owns[0].owner && !e.ops.some(o => o.op === 'bankrupt'))
      if (!h.buy || paid[0].amount > h.buy.amount) h.buy = { pid: paid[0].from, cell: owns[0].cell, amount: paid[0].amount }
    for (const t of transfers(e.ops)) if (isPlayer(t.from) && isPlayer(t.to) && (!h.payment || t.amount > h.payment.amount)) h.payment = { from: t.from, to: t.to, amount: t.amount, memo: e.memo }
    for (const o of e.ops) {
      if (o.op === 'jail' && o.in) h.jail[o.player]++
      const round = s.round
      apply(s, o, g)
      if (s.round !== round) { h.worth.push({ ...snapshot(), round }); fresh = false } // the round just finished
    }
  }
  if (fresh) h.worth.push(snapshot())
  return h
}

/** The player with the highest count, or null when nobody has any. */
export const leader = (counts: Record<string, number>) => {
  const [id, n] = Object.entries(counts).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0])
  return n > 0 ? { id, n } : null
}
