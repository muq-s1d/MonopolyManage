import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from '../engine/boards.ts'
import * as E from '../engine/engine.ts'
import * as D from '../engine/deals.ts'
import type { Entry, Game, State } from '../engine/types.ts'
import { gate } from './rules.ts'
import { createHost, type Book } from './host.ts'
import { createClient } from './client.ts'
import type { Msg } from './session.ts'

const US = presets[0]
const idx = (name: string) => US.cells.findIndex(c => c.name === name)
const COLORS = ['#c00', '#0c0', '#00c']

// ---------- permission table ----------

function table() {
  const g: Game = {
    id: 'g', createdAt: 0, board: US, rules: E.defaultRules,
    players: ['riva', 'otto', 'cleo'].map((id, i) => ({ id, name: id, color: COLORS[i], accessory: 0, seed: i })),
  }
  const log: Entry[] = []
  const s = () => E.replay(g, log)
  const commit = (x: Entry | { error: string }) => { if (E.isErr(x)) throw new Error(x.error); log.push(x) }
  return { g, s, commit }
}

test('permission table, each case checked by hand', () => {
  const { g, s, commit } = table()
  const med = idx('Mediterranean Avenue'), baltic = idx('Baltic Avenue')
  commit(E.buy(g, s(), 'otto', med))
  // riva's turn: she may pay her own rent, never otto's move, and cleo must wait
  assert.deepEqual(gate(g, s(), 'riva', 'payRent', ['riva', med]), { gate: 'now' })
  assert.deepEqual(gate(g, s(), 'riva', 'payRent', ['otto', med]), { error: 'That is another player’s move' })
  assert.deepEqual(gate(g, s(), 'cleo', 'payRent', ['cleo', med]), { error: 'Wait for your turn' })
  // auctions belong to the host screen
  assert.deepEqual(gate(g, s(), 'riva', 'buy', ['riva', baltic, 10]), { error: 'Auction wins are recorded on the host screen' })
  assert.deepEqual(gate(g, s(), 'riva', 'buy', ['riva', baltic, 60]), { gate: 'now' })
  // cards must come from the decks
  assert.deepEqual(gate(g, s(), 'riva', 'drawCard', ['riva', US.chance[0]]), { gate: 'now' })
  assert.deepEqual(gate(g, s(), 'riva', 'drawCard', ['riva', { title: 'Free money', effect: { type: 'collect', amount: 1e6 } }]), { error: 'That card is not in the decks' })
  // money: paying out of your own pocket is fine, taking it needs the host
  assert.deepEqual(gate(g, s(), 'cleo', 'transfer', ['cleo', 'bank', 10, '']), { gate: 'now' })
  assert.deepEqual(gate(g, s(), 'cleo', 'transfer', ['bank', 'cleo', 10, '']), { gate: 'host' })
  // deals need the other side
  assert.deepEqual(gate(g, s(), 'riva', 'trade', ['riva', 'otto', {}, {}]), { gate: 'deal', needs: ['otto'] })
  assert.deepEqual(gate(g, s(), 'cleo', 'trade', ['riva', 'otto', {}, {}]), { error: 'You can only make deals you are part of' })
  // building on a pooled deed: otto owns Mediterranean, riva gets Baltic, and they pool the purples
  commit(E.buy(g, s(), 'riva', baltic))
  commit(D.formPact(g, s(), { members: ['riva', 'otto'], shares: { riva: 50, otto: 50 }, groups: ['brown'], allyRent: 'free' }))
  assert.equal(US.cells[med].group, 'brown')
  assert.deepEqual(gate(g, s(), 'riva', 'build', [med]), { gate: 'now' }, 'a pact member builds on an ally’s pooled deed')
  assert.deepEqual(gate(g, s(), 'riva', 'mortgage', [med]), { error: 'Not your deed' }, 'but only the owner mortgages it')
  assert.deepEqual(gate(g, s(), 'cleo', 'build', [med]), { error: 'Not your deed' })
  assert.deepEqual(gate(g, s(), 'riva', 'undo', []), { gate: 'host' })
  assert.deepEqual(gate(g, s(), 'riva', 'bankrupt', ['otto', 'bank']), { error: 'Only you can declare yourself bankrupt' })
})

