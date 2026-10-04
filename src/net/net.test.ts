import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from '../engine/boards.ts'
import * as E from '../engine/engine.ts'
import * as D from '../engine/deals.ts'
import type { Entry, Game, State } from '../engine/types.ts'
import { auctionProblem, gate } from './rules.ts'
import { run } from '../engine/actions.ts'
import { createHost, type Book } from './host.ts'
import { createClient } from './client.ts'
import { identity, type Identity, type Msg } from './session.ts'

const US = presets[0]
const idx = (name: string, nth = 1) => US.cells.flatMap((c, i) => (c.name === name ? [i] : []))[nth - 1]
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
  const income = idx('Income Tax'), oriental = idx('Oriental Avenue'), chest = idx('Community Chest', 2)
  // riva's turn from Go: she records her own landing, never otto's, and cleo must wait
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', income, { do: 'tax' }]), { gate: 'now' })
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['otto', income, { do: 'tax' }]), { error: 'That is another player’s move' })
  assert.deepEqual(gate(g, s(), 'cleo', 'land', ['cleo', income, { do: 'tax' }]), { error: 'Wait for your turn' })
  // only squares a roll of 2 to 12 reaches: Mediterranean is one step from Go, Boardwalk far away
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', med, { do: 'rent' }]), { error: 'Your piece cannot get there from where it stands' })
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', idx('Boardwalk'), { do: 'buy' }]), { error: 'Your piece cannot get there from where it stands' })
  // landings go through land, so they count against the roll
  assert.deepEqual(gate(g, s(), 'riva', 'payRent', ['riva', med]), { error: 'Tap the square you landed on to record it' })
  assert.deepEqual(gate(g, s(), 'riva', 'buy', ['riva', baltic]), { error: 'Tap the square you landed on to buy it' })
  assert.deepEqual(gate(g, s(), 'riva', 'passGo', ['riva']), { gate: 'host' }, 'Go is paid with the landing; a claim is a correction')
  assert.deepEqual(gate(g, s(), 'riva', 'endTurn', []), { error: 'Tap the square you landed on first' })
  // one landing per roll: once it is recorded, another needs doubles, or the host
  commit(run(g, s(), 'land', 'riva', oriental))
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', idx('Vermont Avenue'), { do: 'buy' }]), { error: 'That roll is already recorded. If it was the wrong square, ask the host to undo it.' })
  assert.deepEqual(gate(g, s(), 'riva', 'endTurn', []), { gate: 'now' })
  // auctions run live on the host; the old record-the-winner request is refused
  assert.deepEqual(gate(g, s(), 'riva', 'buy', ['otto', oriental, 10]), { error: 'Auctions run live: tap Auction it' })
  assert.equal(auctionProblem(g, s(), 'riva', oriental), null, 'riva just landed on unowned Oriental')
  assert.equal(auctionProblem(g, s(), 'otto', oriental), 'Only the player who landed there can auction it')
  assert.equal(auctionProblem(g, s(), 'riva', idx('Boardwalk')), 'Auction the square you just landed on')
  commit(run(g, s(), 'rollDoubles', 'riva'))
  assert.equal(auctionProblem(g, s(), 'riva', oriental), 'Auction the square you just landed on', 'not after rolling on')
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', chest, { do: 'card', card: US.chest[0] }]), { gate: 'now' }, 'doubles give another landing, 11 on from Oriental')
  // the engine checks the card comes from the deck of the square
  assert.equal((run(g, s(), 'land', 'riva', chest, { do: 'card', card: { title: 'Free money', effect: { type: 'collect', amount: 1e6 } } }) as { error: string }).error, 'That card is not in this deck')
  // a card that names a square allows that square only
  commit(run(g, s(), 'land', 'riva', chest, { do: 'card', card: US.chest.find(c => c.effect.type === 'advance')! }))
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', idx('Vermont Avenue'), { do: 'buy' }]), { error: 'Your piece cannot get there from where it stands' })
  assert.deepEqual(gate(g, s(), 'riva', 'land', ['riva', 0, { do: 'none' }]), { gate: 'now' }, 'Advance to Go')
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
const settle = () => new Promise(r => setTimeout(r, 20))

