import {
  active, cellsOfGroup, dissolveOps, entry, groupLabel, groupOf, money, name, need, pactFor, pactName, splitByShares,
} from './engine.ts'
import type { Entry, Err, Game, Immunity, Loan, Op, Pact, State } from './types.ts'

const uid = () => crypto.randomUUID().slice(0, 8)
const whole = (n: number) => Number.isInteger(n) && n >= 0

// ---------- pacts ----------

export type PactDraft = Omit<Pact, 'id'>

/** The deeds a player owns in these groups. */
export const heldIn = (g: Game, s: State, pid: string, groups: string[]) =>
  groups.flatMap(gr => cellsOfGroup(g.board, gr)).filter(i => s.owner[i] === pid)

/** The reason a pact cannot be signed, or null when it is valid. `id` is the pact being edited. */
export function pactProblem(g: Game, s: State, d: PactDraft, id?: string): string | null {
  const members = [...new Set(d.members)]
  if (members.length < 2) return 'Pick at least two players'
  if (members.some(m => s.bankrupt[m] || !g.players.some(p => p.id === m))) return 'Only players still in the game can join'
  if (!d.groups.length) return 'Pick at least one set to pool'
  for (const gr of d.groups) {
    const other = Object.values(s.pacts).find(p => p.id !== id && p.groups.includes(gr))
    if (other) return `${groupLabel(g.board, gr)} is already pooled in the ${pactName(g.board, other)}`
  }
  const empty = members.find(m => !heldIn(g, s, m, d.groups).length)
  if (empty) return `${name(g, empty)} holds no deeds in the chosen sets`
  const shares = members.map(m => d.shares[m])
  if (shares.some(v => !Number.isInteger(v) || v < 1 || v > 99)) return 'Each share must be a whole percentage from 1 to 99'
  const total = shares.reduce((a, b) => a + b, 0)
  if (total !== 100) return `Shares add up to ${total}%, they need to make 100%`
  if (id) {
    // an edit may not strand buildings: keep every set and member that has buildings in the pact
    const old = s.pacts[id]
    for (const gr of old.groups) {
      const built = cellsOfGroup(g.board, gr).some(i => s.level[i] > 0 && old.members.includes(s.owner[i]!))
      if (!built) continue
      if (!d.groups.includes(gr)) return `${groupLabel(g.board, gr)} has buildings; sell them or dissolve the pact first`
      const gone = old.members.find(m => !members.includes(m) && heldIn(g, s, m, [gr]).length)
      if (gone) return `${name(g, gone)} holds built deeds in ${groupLabel(g.board, gr)}; sell the buildings first`
    }
  }
  return null
}

/** Shares proportional to the printed value each member pools, in steps of 5%, at least 5% each. */
export function suggestShares(g: Game, s: State, members: string[], groups: string[]): Record<string, number> {
  const value = Object.fromEntries(members.map(m => [m, heldIn(g, s, m, groups).reduce((t, i) => t + (g.board.cells[i].price ?? 0), 0)]))
  const base = members.every(m => !value[m]) ? Object.fromEntries(members.map(m => [m, 1])) : value
  const steps = splitByShares(20, base)
  for (const m of members) if (!steps[m]) {
    const top = members.reduce((a, b) => (steps[a] >= steps[b] ? a : b))
    steps[top]--; steps[m]++
  }
  return Object.fromEntries(members.map(m => [m, steps[m] * 5]))
}

/** Sets one member's share and spreads the rest over the others in their current proportions, at least 1% each. */
export function rebalance(shares: Record<string, number>, members: string[], who: string, value: number): Record<string, number> {
  const others = members.filter(m => m !== who)
  if (!others.length) return { [who]: 100 }
  const mine = Math.min(100 - others.length, Math.max(1, Math.round(value) || 1))
  const weights = Object.fromEntries(others.map(m => [m, Math.max(1, shares[m] || 0)]))
  const spread = splitByShares(100 - mine - others.length, weights)
  return Object.fromEntries(members.map(m => [m, m === who ? mine : spread[m] + 1]))
}

