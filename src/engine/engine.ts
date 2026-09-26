import type { Board, Card, Entry, Err, Game, Op, Pact, Party, Rules, State } from './types.ts'

export const defaultRules: Rules = {
  freeParking: true, doubleGo: false, auctions: true, evenBuild: true,
  bankLimit: true, mortgageInterest: true, setDoubleRent: true, noRentInJail: false, deals: true,
}

export const isErr = (x: unknown): x is Err => typeof x === 'object' && x !== null && 'error' in x

export const money = (b: Board, n: number) => `${b.currency}${n.toLocaleString('en-US')}`

// ---------- state ----------

export function initialState(g: Game): State {
  const per = <T,>(v: T) => Object.fromEntries(g.players.map(p => [p.id, v]))
  const n = g.board.cells.length
  return {
    cash: per(g.board.startingCash), pot: 0, bank: 0,
    owner: Array(n).fill(null), level: Array(n).fill(0), mortgaged: Array(n).fill(false),
    jailed: per(false), jailTurns: per(0), jailCards: per(0), bankrupt: per(false),
    turn: g.players[0]?.id ?? '', round: 1,
    pacts: {}, loans: {}, immunities: {},
  }
}

function put<T>(rec: Record<string, T>, id: string, value: T | null) {
  if (value) rec[id] = value
  else delete rec[id]
}

function move(s: State, p: Party, delta: number) {
  if (p === 'bank') s.bank += delta
  else if (p === 'pot') s.pot += delta
  else s.cash[p] += delta
}

export function apply(s: State, o: Op, g: Game) {
  switch (o.op) {
    case 'transfer': move(s, o.from, -o.amount); move(s, o.to, o.amount); break
    case 'own': s.owner[o.cell] = o.owner; break
    case 'build': s.level[o.cell] = o.level; break
    case 'mortgage': s.mortgaged[o.cell] = o.on; break
    case 'jail': s.jailed[o.player] = o.in; s.jailTurns[o.player] = 0; break
    case 'jailCard': s.jailCards[o.player] += o.delta; break
    case 'bankrupt': s.bankrupt[o.player] = true; break
    case 'pact': put(s.pacts, o.id, o.pact); break
    case 'loan': put(s.loans, o.id, o.loan); break
    case 'immunity': put(s.immunities, o.id, o.immunity); break
    case 'turn': {
      const ids = g.players.map(p => p.id)
      if (ids.indexOf(o.player) <= ids.indexOf(s.turn)) s.round++
      s.turn = o.player
      if (s.jailed[o.player]) s.jailTurns[o.player]++
    }
  }
}

export function replay(g: Game, entries: Entry[]): State {
  const s = initialState(g)
  for (const e of entries) for (const o of e.ops) apply(s, o, g)
  return s
}

// ---------- queries ----------

export const name = (g: Game, id: Party) =>
  id === 'bank' ? 'the bank' : id === 'pot' ? 'the Free Parking pot' : g.players.find(p => p.id === id)!.name

export const groupCells = (b: Board, group: string) =>
  b.cells.flatMap((c, i) => (c.kind === 'property' && c.group === group ? [i] : []))

export const ownsGroup = (g: Game, s: State, owner: string, group: string) =>
  groupCells(g.board, group).every(i => s.owner[i] === owner)

// ---------- pacts: shared holdings ----------

/** The pooling group of a cell: its colour set, or 'railroad' / 'utility'. */
export const groupOf = (b: Board, cell: number): string | null => {
  const c = b.cells[cell]
  return c.kind === 'property' ? c.group! : c.kind === 'railroad' || c.kind === 'utility' ? c.kind : null
}

export const cellsOfGroup = (b: Board, group: string) =>
  group === 'railroad' || group === 'utility' ? b.cells.flatMap((c, i) => (c.kind === group ? [i] : [])) : groupCells(b, group)

export const groupLabel = (b: Board, group: string) =>
  group === 'railroad' ? 'Railroads' : group === 'utility' ? 'Utilities' : b.groups.find(x => x.id === group)?.name ?? group