async function room() {
  const join = wire(), book = memoryBook()
  const said: string[] = []
  const host = createHost(book, join(m => host.receive(m)), { id: await identity(), colors: COLORS, accessories: 8, secret: 's3cret', auctionMs: { open: 400, bid: 300 }, helloMs: 0 })
  // a phone says hi first, as the app does, and trusts the first host that answers
  const phone = async (id?: Identity) => {
    const key = id ?? await identity() // before joining the wire, so nothing arrives for a phone that is not built yet
    const c = createClient(join(m => c.receive(m)), { id: key, onSay: t => said.push(t), timeoutMs: 500 })
    c.hi()
    await settle()
    return c
  }
  // an eavesdropper on the channel: hears every message, and can send anything
  const heard: Msg[] = []
  const spy = join(m => heard.push(m))
  return { host, book, phone, said, heard, spy }
}

test('joining, colour clash, and reclaiming a seat', async () => {
  const { host, phone } = await room()
  const key = await identity()
  const riva = await phone(key), otto = await phone()
  const r = await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 2 })
  assert.ok(r.ok && r.pid)
  assert.equal((await otto.seat({ name: 'Otto', color: COLORS[0], accessory: 1 })).error, 'That colour was just taken')
  assert.equal((await otto.seat({ name: 'riva', color: COLORS[1], accessory: 1 })).error, 'Someone is already called riva')
  assert.ok((await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 1 })).ok)
  await settle()
  assert.deepEqual(otto.get().players.map(p => p.name), ['Riva', 'Otto'], 'every phone sees the lobby')
  // a reloaded phone comes back with its saved key and gets the same seat, even after the start
  host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: host.players })
  const again = await phone(await identity(key.jwk))
  const back = await again.seat()
  assert.equal(back.pid, r.pid)
  assert.equal((await (await phone()).seat({ name: 'Late', color: COLORS[2], accessory: 0 })).error, 'This game has already started. Ask the host to seat you.')
  assert.equal((await (await phone()).seat()).error, 'Pick a name, colour and creature first.', 'a stranger’s key holds no seat')
})

async function started() {
  const r = await room()
  const riva = await r.phone(), otto = await r.phone()
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
  const med = idx('Baltic Avenue')
  assert.equal(book.get()!.state.turn, R)
  assert.equal((await otto.act('land', O, med, { do: 'buy' })).error, 'Wait for your turn')
  assert.ok((await riva.act('land', R, med, { do: 'buy' })).ok)
  assert.equal((await riva.act('land', R, med)).error, 'That roll is already recorded. If it was the wrong square, ask the host to undo it.')
  assert.ok((await riva.act('endTurn')).ok)
  assert.ok((await otto.act('land', O, med, { do: 'rent' }, undefined)).ok, 'an omitted optional argument keeps its default over JSON')
  await settle()
  const s = book.get()!.state
  assert.equal(s.cash[R], 1500 - 60 + 4)
  assert.equal(s.cash[O], 1500 - 4)
  assert.equal(book.get()!.entries[2].memo, 'Otto paid Riva $4 rent on Baltic Avenue. Base rent on Baltic Avenue.')
  same(riva.get().state, s)
  same(otto.get().state, s)
})

test('a trade is accepted, approved, and a stale one is refused with the reason', async () => {
  const { host, book, riva, otto, R, O, said } = await started()
  const med = idx('Baltic Avenue'), baltic = idx('Oriental Avenue')
  await riva.act('land', R, med, { do: 'buy' })
  await riva.act('endTurn')
  await otto.act('land', O, baltic, { do: 'buy' })
  const side = (cells: number[], cash = 0) => ({ cells, cash, jailCards: 0 })
  assert.ok((await riva.act('trade', R, O, side([med]), side([baltic], 10))).pending)
  await settle()
  const offer = otto.get().offers[0]
  assert.equal(offer.memo, 'Riva and Otto made a trade. Riva gets Oriental Avenue and $10. Otto gets Baltic Avenue.')
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
  await riva.act('land', R, idx('Baltic Avenue'), { do: 'buy' })
  assert.ok((await riva.undo()).pending)
  await settle()
  assert.equal(host.offers[0].memo, 'Undo: Riva bought Baltic Avenue for $60')
  host.decide(host.offers[0].id, true)
  await settle()
  assert.equal(book.get()!.entries.length, 0)
  same(riva.get().state, book.get()!.state)
  same(otto.get().state, book.get()!.state)
})