const shareText = (g: Game, p: PactDraft) => p.members.map(m => `${name(g, m)} ${p.shares[m]}%`).join(', ')

export function formPact(g: Game, s: State, d: PactDraft, id?: string): Entry | Err {
  const why = pactProblem(g, s, d, id)
  if (why) return { error: why }
  const members = [...new Set(d.members)]
  const pact: Pact = { id: id ?? uid(), members, shares: Object.fromEntries(members.map(m => [m, d.shares[m]])), groups: [...d.groups], allyRent: d.allyRent }
  const verb = id ? 'amended' : 'signed'
  const names = members.map(m => name(g, m))
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return entry(`${who} ${verb} the ${pactName(g.board, pact)}: ${shareText(g, pact)}. Allies ${pact.allyRent === 'free' ? 'stay free' : 'pay rent'} on its deeds.`, [
    { op: 'pact', id: pact.id, pact },
  ])
}

export function endPact(g: Game, s: State, id: string): Entry | Err {
  const pact = s.pacts[id]
  if (!pact) return { error: 'That pact has already ended' }
  const d = dissolveOps(g, s, pact)
  const tail = d.refund ? ` Buildings went back to the bank for ${money(g.board, d.refund)}, split ${Object.entries(d.credit).filter(([, v]) => v).map(([m, v]) => `${name(g, m)} ${money(g.board, v)}`).join(', ')}.` : ''
  return entry(`The ${pactName(g.board, pact)} was dissolved.${tail}`, d.ops)
}

// ---------- loans ----------

export type LoanDraft = { lender: string; borrower: string; amount: number; ratePct: number; rounds: number }

export const repayOf = (d: LoanDraft) => d.amount + Math.ceil((d.amount * d.ratePct) / 100)

export function loanProblem(g: Game, s: State, d: LoanDraft): string | Err | null {
  if (!d.lender || !d.borrower || d.lender === d.borrower) return 'Pick a lender and a different borrower'
  if (!active(g, s).some(p => p.id === d.lender) || !active(g, s).some(p => p.id === d.borrower)) return 'Only players still in the game can lend or borrow'
  if (!(d.amount > 0) || !Number.isInteger(d.amount)) return 'Enter a whole amount above zero'
  if (!whole(d.ratePct) || d.ratePct > 100) return 'Interest is a whole percentage from 0 to 100'
  if (!Number.isInteger(d.rounds) || d.rounds < 1 || d.rounds > 50) return 'Pick 1 to 50 rounds'
  return need(g, s, d.lender, d.amount)
}

export function lend(g: Game, s: State, d: LoanDraft): Entry | Err {
  const why = loanProblem(g, s, d)
  if (why) return typeof why === 'string' ? { error: why } : why
  const loan: Loan = { id: uid(), lender: d.lender, borrower: d.borrower, amount: d.amount, repay: repayOf(d), dueRound: s.round + d.rounds }
  return entry(`${name(g, d.lender)} lent ${name(g, d.borrower)} ${money(g.board, d.amount)}, to be repaid as ${money(g.board, loan.repay)} by round ${loan.dueRound} (${d.ratePct}% interest)`, [
    { op: 'transfer', from: d.lender, to: d.borrower, amount: d.amount },
    { op: 'loan', id: loan.id, loan },
  ])
}

// ponytail: loans are repaid in full only; add partial repayment if tables ask for it
export function repayLoan(g: Game, s: State, id: string): Entry | Err {
  const l = s.loans[id]
  if (!l) return { error: 'That loan is already settled' }
  const e = need(g, s, l.borrower, l.repay)
  if (e) return e
  return entry(`${name(g, l.borrower)} repaid ${name(g, l.lender)} ${money(g.board, l.repay)}`, [
    { op: 'transfer', from: l.borrower, to: l.lender, amount: l.repay },
    { op: 'loan', id, loan: null },
  ])
}