export function pactName(b: Board, p: Pact) {
  const names = p.groups.map(gr => groupLabel(b, gr))
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} pact`
}

/** The pact pooling this deed: it covers the deed's group and the deed's owner is a member. */
export function pactFor(g: Game, s: State, cell: number): Pact | null {
  const owner = s.owner[cell], group = groupOf(g.board, cell)
  if (!owner || !group) return null
  return Object.values(s.pacts).find(p => p.groups.includes(group) && p.members.includes(owner)) ?? null
}

/** Who shares a deed's rent and building costs, as whole percentages. */
export function holders(g: Game, s: State, cell: number): Record<string, number> {
  const pact = pactFor(g, s, cell), owner = s.owner[cell]
  return pact ? pact.shares : owner ? { [owner]: 100 } : {}
}

/** A colour set counts as complete when one player owns all of it, or one pact's members do. */
export function setComplete(g: Game, s: State, cell: number): { pact: Pact | null } | null {
  const c = g.board.cells[cell]
  if (c.kind !== 'property' || !s.owner[cell]) return null
  const cells = groupCells(g.board, c.group!)
  if (cells.every(i => s.owner[i] === s.owner[cell])) return { pact: null }
  const pact = pactFor(g, s, cell)
  return pact && cells.every(i => s.owner[i] && pact.members.includes(s.owner[i]!)) ? { pact } : null
}

/** Whole-dollar split by largest remainder; parts always sum to amount, ties go in member order. */
export function splitByShares(amount: number, shares: Record<string, number>): Record<string, number> {
  const ids = Object.keys(shares), total = ids.reduce((t, id) => t + shares[id], 0)
  const out: Record<string, number> = {}
  const rest = ids.map(id => {
    out[id] = Math.floor((amount * shares[id]) / total)
    return { id, r: (amount * shares[id]) % total }
  })
  let left = amount - ids.reduce((t, id) => t + out[id], 0)
  for (const { id } of rest.toSorted((a, b) => b.r - a.r)) { if (left-- <= 0) break; out[id]++ }
  return out
}

const describeSplit = (g: Game, parts: Record<string, number>) =>
  Object.entries(parts).filter(([, v]) => v > 0).map(([id, v]) => `${name(g, id)} ${money(g.board, v)}`).join(', ')

/** Sells every building on a pact's pooled deeds at half cost, splits the refund by shares, ends the pact. */
export function dissolveOps(g: Game, s: State, pact: Pact) {
  const ops: Op[] = [], cleared: number[] = []
  let refund = 0
  for (const group of pact.groups) for (const i of cellsOfGroup(g.board, group)) {
    if (!s.level[i] || !s.owner[i] || !pact.members.includes(s.owner[i]!)) continue
    refund += s.level[i] * Math.floor(g.board.cells[i].houseCost! / 2)
    ops.push({ op: 'build', cell: i, level: 0 })
    cleared.push(i)
  }
  const credit = refund ? splitByShares(refund, pact.shares) : {}
  for (const [id, v] of Object.entries(credit)) if (v) ops.push({ op: 'transfer', from: 'bank', to: id, amount: v })
  ops.push({ op: 'pact', id: pact.id, pact: null })
  return { ops, credit, cleared, refund }
}

export const housesLeft = (g: Game, s: State) =>
  g.board.houses - s.level.reduce((n, l) => n + (l < 5 ? l : 0), 0)
export const hotelsLeft = (g: Game, s: State) =>
  g.board.hotels - s.level.filter(l => l === 5).length

export const active = (g: Game, s: State) => g.players.filter(p => !s.bankrupt[p.id])

export const mortgageValue = (g: Game, cell: number) => Math.floor((g.board.cells[cell].price ?? 0) / 2)
export const unmortgageCost = (g: Game, cell: number) =>
  g.rules.mortgageInterest ? Math.ceil((mortgageValue(g, cell) * 11) / 10) : mortgageValue(g, cell)
const interestFee = (g: Game, cell: number) => (g.rules.mortgageInterest ? Math.ceil(mortgageValue(g, cell) / 10) : 0)

export type RentOpts = { dice?: number; railroadMultiplier?: number; utilityMax?: boolean }

/** Rent owed for landing on a cell, with a plain explanation. */
export function rent(g: Game, s: State, cell: number, opts: RentOpts = {}): { amount: number; why: string } {
  const b = g.board, c = b.cells[cell], owner = s.owner[cell]
  if (!owner) return { amount: 0, why: 'Nobody owns it' }
  if (s.mortgaged[cell]) return { amount: 0, why: 'No rent, it is mortgaged' }
  if (g.rules.noRentInJail && s.jailed[owner]) return { amount: 0, why: `No rent, ${name(g, owner)} is in jail` }
  const pact = pactFor(g, s, cell)
  const holdersOf = pact ? pact.members : [owner]
  const who = pact ? `the ${pactName(b, pact)}` : 'owner'
  const owned = (kind: string) => b.cells.filter((x, i) => x.kind === kind && holdersOf.includes(s.owner[i]!)).length
  if (c.kind === 'property') {
    const lvl = s.level[cell], rents = c.rents!
    if (lvl === 5) return { amount: rents[5], why: `Hotel on ${c.name}` }
    if (lvl > 0) return { amount: rents[lvl], why: `${lvl} ${lvl === 1 ? 'house' : 'houses'} on ${c.name}` }
    const full = g.rules.setDoubleRent && setComplete(g, s, cell)
    if (full) return { amount: rents[0] * 2, why: `${full.pact ? `The ${pactName(b, full.pact)} holds the full set` : 'Full colour set'}, so base rent ${money(b, rents[0])} is doubled` }
    return { amount: rents[0], why: `Base rent on ${c.name}` }
  }
  if (c.kind === 'railroad') {
    const n = owned('railroad'), m = opts.railroadMultiplier ?? 1
    const base = b.railroadRents[n - 1]
    return { amount: base * m, why: `${pact ? `The ${pactName(b, pact)} holds` : 'Owner has'} ${n} ${n === 1 ? 'railroad' : 'railroads'}${m > 1 ? `, card doubles ${money(b, base)}` : ''}` }
  }
  if (c.kind === 'utility') {
    const n = owned('utility')
    const mult = opts.utilityMax ? b.utilityMultipliers.at(-1)! : b.utilityMultipliers[n - 1]
    const dice = opts.dice ?? 0
    return { amount: dice * mult, why: `Dice ${dice} times ${mult}${opts.utilityMax ? ' (card)' : `, ${who} ${pact ? 'holds' : 'has'} ${n} ${n === 1 ? 'utility' : 'utilities'}`}` }
  }
  return { amount: 0, why: 'Not a property' }
}

/** Official time limit valuation: cash, printed price (half if mortgaged), buildings at cost.
 *  Buildings on pooled deeds count by pact share; loans add what you are owed and subtract what you owe. */
export function netWorth(g: Game, s: State, pid: string) {
  let property = 0, buildings = 0, raisable = s.cash[pid]
  g.board.cells.forEach((c, i) => {
    if (s.owner[i] === pid) {
      const price = c.price ?? 0
      property += s.mortgaged[i] ? Math.floor(price / 2) : price
      raisable += s.mortgaged[i] ? 0 : Math.floor(price / 2)
    }
    if (!s.level[i]) return
    const share = holders(g, s, i)[pid] ?? 0
    if (!share) return
    buildings += splitByShares(s.level[i] * (c.houseCost ?? 0), holders(g, s, i))[pid]
    raisable += splitByShares(s.level[i] * Math.floor((c.houseCost ?? 0) / 2), holders(g, s, i))[pid]
  })
  let loans = 0
  for (const l of Object.values(s.loans)) {
    if (l.lender === pid) loans += l.repay
    if (l.borrower === pid) loans -= l.repay
  }
  return { cash: s.cash[pid], property, buildings, loans, total: s.cash[pid] + property + buildings + loans, raisable }
}

// ---------- actions: each returns one ledger entry, or a reason it cannot happen ----------

export const entry = (memo: string, ops: Op[]): Entry => ({ at: Date.now(), memo, ops })
const sink = (g: Game): Party => (g.rules.freeParking ? 'pot' : 'bank')

export function need(g: Game, s: State, pid: string, amount: number): Err | null {
  const short = amount - s.cash[pid]
  return short > 0 ? { error: `${name(g, pid)} is ${money(g.board, short)} short`, short, who: pid } : null
}

export function buy(g: Game, s: State, pid: string, cell: number, price = g.board.cells[cell].price!): Entry | Err {
  if (s.owner[cell]) return { error: 'Already owned' }
  const e = need(g, s, pid, price)
  if (e) return e
  const c = g.board.cells[cell]
  const how = price === c.price ? 'bought' : 'won the auction for'
  return entry(`${name(g, pid)} ${how} ${c.name} for ${money(g.board, price)}`, [
    { op: 'transfer', from: pid, to: 'bank', amount: price },
    { op: 'own', cell, owner: pid },
  ])
}

/** Who receives rent from this payer, and in what parts, or the reason no rent is due. */
export function rentSplit(g: Game, s: State, pid: string, cell: number, amount: number): Record<string, number> | string {
  const owner = s.owner[cell]
  if (!owner || owner === pid) return 'No rent is owed here'
  const pact = pactFor(g, s, cell)
  if (!pact) return { [owner]: amount }
  if (!pact.members.includes(pid)) return splitByShares(amount, pact.shares)
  if (pact.allyRent === 'free') return `Allies stay free on the ${pactName(g.board, pact)}`
  const others = Object.fromEntries(Object.entries(pact.shares).filter(([id]) => id !== pid))
  return splitByShares(amount, others)
}

export function payRent(g: Game, s: State, pid: string, cell: number, opts: RentOpts = {}): Entry | Err {
  const r = rent(g, s, cell, opts)
  const split = rentSplit(g, s, pid, cell, r.amount)
  if (typeof split === 'string') return { error: split }
  if (r.amount === 0) return { error: r.why }
  const e = need(g, s, pid, r.amount)
  if (e) return e
  const payees = Object.entries(split).filter(([, v]) => v > 0)
  const to = payees.length === 1 ? name(g, payees[0][0]) : `the ${pactName(g.board, pactFor(g, s, cell)!)}`
  return entry(`${name(g, pid)} paid ${to} ${money(g.board, r.amount)} rent on ${g.board.cells[cell].name}${payees.length > 1 ? ` (${describeSplit(g, split)})` : ''}. ${r.why}.`,
    payees.map(([id, v]) => ({ op: 'transfer', from: pid, to: id, amount: v })))
}

export function payTax(g: Game, s: State, pid: string, cell: number): Entry | Err {
  const c = g.board.cells[cell], amt = c.amount ?? 0
  const e = need(g, s, pid, amt)
  if (e) return e
  return entry(`${name(g, pid)} paid ${money(g.board, amt)} ${c.name}${g.rules.freeParking ? ' into the pot' : ''}`, [
    { op: 'transfer', from: pid, to: sink(g), amount: amt },
  ])
}

export function passGo(g: Game, pid: string, exact = false): Entry {
  const amt = g.board.salary * (exact && g.rules.doubleGo ? 2 : 1)
  return entry(`${name(g, pid)} ${exact ? 'landed on' : 'passed'} Go and collected ${money(g.board, amt)}`, [
    { op: 'transfer', from: 'bank', to: pid, amount: amt },
  ])
}

export function collectPot(g: Game, s: State, pid: string): Entry | Err {
  if (s.pot <= 0) return { error: 'The pot is empty' }
  return entry(`${name(g, pid)} collected the Free Parking pot of ${money(g.board, s.pot)}`, [
    { op: 'transfer', from: 'pot', to: pid, amount: s.pot },
  ])
}

export function goToJail(g: Game, pid: string, why = 'went to jail'): Entry {
  return entry(`${name(g, pid)} ${why}`, [{ op: 'jail', player: pid, in: true }])
}

export function leaveJail(g: Game, s: State, pid: string, how: 'fine' | 'card' | 'roll'): Entry | Err {
  if (!s.jailed[pid]) return { error: 'Not in jail' }
  if (how === 'card') {
    if (s.jailCards[pid] < 1) return { error: 'No get out of jail free card' }
    return entry(`${name(g, pid)} used a get out of jail free card`, [
      { op: 'jailCard', player: pid, delta: -1 }, { op: 'jail', player: pid, in: false },
    ])
  }
  if (how === 'roll') return entry(`${name(g, pid)} rolled doubles and left jail`, [{ op: 'jail', player: pid, in: false }])
  const e = need(g, s, pid, g.board.jailFine)
  if (e) return e
  return entry(`${name(g, pid)} paid the ${money(g.board, g.board.jailFine)} fine and left jail`, [
    { op: 'transfer', from: pid, to: sink(g), amount: g.board.jailFine },
    { op: 'jail', player: pid, in: false },
  ])
}

export const cardTitle = (b: Board, c: Card) =>
  c.title.replace('{cell}', c.effect.type === 'advance' ? b.cells[c.effect.cell].name : '')

/** Money and jail cards. Movement cards (advance, nearest, move) are driven by the UI's landed on flow. */
export function drawCard(g: Game, s: State, pid: string, card: Card): Entry | Err {
  const b = g.board, f = card.effect, who = name(g, pid), t = cardTitle(b, card)
  const others = active(g, s).filter(p => p.id !== pid)
  switch (f.type) {
    case 'collect':
      return entry(`${who} drew "${t}" and collected ${money(b, f.amount)}`, [{ op: 'transfer', from: 'bank', to: pid, amount: f.amount }])
    case 'pay': {
      const e = need(g, s, pid, f.amount)
      if (e) return e
      return entry(`${who} drew "${t}" and paid ${money(b, f.amount)}`, [{ op: 'transfer', from: pid, to: sink(g), amount: f.amount }])
    }
    case 'collectEach': {
      for (const o of others) { const e = need(g, s, o.id, f.amount); if (e) return e }
      return entry(`${who} drew "${t}" and collected ${money(b, f.amount)} from each player`,
        others.map(o => ({ op: 'transfer', from: o.id, to: pid, amount: f.amount })))
    }
    case 'payEach': {
      const e = need(g, s, pid, f.amount * others.length)
      if (e) return e
      return entry(`${who} drew "${t}" and paid ${money(b, f.amount)} to each player`,
        others.map(o => ({ op: 'transfer', from: pid, to: o.id, amount: f.amount })))
    }
    case 'repairs': {
      let houses = 0, hotels = 0
      s.level.forEach((l, i) => { if (s.owner[i] === pid) l === 5 ? hotels++ : (houses += l) })
      const amt = houses * f.house + hotels * f.hotel
      const e = need(g, s, pid, amt)
      if (e) return e
      return entry(`${who} drew "${t}": ${houses} houses and ${hotels} hotels cost ${money(b, amt)}`,
        amt ? [{ op: 'transfer', from: pid, to: sink(g), amount: amt }] : [])
    }
    case 'jail': return goToJail(g, pid, `drew "${t}" and went to jail`)
    case 'jailCard':
      return entry(`${who} drew "${t}" and kept it`, [{ op: 'jailCard', player: pid, delta: 1 }])
    default: return { error: 'Movement card: pick where the player landed' }
  }
}

// ---------- building ----------

export function canBuild(g: Game, s: State, cell: number): string | null {
  const c = g.board.cells[cell], owner = s.owner[cell], lvl = s.level[cell]
  if (c.kind !== 'property' || !owner) return 'Only owned colour properties take buildings'
  if (!setComplete(g, s, cell)) return g.rules.deals !== false ? 'Own the whole colour set, or pool it in a pact' : 'Own the whole colour set first'
  const cells = groupCells(g.board, c.group!)
  if (cells.some(i => s.mortgaged[i])) return 'Lift every mortgage in the set first'
  if (lvl === 5) return 'Already has a hotel'
  if (g.rules.evenBuild && lvl > Math.min(...cells.map(i => s.level[i]))) return 'Build evenly: other properties in the set need a house first'
  if (g.rules.bankLimit && lvl < 4 && housesLeft(g, s) < 1) return 'The bank has no houses left'
  if (g.rules.bankLimit && lvl === 4 && hotelsLeft(g, s) < 1) return 'The bank has no hotels left'
  const parts = splitByShares(c.houseCost!, holders(g, s, cell))
  for (const [id, v] of Object.entries(parts)) if (s.cash[id] < v) return id === owner && Object.keys(parts).length === 1
    ? `Needs ${money(g.board, v)} cash` : `${name(g, id)} needs ${money(g.board, v)} for their share`
  return null
}

export function canSell(g: Game, s: State, cell: number): string | null {
  const c = g.board.cells[cell], lvl = s.level[cell]
  if (lvl === 0) return 'Nothing built here'
  const cells = groupCells(g.board, c.group!)
  if (g.rules.evenBuild && lvl < Math.max(...cells.map(i => s.level[i]))) return 'Sell evenly: sell from the fullest property first'
  // ponytail: a hotel only breaks into 4 houses; if the bank is short the admin sells elsewhere first
  if (g.rules.bankLimit && lvl === 5 && housesLeft(g, s) < 4) return 'The bank needs 4 houses to break this hotel down'
  return null
}

export function build(g: Game, s: State, cell: number): Entry | Err {
  const why = canBuild(g, s, cell)
  if (why) return { error: why }
  const c = g.board.cells[cell], owner = s.owner[cell]!, lvl = s.level[cell] + 1, pact = pactFor(g, s, cell)
  const parts = splitByShares(c.houseCost!, holders(g, s, cell))
  const by = pact ? `The ${pactName(g.board, pact)}` : name(g, owner)
  return entry(`${by} built ${lvl === 5 ? 'a hotel' : `house ${lvl}`} on ${c.name} for ${money(g.board, c.houseCost!)}${pact ? ` (${describeSplit(g, parts)})` : ''}`, [
    ...Object.entries(parts).filter(([, v]) => v > 0).map(([id, v]): Op => ({ op: 'transfer', from: id, to: 'bank', amount: v })),
    { op: 'build', cell, level: lvl },
  ])
}

export function sell(g: Game, s: State, cell: number): Entry | Err {
  const why = canSell(g, s, cell)
  if (why) return { error: why }
  const c = g.board.cells[cell], owner = s.owner[cell]!, lvl = s.level[cell], back = Math.floor(c.houseCost! / 2), pact = pactFor(g, s, cell)
  const parts = splitByShares(back, holders(g, s, cell))
  const by = pact ? `The ${pactName(g.board, pact)}` : name(g, owner)
  return entry(`${by} sold ${lvl === 5 ? 'the hotel' : 'a house'} on ${c.name} back to the bank for ${money(g.board, back)}${pact ? ` (${describeSplit(g, parts)})` : ''}`, [
    ...Object.entries(parts).filter(([, v]) => v > 0).map(([id, v]): Op => ({ op: 'transfer', from: 'bank', to: id, amount: v })),
    { op: 'build', cell, level: lvl - 1 },
  ])
}

// ---------- mortgages ----------

const groupBuilt = (g: Game, s: State, cell: number) => {
  const c = g.board.cells[cell]
  return c.kind === 'property' && groupCells(g.board, c.group!).some(i => s.level[i] > 0)
}

export function mortgage(g: Game, s: State, cell: number): Entry | Err {
  const owner = s.owner[cell]
  if (!owner) return { error: 'Nobody owns it' }
  if (s.mortgaged[cell]) return { error: 'Already mortgaged' }
  if (groupBuilt(g, s, cell)) return { error: 'Sell every building in this colour set first' }
  const v = mortgageValue(g, cell)
  return entry(`${name(g, owner)} mortgaged ${g.board.cells[cell].name} for ${money(g.board, v)}`, [
    { op: 'transfer', from: 'bank', to: owner, amount: v },
    { op: 'mortgage', cell, on: true },
  ])
}

export function unmortgage(g: Game, s: State, cell: number): Entry | Err {
  const owner = s.owner[cell]
  if (!owner || !s.mortgaged[cell]) return { error: 'Not mortgaged' }
  const cost = unmortgageCost(g, cell)
  const e = need(g, s, owner, cost)
  if (e) return e
  return entry(`${name(g, owner)} lifted the mortgage on ${g.board.cells[cell].name} for ${money(g.board, cost)}`, [
    { op: 'transfer', from: owner, to: 'bank', amount: cost },
    { op: 'mortgage', cell, on: false },
  ])
}

// ---------- trades, payments, turns, bankruptcy ----------

export type Side = { cells: number[]; cash: number; jailCards: number }

export function trade(g: Game, s: State, a: string, b: string, give: Side, get: Side): Entry | Err {
  const ops: Op[] = []
  const cash = { [a]: s.cash[a], [b]: s.cash[b] }
  const sides: [string, string, Side][] = [[a, b, give], [b, a, get]]
  for (const [from, to, side] of sides) {
    if (side.cash < 0 || side.jailCards < 0) return { error: 'Amounts cannot be negative' }
    if (side.cash > s.cash[from]) return { error: `${name(g, from)} does not have ${money(g.board, side.cash)}` }
    if (side.jailCards > s.jailCards[from]) return { error: `${name(g, from)} does not have that many jail cards` }
    for (const i of side.cells) {
      if (s.owner[i] !== from) return { error: `${name(g, from)} does not own ${g.board.cells[i].name}` }
      if (groupBuilt(g, s, i)) return { error: `Sell the buildings in ${g.board.cells[i].name}'s colour set before trading it` }
    }
    if (side.cash) ops.push({ op: 'transfer', from, to, amount: side.cash })
    cash[from] -= side.cash; cash[to] += side.cash
    for (const i of side.cells) {
      ops.push({ op: 'own', cell: i, owner: to })
      const fee = s.mortgaged[i] ? interestFee(g, i) : 0
      if (fee) { ops.push({ op: 'transfer', from: to, to: 'bank', amount: fee }); cash[to] -= fee }
    }
    if (side.jailCards) ops.push({ op: 'jailCard', player: from, delta: -side.jailCards }, { op: 'jailCard', player: to, delta: side.jailCards })
  }
  for (const p of [a, b]) if (cash[p] < 0) return { error: `${name(g, p)} cannot cover the 10% interest on mortgaged property received`, short: -cash[p], who: p }
  if (!ops.length) return { error: 'Nothing is being traded' }
  const describe = (side: Side) => [
    ...side.cells.map(i => g.board.cells[i].name),
    ...(side.cash ? [money(g.board, side.cash)] : []),
    ...(side.jailCards ? [`${side.jailCards} jail ${side.jailCards === 1 ? 'card' : 'cards'}`] : []),
  ].join(', ') || 'nothing'
  return entry(`${name(g, a)} traded ${describe(give)} to ${name(g, b)} for ${describe(get)}`, ops)
}