test('a new phone takes an existing seat once the host agrees', async () => {
  const { host, phone, otto, O } = await started()
  const spare = await phone()
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
  const r = await room()
  const boss = await r.phone(), riva = await r.phone()
  assert.equal((await boss.seat({ name: 'Boss', color: COLORS[0], accessory: 0 }, 's3cret')).admin, true)
  assert.equal((await riva.seat({ name: 'Riva', color: COLORS[1], accessory: 0 }, 'guess')).admin, false)
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  await boss.act('land', boss.get().pid!, idx('Baltic Avenue'))
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

test('a deal with a player who has no phone waits only for the host', async () => {
  const r = await room()
  const riva = await r.phone(), otto = await r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 0 })
  // the host seats Ada by hand and plays her turns on the big screen
  r.host.setPlayers([...r.host.players, { id: 'ada', name: 'Ada', color: COLORS[2], accessory: 0, seed: 1 }])
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  const R = riva.get().pid!, O = otto.get().pid!
  const med = idx('Baltic Avenue')
  await riva.act('land', R, med, { do: 'buy' })
  const side = (cells: number[], cash = 0) => ({ cells, cash, jailCards: 0 })
  assert.ok((await riva.act('trade', R, 'ada', side([med]), side([], 50))).pending)
  await settle()
  const x = r.host.offers[0]
  assert.deepEqual([x.needs, x.proxy], [[], ['ada']], 'nobody can say yes for Ada except the host')
  assert.equal(r.host.decide(x.id, true), null)
  assert.equal(r.book.get()!.state.owner[med], 'ada')
  // a pact with a phone player and a phoneless one waits for the phone, then the host; each holds a light blue
  const deal = (pid: string, cell: string) => { const s = r.book.get()!; r.book.commit(E.buy(s.game, s.state, pid, idx(cell)) as Entry) }
  deal(R, 'Oriental Avenue'); deal(O, 'Vermont Avenue'); deal('ada', 'Connecticut Avenue') // bought on earlier turns
  assert.ok((await riva.act('formPact', { members: [R, O, 'ada'], shares: { [R]: 40, [O]: 30, ada: 30 }, groups: ['light'], allyRent: 'free' })).pending)
  await settle()
  const pact = r.host.offers[0]
  assert.deepEqual([pact.needs, pact.proxy], [[O], ['ada']])
})

test('a phone that missed a sync asks again and catches up', async () => {
  const { book, riva, otto, R } = await started()
  const lost = otto.receive
  otto.receive = () => {} // otto's link drops for a moment
  await riva.act('land', R, idx('Baltic Avenue'), { do: 'buy' })
  await riva.act('rollDoubles', R)
  otto.receive = lost
  await riva.act('land', R, idx('Vermont Avenue'))
  await riva.act('endTurn')
  await settle()
  same(otto.get().state, book.get()!.state)
})