// ---------- loopback: a host and two phones with no network ----------

function memoryBook(): Book {
  let snap: { game: Game; entries: Entry[]; state: State } | null = null
  const subs = new Set<() => void>()
  const set = (game: Game, entries: Entry[]) => { snap = { game, entries, state: E.replay(game, entries) }; subs.forEach(f => f()) }
  return {
    get: () => snap,
    start: g => set(g, []),
    commit: e => set(snap!.game, [...snap!.entries, e]),
    rewind: n => set(snap!.game, snap!.entries.slice(0, n)),
    subscribe: f => { subs.add(f); return () => subs.delete(f) },
  }
}

/** Everyone hears everyone else, as JSON, a moment later. */
function wire() {
  const parties: ((m: Msg) => void)[] = []
  return (receive: (m: Msg) => void) => {
    const self = parties.push(receive) - 1
    return (m: Msg) => {
      const copy = JSON.stringify(m)
      parties.forEach((p, i) => i !== self && setTimeout(() => p(JSON.parse(copy))))
    }
  }
}
const settle = () => new Promise(r => setTimeout(r, 5))

function room() {
  const join = wire(), book = memoryBook()
  const said: string[] = []
  const host = createHost(book, join(m => host.receive(m)), { colors: COLORS, accessories: 8, secret: 's3cret' })
  const phone = (token?: string) => {
    const c = createClient(join(m => c.receive(m)), { token, onSay: t => said.push(t), timeoutMs: 500 })
    return c
  }
  return { host, book, phone, said }
}

test('joining, colour clash, and reclaiming a seat', async () => {
  const { host, phone } = room()
  const riva = phone(), otto = phone()
  const r = await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 2 })
  assert.ok(r.ok && r.pid && r.token)
  assert.equal((await otto.seat({ name: 'Otto', color: COLORS[0], accessory: 1 })).error, 'That colour was just taken')
  assert.equal((await otto.seat({ name: 'riva', color: COLORS[1], accessory: 1 })).error, 'Someone is already called riva')
  assert.ok((await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 1 })).ok)
  await settle()
  assert.deepEqual(otto.get().players.map(p => p.name), ['Riva', 'Otto'], 'every phone sees the lobby')
  // a reloaded phone comes back with its saved token and gets the same seat, even after the start
  host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: host.players })
  const again = phone(r.token)
  const back = await again.seat()
  assert.equal(back.pid, r.pid)
  assert.equal((await phone().seat({ name: 'Late', color: COLORS[2], accessory: 0 })).error, 'This game has already started. Ask the host to seat you.')
  assert.equal((await phone('forged').seat()).error, 'That seat is gone. Join again.')
})

async function started() {
  const r = room()
  const riva = r.phone(), otto = r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 1 })
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  const id = (c: typeof riva) => c.get().pid!
  return { ...r, riva, otto, R: id(riva), O: id(otto) }
}
const same = (a: State | null, b: State | null) => assert.deepEqual(a, b, 'replica matches the host')

test('an intent commits and every replica matches the host', async () => {
  const { book, riva, otto, R, O } = await started()
  const med = idx('Mediterranean Avenue')
  assert.equal(book.get()!.state.turn, R)
  assert.equal((await otto.act('buy', O, med)).error, 'Wait for your turn')
  assert.ok((await riva.act('buy', R, med)).ok)
  assert.ok((await riva.act('goToJail', R, undefined)).ok, 'an omitted optional argument keeps its default over JSON')
  assert.ok((await riva.act('endTurn')).ok)
  assert.ok((await otto.act('payRent', O, med, {})).ok)
  await settle()
  const s = book.get()!.state
  assert.equal(s.cash[R], 1500 - 60 + 2)
  assert.equal(s.cash[O], 1500 - 2)
  assert.equal(book.get()!.entries[1].memo, 'Riva went to jail')
  same(riva.get().state, s)
  same(otto.get().state, s)
})