export function transfer(g: Game, s: State, from: Party, to: Party, amount: number, note: string): Entry | Err {
  if (!(amount > 0) || !Number.isInteger(amount)) return { error: 'Enter a whole amount above zero' }
  if (from === to) return { error: 'Pick two different parties' }
  if (from === 'pot' && amount > s.pot) return { error: 'The pot does not hold that much' }
  if (from !== 'bank' && from !== 'pot') { const e = need(g, s, from, amount); if (e) return e }
  return entry(`${name(g, from)} paid ${name(g, to)} ${money(g.board, amount)}${note ? `: ${note}` : ''}`, [
    { op: 'transfer', from, to, amount },
  ])
}

export function nextPlayer(g: Game, s: State): string {
  const ids = g.players.map(p => p.id), start = ids.indexOf(s.turn)
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(start + k) % ids.length]
    if (!s.bankrupt[id]) return id
  }
  return s.turn
}

export function endTurn(g: Game, s: State): Entry {
  const id = nextPlayer(g, s)
  return entry(`${name(g, id)}'s turn`, [{ op: 'turn', player: id }])
}

/** Everything the player has goes to the creditor. Buildings are sold to the bank at half cost first. */
export function bankrupt(g: Game, s: State, pid: string, creditor: Party): Entry {
  const ops: Op[] = []
  let cash = s.cash[pid]
  const toPlayer = creditor !== 'bank' && creditor !== 'pot'
  // Pacts with this player break first: pooled buildings are sold and the refund split by shares.
  const cleared = new Set<number>()
  for (const p of Object.values(s.pacts)) {
    if (!p.members.includes(pid)) continue
    const d = dissolveOps(g, s, p)
    ops.push(...d.ops)
    cash += d.credit[pid] ?? 0
    d.cleared.forEach(i => cleared.add(i))
  }
  // Money owed to the player passes to a player creditor; money the player owes is written off.
  for (const l of Object.values(s.loans)) {
    if (l.borrower === pid || (l.lender === pid && !toPlayer)) ops.push({ op: 'loan', id: l.id, loan: null })
    else if (l.lender === pid) ops.push({ op: 'loan', id: l.id, loan: l.borrower === creditor ? null : { ...l, lender: creditor } })
  }
  for (const im of Object.values(s.immunities)) if (im.holder === pid || im.grantor === pid) ops.push({ op: 'immunity', id: im.id, immunity: null })
  s.level.forEach((l, i) => {
    if (s.owner[i] !== pid || !l || cleared.has(i)) return
    const back = l * Math.floor(g.board.cells[i].houseCost! / 2)
    ops.push({ op: 'transfer', from: 'bank', to: pid, amount: back }, { op: 'build', cell: i, level: 0 })
    cash += back
  })
  if (cash > 0) ops.push({ op: 'transfer', from: pid, to: creditor, amount: cash })
  s.owner.forEach((o, i) => {
    if (o !== pid) return
    // ponytail: the 10% interest a creditor owes on inherited mortgages is skipped
    ops.push({ op: 'own', cell: i, owner: toPlayer ? creditor : null })
    if (!toPlayer && s.mortgaged[i]) ops.push({ op: 'mortgage', cell: i, on: false })
  })
  if (s.jailCards[pid]) {
    ops.push({ op: 'jailCard', player: pid, delta: -s.jailCards[pid] })
    if (toPlayer) ops.push({ op: 'jailCard', player: creditor, delta: s.jailCards[pid] })
  }
  if (s.jailed[pid]) ops.push({ op: 'jail', player: pid, in: false })
  ops.push({ op: 'bankrupt', player: pid })
  return entry(`${name(g, pid)} went bankrupt. Everything went to ${name(g, creditor)}.`, ops)
}