test('a live auction: steps set by the auctioneer, bids from phones and for a phoneless player, the top bid wins', async () => {
  const r = await room()
  const riva = await r.phone(), otto = await r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 0 })
  r.host.setPlayers([...r.host.players, { id: 'ada', name: 'Ada', color: COLORS[2], accessory: 0, seed: 1 }])
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  const R = riva.get().pid!, O = otto.get().pid!, baltic = idx('Baltic Avenue')
  assert.equal((await riva.startAuction(baltic, [10, 20])).error, 'Auction the square you just landed on', 'first she has to land there')
  await riva.act('land', R, baltic)
  assert.equal((await otto.startAuction(baltic, [10])).error, 'Only the player who landed there can auction it')
  assert.equal((await riva.startAuction(baltic, [0])).error, 'Pick one to four bid steps between 1 and 1,000')
  assert.ok((await riva.startAuction(baltic, [20, 10])).ok)
  await settle()
  assert.deepEqual(otto.get().auction?.steps, [10, 20], 'every phone sees the auction, steps smallest first')
  otto.bid(20)
  await settle()
  riva.bid(25) // not one of the steps
  await settle()
  assert.ok(r.said.includes('That is not one of the bid steps'))
  riva.bid(30)
  await settle()
  assert.equal(r.host.bid('ada', r.host.auction!.id, 50), null, 'the host screen bids for Ada, who has no phone')
  await settle()
  assert.deepEqual(otto.get().auction?.high, { pid: 'ada', amount: 50 })
  riva.bid(null); otto.bid(null)
  await settle()
  // everyone else is out, so the hammer falls at once
  assert.equal(r.book.get()!.state.owner[baltic], 'ada')
  assert.equal(r.book.get()!.state.cash.ada, 1500 - 50)
  assert.equal(riva.get().auction, null)
  assert.equal(r.book.get()!.entries.at(-1)!.memo, 'Ada won the auction for Baltic Avenue for $50')
  // an auction nobody bids on ends on the clock, and the deed stays with the bank
  const s = r.book.get()!
  r.book.commit(E.endTurn(s.game, s.state))
  await otto.act('land', O, idx('Oriental Avenue'))
  assert.ok((await otto.startAuction(idx('Oriental Avenue'), [10])).ok)
  await new Promise(res => setTimeout(res, 600))
  assert.equal(r.book.get()!.state.owner[idx('Oriental Avenue')], null)
  assert.ok(r.said.includes('Nobody bid on Oriental Avenue. It stays with the bank.'))
})

test('an eavesdropper cannot act as another player: tampered, replayed and forged messages are dropped', async () => {
  const r = await room()
  const riva = await r.phone(), otto = await r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  await otto.seat({ name: 'Otto', color: COLORS[1], accessory: 0 })
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  const R = riva.get().pid!, O = otto.get().pid!
  assert.ok(!JSON.stringify(r.heard).includes('"token"'), 'no secret seat token travels on the channel')
  // riva pays the bank 10; the spy copies her signed message
  assert.ok((await riva.act('transfer', R, 'bank', 10, 'fine')).ok)
  const signed = r.heard.find(m => m.t === 'do' && m.name === 'transfer')!
  const cash = () => r.book.get()!.state.cash
  // 1. replay it: the host has seen that id
  r.spy(signed); await settle(); await r.host.idle()
  assert.equal(cash()[R], 1490, 'a replay is ignored')
  // 2. change it to pay the spy's friend: the signature no longer matches
  r.spy({ ...signed, id: crypto.randomUUID(), args: [R, O, 1000, 'gift'] } as Msg); await settle(); await r.host.idle()
  assert.equal(cash()[R], 1490, 'a tampered message is ignored')
  // 3. sign it with another key but claim riva's: the stored key does not match
  const evil = await identity()
  const body = { t: 'do', name: 'transfer', args: [R, O, 1000, 'gift'], me: 'x', id: crypto.randomUUID(), key: (signed as { key: string }).key, at: Date.now() }
  r.spy({ ...body, sig: await evil.sign(JSON.stringify(body)) } as Msg); await settle(); await r.host.idle()
  assert.equal(cash()[R], 1490, 'a forged signature is ignored')
  assert.equal(cash()[O], 1500)
})

test('the host phone code works once, numbers must be whole, and requests are capped', async () => {
  const r = await room()
  const boss = await r.phone(), riva = await r.phone(), copycat = await r.phone()
  assert.equal((await boss.seat({ name: 'Boss', color: COLORS[0], accessory: 0 }, 's3cret')).admin, true)
  assert.notEqual(r.host.secret, 's3cret', 'the secret changed once used')
  assert.equal((await copycat.seat({ name: 'Copy', color: COLORS[2], accessory: 0 }, 's3cret')).admin, false, 'a copied host code is worthless')
  await riva.seat({ name: 'Riva', color: COLORS[1], accessory: 0 })
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await settle()
  const B = boss.get().pid!, R = riva.get().pid!
  // money sent as text would turn a balance into a string: the host refuses it
  assert.equal((await boss.act('trade', B, R, { cells: [], cash: '100' as never, jailCards: 0 }, { cells: [], cash: 0, jailCards: 0 })).error, 'That request did not make sense')
  assert.equal((await boss.act('trade', B, R, { cells: [], cash: 0.5, jailCards: 0 }, { cells: [], cash: 0, jailCards: 0 })).error, 'That request did not make sense')
  // five waiting requests at most per player
  for (let i = 0; i < 5; i++) assert.ok((await riva.act('transfer', 'bank', R, 1, 'please')).pending)
  assert.equal((await riva.act('transfer', 'bank', R, 1, 'please')).error, 'You have five requests waiting. Wait for answers first.')
})