test('a trade is accepted, approved, and a stale one is refused with the reason', async () => {
  const { host, book, riva, otto, R, O, said } = await started()
  const med = idx('Mediterranean Avenue'), baltic = idx('Baltic Avenue')
  await riva.act('buy', R, med)
  await riva.act('endTurn')
  await otto.act('buy', O, baltic)
  const side = (cells: number[], cash = 0) => ({ cells, cash, jailCards: 0 })
  assert.ok((await riva.act('trade', R, O, side([med]), side([baltic], 10))).pending)
  await settle()
  const offer = otto.get().offers[0]
  assert.equal(offer.memo, 'Riva and Otto made a trade. Riva gets Baltic Avenue and $10. Otto gets Mediterranean Avenue.')
  assert.equal(host.decide(offer.id, true), 'Wait until everyone involved has said yes')
  otto.answer(offer.id, true)
  await settle()
  assert.equal(host.decide(offer.id, true), null)
  await settle()
  assert.equal(book.get()!.state.owner[med], O)
  same(riva.get().state, book.get()!.state)

  // riva offers more than she will have; otto agrees; she spends it before the host approves
  const before = book.get()!.entries.length
  await riva.act('trade', R, O, side([], 1400), side([med]))
  await settle()
  otto.answer(otto.get().offers[0].id, true)
  await riva.act('transfer', R, 'bank', 200, 'fine')
  await settle()
  assert.equal(host.decide(host.offers[0].id, true), 'Riva does not have $1,400')
  await settle()
  assert.equal(book.get()!.entries.length, before + 1, 'only the fine went through')
  assert.ok(said.includes('No longer possible: Riva does not have $1,400'))
  assert.equal(riva.get().offers.length, 0)
})

test('undo, once the host approves, rewinds every replica', async () => {
  const { host, book, riva, otto, R } = await started()
  await riva.act('buy', R, idx('Mediterranean Avenue'))
  assert.ok((await riva.undo()).pending)
  await settle()
  assert.equal(host.offers[0].memo, 'Undo: Riva bought Mediterranean Avenue for $60')
  host.decide(host.offers[0].id, true)
  await settle()
  assert.equal(book.get()!.entries.length, 0)
  same(riva.get().state, book.get()!.state)
  same(otto.get().state, book.get()!.state)
})

test('a new phone takes an existing seat once the host agrees', async () => {
  const { host, phone, otto, O } = await started()
  const spare = phone()
  await spare.act('endTurn').then(r => assert.equal(r.error, 'This phone has no seat'))
  const r = await spare.claim(O)
  assert.ok(r.pending)
  await settle()
  assert.equal(host.offers[0].memo, "A new phone wants to take Otto's seat")
  host.decide(host.offers[0].id, true)
  await settle()
  assert.equal(spare.get().pid, O)
  assert.equal((await otto.act('endTurn')).error, 'This phone has no seat', 'the old phone lost the seat')
})

test('the host’s own phone can approve; other phones cannot', async () => {
  const r = room()
  const boss = r.phone(), riva = r.phone()
  assert.equal((await boss.seat({ name: 'Boss', color: COLORS[0], accessory: 0 }, 's3cret')).admin, true)
  assert.equal((await riva.seat({ name: 'Riva', color: COLORS[1], accessory: 0 }, 'guess')).admin, false)
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  await boss.act('passGo', boss.get().pid!)
  await riva.undo()
  await settle()
  const id = r.host.offers[0].id
  riva.decide(id, true)
  await settle()
  assert.equal(r.book.get()!.entries.length, 1, 'a player cannot approve their own request')
  boss.decide(id, true)
  await settle()
  assert.equal(r.book.get()!.entries.length, 0)
})

test('a phone that missed a sync asks again and catches up', async () => {
  const { book, riva, otto, R } = await started()
  const lost = otto.receive
  otto.receive = () => {} // otto's link drops for a moment
  await riva.act('buy', R, idx('Mediterranean Avenue'))
  await riva.act('passGo', R)
  otto.receive = lost
  await riva.act('endTurn')
  await settle()
  same(otto.get().state, book.get()!.state)
})