// ---------- custom boards ----------

/** Every problem with a board, keyed by the field it belongs to. Empty means the board is playable. */
export function validateBoard(b: Board): Record<string, string> {
  const e: Record<string, string> = {}
  const whole = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!b.name.trim()) e.name = 'Give the board a name.'
  if (!b.currency.trim()) e.currency = 'Pick a currency symbol, such as $ or £.'
  for (const k of ['salary', 'startingCash', 'jailFine', 'houses', 'hotels'] as const) if (!whole(b[k])) e[k] = 'Use a whole number, zero or more.'
  if (whole(b.startingCash) && b.startingCash === 0) e.startingCash = 'Players need some starting cash.'
  if (b.cells.length !== 40) e.cells = 'A board has exactly 40 squares.'
  if (b.cells[0]?.kind !== 'go') e['cell.0.kind'] = 'The first square must be Go.'
  const has = (k: string) => b.cells.some(c => c.kind === k)
  if (has('gotojail') && !has('jail')) e.jail = 'Go to Jail needs a Jail square somewhere on the board.'
  const groupIds = new Set(b.groups.map(g => g.id))
  b.cells.forEach((c, i) => {
    const k = `cell.${i}`
    if (!c.name.trim()) e[`${k}.name`] = 'Every square needs a name.'
    if (c.kind === 'property') {
      if (!c.group || !groupIds.has(c.group)) e[`${k}.group`] = 'Pick a colour set.'
      if (!whole(c.price) || !c.price) e[`${k}.price`] = 'Price must be a whole number above zero.'
      if (!whole(c.houseCost) || !c.houseCost) e[`${k}.houseCost`] = 'House cost must be a whole number above zero.'
      const r = c.rents ?? []
      if (r.length !== 6 || !r.every(whole)) e[`${k}.rents`] = 'Fill in all six rents with whole numbers.'
      else if (!r[0]) e[`${k}.rents`] = 'Base rent must be above zero.'
      else if (r.some((x, j) => j > 0 && x < r[j - 1])) e[`${k}.rents`] = 'Rent should never drop as buildings are added.'
    }
    if ((c.kind === 'railroad' || c.kind === 'utility') && (!whole(c.price) || !c.price)) e[`${k}.price`] = 'Price must be a whole number above zero.'
    if (c.kind === 'tax' && !whole(c.amount)) e[`${k}.amount`] = 'Tax must be a whole number, zero or more.'
  })
  for (const g of b.groups) {
    if (!g.name.trim()) e[`group.${g.id}`] = 'Name this colour set.'
    else if (!groupCells(b, g.id).length) e[`group.${g.id}`] = `${g.name} has no properties. Assign some or remove it.`
  }
  const rails = b.cells.filter(c => c.kind === 'railroad').length
  const utils = b.cells.filter(c => c.kind === 'utility').length
  if (b.railroadRents.length < rails || !b.railroadRents.every(whole)) e.railroadRents = `Enter a rent for owning 1 to ${rails} railroads.`
  if (b.utilityMultipliers.length < utils || !b.utilityMultipliers.every(whole)) e.utilityMultipliers = `Enter a dice multiplier for owning 1 to ${utils} utilities.`
  for (const deck of ['chance', 'chest'] as const) b[deck].forEach((c, i) => {
    const k = `${deck}.${i}`, f = c.effect
    if (!c.title.trim()) e[k] = 'Every card needs a title.'
    else if ('amount' in f && !whole(f.amount)) e[k] = 'Use a whole amount.'
    else if (f.type === 'repairs' && (!whole(f.house) || !whole(f.hotel))) e[k] = 'Use whole amounts per house and hotel.'
    else if (f.type === 'advance' && !b.cells[f.cell]) e[k] = 'Pick the square this card moves to.'
    else if (f.type === 'nearest' && !b.cells.some(x => x.kind === f.kind)) e[k] = `This board has no ${f.kind}.`
  })
  return e
}