test('a long ledger reaches a new phone in slices under the broadcast limit', async () => {
  const r = await room()
  const riva = await r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  r.host.setPlayers([...r.host.players, { id: 'ada', name: 'Ada', color: COLORS[1], accessory: 0, seed: 1 }])
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  for (let i = 0; i < 700; i++) { const s = r.book.get()!; r.book.commit(E.transfer(s.game, s.state, 'ada', 'bank', 1, `fee ${i}`) as Entry) }
  await r.host.idle(); await settle() // 700 signed syncs go out first
  r.heard.length = 0
  const late = await r.phone()
  await r.host.idle(); await settle()
  assert.equal(late.get().entries.length, 700)
  assert.deepEqual(late.get().state, r.book.get()!.state)
  const biggest = Math.max(...r.heard.map(m => JSON.stringify(m).length))
  assert.ok(biggest < 256_000, `largest message ${biggest} bytes`)
})

test('phones trust only the host they pinned: impostors, unsigned and replayed host messages are ignored', async () => {
  const r = await room()
  const riva = await r.phone()
  await riva.seat({ name: 'Riva', color: COLORS[0], accessory: 0 })
  r.host.start({ id: 'g', createdAt: 0, board: US, rules: E.defaultRules, players: r.host.players })
  await r.host.idle(); await settle()
  assert.equal(riva.get().hostKey, r.host.key, 'the first host heard is pinned')
  const real = riva.get().state
  const oldHello = r.heard.find(m => m.t === 'hello' && !m.game)! // from before the start
  // an impostor signs a hello with its own key, claiming a different ledger
  const fake = await identity()
  const forge = async (b: object) => {
    const body = { ...b, hk: fake.pub, ep: Date.now(), seq: 1 }
    r.spy({ ...body, sig: await fake.sign(JSON.stringify(body)) } as Msg)
  }
  await forge({ t: 'hello', game: null, entries: [], players: [], seated: [], offers: [] })
  await forge({ t: 'bye' })
  r.spy({ t: 'bye' } as Msg) // unsigned
  r.spy(oldHello) // the real host's own words, replayed
  await settle(); await settle()
  assert.deepEqual(riva.get().state, real, 'the ledger did not change')
  assert.equal(riva.get().ended, false, 'nobody but the host can end the session')
  // a phone that scanned the QR code already knows the key, so even its first hello cannot come from an impostor
  const scanned = createClient(() => {}, { id: await identity(), host: r.host.key })
  const body = { t: 'hello', game: null, entries: [], players: [{ id: 'x', name: 'Mallory', color: '#000', accessory: 0, seed: 0 }], seated: [], offers: [], hk: fake.pub, ep: Date.now(), seq: 1 }
  scanned.receive({ ...body, sig: await fake.sign(JSON.stringify(body)) } as Msg)
  await settle()
  assert.equal(scanned.get().heard, false)
})

test('however many phones say hi, one hello goes out a second, and a late hi still gets one', async () => {
  const join = wire(), book = memoryBook(), heard: Msg[] = []
  const host = createHost(book, join(m => host.receive(m)), { id: await identity(), colors: COLORS, accessories: 8, secret: 's', helloMs: 200 })
  const spy = join(m => heard.push(m))
  for (let i = 0; i < 20; i++) spy({ t: 'hi', me: `phone${i}` })
  await settle()
  assert.equal(heard.filter(m => m.t === 'hello').length, 1, 'the first one now')
  await new Promise(res => setTimeout(res, 260)); await host.idle(); await settle()
  assert.equal(heard.filter(m => m.t === 'hello').length, 2, 'and one more once the gap has passed, for the rest')
})