export function forgiveLoan(g: Game, s: State, id: string): Entry | Err {
  const l = s.loans[id]
  if (!l) return { error: 'That loan is already settled' }
  return entry(`${name(g, l.lender)} forgave ${name(g, l.borrower)}'s loan of ${money(g.board, l.repay)}`, [{ op: 'loan', id, loan: null }])
}

export const loansOf = (s: State, pid: string) => Object.values(s.loans).filter(l => l.borrower === pid || l.lender === pid)
export const dueLoans = (s: State, pid: string) => Object.values(s.loans).filter(l => l.borrower === pid && s.round >= l.dueRound)

// ---------- free rent passes ----------

export type PassDraft = { holder: string; grantor: string; group: string; landings: number; price: number }

export function passProblem(g: Game, s: State, d: PassDraft): string | Err | null {
  if (!d.holder || !d.grantor || d.holder === d.grantor) return 'Pick a buyer and a different owner'
  if (!active(g, s).some(p => p.id === d.holder) || !active(g, s).some(p => p.id === d.grantor)) return 'Only players still in the game can deal'
  if (!Number.isInteger(d.landings) || d.landings < 1 || d.landings > 20) return 'Pick 1 to 20 free landings'
  if (!whole(d.price)) return 'The price is a whole amount, zero or more'
  const covered = g.board.cells.some((_, i) => s.owner[i] === d.grantor && (d.group === 'all' || groupOf(g.board, i) === d.group) && !pactFor(g, s, i))
  if (!covered) return `${name(g, d.grantor)} has no unpooled deeds there to cover`
  return d.price ? need(g, s, d.holder, d.price) : null
}

export function grantPass(g: Game, s: State, d: PassDraft): Entry | Err {
  const why = passProblem(g, s, d)
  if (why) return typeof why === 'string' ? { error: why } : why
  const im: Immunity = { id: uid(), holder: d.holder, grantor: d.grantor, group: d.group, landings: d.landings }
  const where = d.group === 'all' ? 'deeds' : `${groupLabel(g.board, d.group)} deeds`
  const ops: Op[] = [{ op: 'immunity', id: im.id, immunity: im }]
  if (d.price) ops.unshift({ op: 'transfer', from: d.holder, to: d.grantor, amount: d.price })
  return entry(`${name(g, d.holder)} ${d.price ? 'bought' : 'was given'} ${d.landings} free ${d.landings === 1 ? 'landing' : 'landings'} on ${name(g, d.grantor)}'s ${where}${d.price ? ` for ${money(g.board, d.price)}` : ''}`, ops)
}

/** A pass that lets this payer land free on this deed. Pooled deeds are never covered. */
export function passFor(g: Game, s: State, payer: string, cell: number): Immunity | null {
  const owner = s.owner[cell], group = groupOf(g.board, cell)
  if (!owner || !group || pactFor(g, s, cell)) return null
  return Object.values(s.immunities).find(im => im.holder === payer && im.grantor === owner && (im.group === 'all' || im.group === group) && im.landings > 0) ?? null
}

export function usePass(g: Game, s: State, id: string, cell: number): Entry | Err {
  const im = s.immunities[id]
  if (!im) return { error: 'That pass is used up' }
  const left = im.landings - 1
  return entry(`${name(g, im.holder)} used a free landing on ${g.board.cells[cell].name} (${left} left)`, [
    { op: 'immunity', id, immunity: left > 0 ? { ...im, landings: left } : null },
  ])
}

export function cancelPass(g: Game, s: State, id: string): Entry | Err {
  const im = s.immunities[id]
  if (!im) return { error: 'That pass is already gone' }
  return entry(`${name(g, im.grantor)} cancelled ${name(g, im.holder)}'s free rent pass`, [{ op: 'immunity', id, immunity: null }])
}
