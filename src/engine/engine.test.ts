import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets } from './boards.ts'
import * as E from './engine.ts'
import * as D from './deals.ts'
import type { Entry, Err, Game, Rules, State } from './types.ts'

const US = presets[0]
const idx = (name: string) => US.cells.findIndex(c => c.name === name)

function setup(rules: Partial<Rules> = {}) {
  const g: Game = {
    id: 'g', createdAt: 0, board: US, rules: { ...E.defaultRules, ...rules },
    players: ['ann', 'bob', 'cat'].map((id, i) => ({ id, name: id, color: '#fff', accessory: i, seed: i })),
  }
  const log: Entry[] = []
  let s: State = E.initialState(g)
  const run = (x: Entry | Err) => {
    if (E.isErr(x)) throw new Error(x.error)
    log.push(x)
    s = E.replay(g, log)
    return s
  }
  return { g, log, run, get s() { return s } }
}

const rows: [string, number, number][] = []
const check = (label: string, expected: number, actual: number) => {
  rows.push([label, expected, actual])
  assert.equal(actual, expected, label)
}

test('rent table, hand checked against printed title deeds', () => {
  const t = setup()
  const med = idx('Mediterranean Avenue'), baltic = idx('Baltic Avenue'), bw = idx('Boardwalk'), pp = idx('Park Place')
  t.run(E.buy(t.g, t.s, 'ann', med))
  check('Mediterranean base rent', 2, E.rent(t.g, t.s, med).amount)
  t.run(E.buy(t.g, t.s, 'ann', baltic))
  check('Mediterranean, full unimproved set', 4, E.rent(t.g, t.s, med).amount)
  const plain = setup({ setDoubleRent: false })
  plain.run(E.buy(plain.g, plain.s, 'ann', med)); plain.run(E.buy(plain.g, plain.s, 'ann', baltic))
  check('Full set with double rent rule off', 2, E.rent(plain.g, plain.s, med).amount)

  t.run(E.transfer(t.g, t.s, 'bank', 'bob', 10000, 'test float'))
  t.run(E.buy(t.g, t.s, 'bob', pp)); t.run(E.buy(t.g, t.s, 'bob', bw))
  for (let k = 0; k < 5; k++) { t.run(E.build(t.g, t.s, pp)); t.run(E.build(t.g, t.s, bw)) }
  check('Boardwalk with a hotel', 2000, E.rent(t.g, t.s, bw).amount)
  check('Park Place with a hotel', 1500, E.rent(t.g, t.s, pp).amount)

  const r = setup()
  const rails = ['Reading Railroad', 'Pennsylvania Railroad', 'B&O Railroad', 'Short Line'].map(idx)
  const expect = [25, 50, 100, 200]
  rails.forEach((cell, k) => {
    r.run(E.buy(r.g, r.s, 'cat', cell))
    check(`${k + 1} railroads owned`, expect[k], E.rent(r.g, r.s, rails[0]).amount)
  })
  check('Nearest railroad card, 4 owned', 400, E.rent(r.g, r.s, rails[0], { railroadMultiplier: 2 }).amount)

  const u = setup()
  const ec = idx('Electric Company'), ww = idx('Water Works')
  u.run(E.buy(u.g, u.s, 'ann', ec))
  check('Utility, dice 7, one owned', 28, E.rent(u.g, u.s, ec, { dice: 7 }).amount)
  check('Nearest utility card, dice 7', 70, E.rent(u.g, u.s, ec, { dice: 7, utilityMax: true }).amount)
  u.run(E.buy(u.g, u.s, 'ann', ww))
  check('Utility, dice 7, both owned', 70, E.rent(u.g, u.s, ec, { dice: 7 }).amount)
})

test('rent moves money, mortgaged and jail rules', () => {
  const t = setup({ noRentInJail: true })
  const med = idx('Mediterranean Avenue')
  t.run(E.buy(t.g, t.s, 'ann', med))
  t.run(E.payRent(t.g, t.s, 'bob', med))
  check('Ann after buying for 60 and 2 rent', 1442, t.s.cash.ann)
  check('Bob after paying 2 rent', 1498, t.s.cash.bob)
  t.run(E.goToJail(t.g, 'ann'))
  assert.ok(E.isErr(E.payRent(t.g, t.s, 'bob', med)), 'no rent while owner in jail')
  t.run(E.leaveJail(t.g, t.s, 'ann', 'fine'))
  check('Jail fine goes into the pot', 50, t.s.pot)
  t.run(E.mortgage(t.g, t.s, med))
  check('Mortgage pays half of 60', 1392 + 30, t.s.cash.ann)
  assert.ok(E.isErr(E.payRent(t.g, t.s, 'bob', med)), 'no rent on mortgaged')
  check('Unmortgage cost 30 plus 10% = 33', 33, E.unmortgageCost(t.g, med))
  t.run(E.unmortgage(t.g, t.s, med))
  check('Ann after lifting mortgage', 1422 - 33, t.s.cash.ann)
  check('Unmortgage Park Place 175 plus 10% rounds up to 193', 193, E.unmortgageCost(t.g, idx('Park Place')))
})

test('building rules: even building and bank supply', () => {
  const t = setup()
  const [a, b, c] = ['Oriental Avenue', 'Vermont Avenue', 'Connecticut Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', a)); t.run(E.buy(t.g, t.s, 'ann', b))
  assert.match(E.canBuild(t.g, t.s, a)!, /Own the whole colour set/)
  t.run(E.buy(t.g, t.s, 'ann', c))
  t.run(E.build(t.g, t.s, a))
  assert.match(E.canBuild(t.g, t.s, a)!, /Build evenly/)
  t.run(E.build(t.g, t.s, b)); t.run(E.build(t.g, t.s, c))
  check('Houses left after 3 built', 29, E.housesLeft(t.g, t.s))
  t.run(E.build(t.g, t.s, a))
  assert.match(E.canSell(t.g, t.s, b)!, /Sell evenly/)
  assert.equal(E.canSell(t.g, t.s, a), null)
  const m = E.mortgage(t.g, t.s, b)
  assert.ok(E.isErr(m) && /Sell every building/.test(m.error), 'cannot mortgage while the set has buildings')
})

test('repairs card, 3 houses and 1 hotel at 25 and 100', () => {
  const t = setup({ evenBuild: false })
  t.run(E.transfer(t.g, t.s, 'bank', 'ann', 5000, 'float'))
  const [m, bl] = ['Mediterranean Avenue', 'Baltic Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl))
  for (let k = 0; k < 5; k++) t.run(E.build(t.g, t.s, m)) // hotel on Mediterranean
  for (let k = 0; k < 3; k++) t.run(E.build(t.g, t.s, bl)) // 3 houses on Baltic
  const before = t.s.cash.ann
  const card = US.chance.find(c => c.effect.type === 'repairs')!
  t.run(E.drawCard(t.g, t.s, 'ann', card))
  check('Repairs: 3 houses x 25 + 1 hotel x 100', 175, before - t.s.cash.ann)
  check('Hotel returned 4 houses: 32 minus 3 on Baltic', 29, E.housesLeft(t.g, t.s))
  check('Hotels left', 11, E.hotelsLeft(t.g, t.s))
})

test('free parking pot, birthday card, pass go', () => {
  const t = setup({ doubleGo: true })
  t.run(E.payTax(t.g, t.s, 'ann', idx('Income Tax')))
  t.run(E.payTax(t.g, t.s, 'bob', idx('Luxury Tax')))
  check('Pot after 200 and 100 tax', 300, t.s.pot)
  t.run(E.collectPot(t.g, t.s, 'cat'))
  check('Cat collects the pot', 1800, t.s.cash.cat)
  check('Pot emptied', 0, t.s.pot)
  const bday = US.chest.find(c => c.effect.type === 'collectEach')!
  t.run(E.drawCard(t.g, t.s, 'cat', bday))
  check('Birthday: 10 from each of 2 players', 1820, t.s.cash.cat)
  t.run(E.passGo(t.g, 'ann', true))
  check('Landing exactly on Go pays double with rule on', 1300 - 10 + 400, t.s.cash.ann)
})

test('trade with mortgage interest', () => {
  const t = setup()
  const med = idx('Mediterranean Avenue')
  t.run(E.buy(t.g, t.s, 'ann', med))
  t.run(E.mortgage(t.g, t.s, med))
  t.run(E.trade(t.g, t.s, 'ann', 'bob', { cells: [med], cash: 0, jailCards: 0 }, { cells: [], cash: 100, jailCards: 0 }))
  assert.equal(t.s.owner[med], 'bob')
  check('Bob pays 100 plus 10% of 30 = 3 interest', 1500 - 103, t.s.cash.bob)
  check('Ann: 1500 minus 60 plus 30 plus 100', 1570, t.s.cash.ann)
})

test('bankruptcy hands everything to the creditor', () => {
  const t = setup()
  const [m, bl] = ['Mediterranean Avenue', 'Baltic Avenue'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl))
  t.run(E.build(t.g, t.s, m)); t.run(E.build(t.g, t.s, bl))
  const annCash = t.s.cash.ann // 1500 - 120 - 100 = 1280
  t.run(E.bankrupt(t.g, t.s, 'ann', 'bob'))
  check('Bob gets cash plus half of 2 houses at 50', 1500 + annCash + 50, t.s.cash.bob)
  assert.equal(t.s.owner[m], 'bob'); assert.equal(t.s.level[m], 0)
  assert.equal(E.nextPlayer(t.g, t.s), 'bob')
  t.run(E.endTurn(t.g, t.s))
  assert.equal(E.nextPlayer(t.g, t.s), 'cat')
})

test('money is conserved and undo replays exactly', () => {
  const t = setup()
  const total = () => Object.values(t.s.cash).reduce((a, b) => a + b, 0) + t.s.pot + t.s.bank
  const start = total()
  t.run(E.buy(t.g, t.s, 'ann', idx('Boardwalk')))
  t.run(E.payTax(t.g, t.s, 'bob', idx('Income Tax')))
  t.run(E.passGo(t.g, 'cat'))
  t.run(E.payRent(t.g, t.s, 'cat', idx('Boardwalk')))
  check('Cash plus pot plus bank intake is constant', start, total())
  const before = JSON.stringify(E.replay(t.g, t.log.slice(0, 2)))
  const s2 = JSON.stringify(E.replay(t.g, t.log.slice(0, 2)))
  assert.equal(before, s2)
  check('Undo of last two entries restores cat', 1500, E.replay(t.g, t.log.slice(0, 2)).cash.cat)
})

test('net worth', () => {
  const t = setup()
  const [m, bl, rr] = ['Mediterranean Avenue', 'Baltic Avenue', 'Reading Railroad'].map(idx)
  t.run(E.buy(t.g, t.s, 'ann', m)); t.run(E.buy(t.g, t.s, 'ann', bl)); t.run(E.buy(t.g, t.s, 'ann', rr))
  t.run(E.build(t.g, t.s, m))
  t.run(E.mortgage(t.g, t.s, rr))
  const w = E.netWorth(t.g, t.s, 'ann')
  // cash 1500 - 60 - 60 - 200 - 50 + 100 = 1230; property 60 + 60 + 100 (mortgaged half) = 220; buildings 50
  check('Net worth cash', 1230, w.cash)
  check('Net worth property', 220, w.property)
  check('Net worth buildings', 50, w.buildings)
  check('Net worth total', 1500, w.total)
  check('Could raise: cash + 30 + 30 mortgages + 25 house', 1315, w.raisable)
})

test('board validation', () => {
  for (const b of presets) assert.deepEqual(E.validateBoard(b), {}, `${b.name} preset is valid`)
  const b = structuredClone(US)
  b.cells[1].rents = [2, 10, 5, 90, 160, 250]
  b.cells[3].name = ' '
  b.cells[0] = { kind: 'tax', name: 'Oops', amount: 10 }
  b.groups.push({ id: 'ghost', name: 'Ghost', color: '#000000' })
  b.cells = b.cells.map(c => (c.kind === 'jail' ? { kind: 'parking', name: 'Lot' } : c))
  const e = E.validateBoard(b)
  assert.match(e['cell.1.rents'], /never drop/)
  assert.match(e['cell.3.name'], /needs a name/)
  assert.match(e['cell.0.kind'], /must be Go/)
  assert.match(e['group.ghost'], /no properties/)
  assert.match(e.jail, /needs a Jail/)
})


// ---------- deals: pacts, loans, free rent ----------

test('split by shares always sums exactly', () => {
  assert.deepEqual(E.splitByShares(100, { a: 60, b: 40 }), { a: 60, b: 40 })
  const three = E.splitByShares(50, { a: 34, b: 33, c: 33 })
  check('$50 at 34/33/33 sums to 50', 50, three.a + three.b + three.c)
  assert.deepEqual(three, { a: 17, b: 17, c: 16 }) // 17.0, 16.5, 16.5: the spare dollar goes to b, first of the tied
  const one = E.splitByShares(1, { a: 34, b: 33, c: 33 })
  check('$1 across three goes to the largest remainder', 1, one.a)
  check('$28 at 50/20 (renormalised) gives the 50 share', 20, E.splitByShares(28, { a: 50, c: 20 }).a)
})

const orange = [16, 18, 19] // St. James $180, Tennessee $180, New York $200; houses $100

function orangePact(allyRent: 'free' | 'paid' = 'free') {
  const t = setup()
  t.run(E.buy(t.g, t.s, 'ann', 16)); t.run(E.buy(t.g, t.s, 'ann', 18)); t.run(E.buy(t.g, t.s, 'bob', 19))
  return t
}

test('pact pools a colour set: double rent, shared building, split rent', () => {
  const t = orangePact()
  assert.match(E.canBuild(t.g, t.s, 16)!, /pool it in a pact/)
  check('St. James base rent before the pact', 14, E.rent(t.g, t.s, 16).amount)
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 60, bob: 40 }, groups: ['orange'], allyRent: 'free' }))
  check('Pooled full set doubles St. James base rent', 28, E.rent(t.g, t.s, 16).amount)
  assert.equal(E.canBuild(t.g, t.s, 16), null)
  t.run(E.build(t.g, t.s, 16))
  check('Ann pays 60% of a $100 house: 1500 - 360 - 60', 1080, t.s.cash.ann)
  check('Bob pays 40%: 1500 - 200 - 40', 1260, t.s.cash.bob)
  t.run(E.build(t.g, t.s, 18)); t.run(E.build(t.g, t.s, 19))
  check('Three houses cost Ann 180 in total', 960, t.s.cash.ann)
  check('Three houses cost Bob 120 in total', 1180, t.s.cash.bob)
  t.run(E.payRent(t.g, t.s, 'cat', 19))
  check('Cat pays New York 1 house rent of 80', 1420, t.s.cash.cat)
  check('Ann receives 60% of 80', 1008, t.s.cash.ann)
  check('Bob receives 40% of 80', 1212, t.s.cash.bob)
  const ally = E.payRent(t.g, t.s, 'bob', 16)
  assert.ok(E.isErr(ally) && /Allies stay free on the Orange pact/.test(ally.error))
  t.run(E.sell(t.g, t.s, 19))
  check('Selling a house refunds 50: Ann gets 30', 1038, t.s.cash.ann)
  check('Bob gets 20', 1232, t.s.cash.bob)
  const w = E.netWorth(t.g, t.s, 'bob')
  check('Bob owns 40% of 2 houses at cost: 80', 80, w.buildings)
})

test('dissolving a pact sells buildings and splits the refund', () => {
  const t = orangePact()
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 60, bob: 40 }, groups: ['orange'], allyRent: 'free' }))
  for (const c of orange) t.run(E.build(t.g, t.s, c))
  const [a, b] = [t.s.cash.ann, t.s.cash.bob]
  const id = Object.keys(t.s.pacts)[0]
  t.run(D.endPact(t.g, t.s, id))
  check('3 houses at $100 refund $150: Ann gets 90', a + 90, t.s.cash.ann)
  check('Bob gets 60', b + 60, t.s.cash.bob)
  check('All orange houses gone', 0, orange.reduce((n, i) => n + t.s.level[i], 0))
  assert.deepEqual(t.s.pacts, {})
  assert.equal(t.s.owner[19], 'bob')
})

test('allies who pay rent pay the other members by renormalised share', () => {
  const t = setup()
  t.run(E.buy(t.g, t.s, 'ann', 16)); t.run(E.buy(t.g, t.s, 'bob', 18)); t.run(E.buy(t.g, t.s, 'cat', 19))
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob', 'cat'], shares: { ann: 50, bob: 30, cat: 20 }, groups: ['orange'], allyRent: 'paid' }))
  const [a, c] = [t.s.cash.ann, t.s.cash.cat]
  t.run(E.payRent(t.g, t.s, 'bob', 16))
  check('Bob pays doubled base rent 28 split 50:20, Ann gets 20', a + 20, t.s.cash.ann)
  check('Cat gets 8', c + 8, t.s.cash.cat)
  assert.ok(E.isErr(E.payRent(t.g, t.s, 'ann', 16)), 'nobody pays rent on their own deed')
})

test('pooled railroads count together', () => {
  const t = setup()
  t.run(E.buy(t.g, t.s, 'ann', 5)); t.run(E.buy(t.g, t.s, 'ann', 15)); t.run(E.buy(t.g, t.s, 'bob', 25)); t.run(E.buy(t.g, t.s, 'bob', 35))
  check('Ann alone with 2 railroads', 50, E.rent(t.g, t.s, 5).amount)
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 50, bob: 50 }, groups: ['railroad'], allyRent: 'free' }))
  check('Pooled 2 + 2 railroads charge the rent for 4', 200, E.rent(t.g, t.s, 5).amount)
  const [a, b] = [t.s.cash.ann, t.s.cash.bob]
  t.run(E.payRent(t.g, t.s, 'cat', 5))
  check('Ann gets half of 200', a + 100, t.s.cash.ann)
  check('Bob gets half of 200', b + 100, t.s.cash.bob)
})

test('pact rules: validation and suggested shares', () => {
  const t = orangePact()
  assert.match(D.pactProblem(t.g, t.s, { members: ['ann'], shares: { ann: 100 }, groups: ['orange'], allyRent: 'free' })!, /at least two/)
  assert.match(D.pactProblem(t.g, t.s, { members: ['ann', 'cat'], shares: { ann: 50, cat: 50 }, groups: ['orange'], allyRent: 'free' })!, /cat holds no deeds/)
  assert.match(D.pactProblem(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 60, bob: 30 }, groups: ['orange'], allyRent: 'free' })!, /add up to 90%/)
  const s = D.suggestShares(t.g, t.s, ['ann', 'bob'], ['orange'])
  check('Suggested share for Ann: 360 of 560 is 64%, rounds to 65', 65, s.ann)
  check('Suggested share for Bob', 35, s.bob)
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: s, groups: ['orange'], allyRent: 'free' }))
  assert.match(D.pactProblem(t.g, t.s, { members: ['ann', 'bob'], shares: s, groups: ['orange'], allyRent: 'free' })!, /already pooled/)
})

test('shares rebalance to 100 as one is typed', () => {
  check('Two allies: typing 45 gives the other 55', 55, D.rebalance({ a: 60, b: 40 }, ['a', 'b'], 'a', 45).b)
  const three = D.rebalance({ a: 50, b: 30, c: 20 }, ['a', 'b', 'c'], 'a', 60)
  check('Three allies: the other 40 splits 30:20, b gets 24', 24, three.b)
  check('c gets 16', 16, three.c)
  const floor = D.rebalance({ a: 50, b: 30, c: 20 }, ['a', 'b', 'c'], 'a', 100)
  assert.deepEqual(floor, { a: 98, b: 1, c: 1 }, 'nobody drops below 1%')
})

test('bankruptcy breaks the pact before assets change hands', () => {
  const t = orangePact()
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 60, bob: 40 }, groups: ['orange'], allyRent: 'free' }))
  for (const c of orange) t.run(E.build(t.g, t.s, c))
  const [a, b, c] = [t.s.cash.ann, t.s.cash.bob, t.s.cash.cat]
  t.run(E.bankrupt(t.g, t.s, 'bob', 'cat'))
  check('Ann keeps her 60% of the $150 refund', a + 90, t.s.cash.ann)
  check('Cat receives Bob cash plus his 40% refund', c + b + 60, t.s.cash.cat)
  assert.deepEqual(t.s.pacts, {})
  assert.equal(t.s.owner[19], 'cat'); assert.equal(t.s.owner[16], 'ann')
})

test('loans: interest, due round, repayment, bankruptcy', () => {
  const t = setup()
  t.run(D.lend(t.g, t.s, { lender: 'ann', borrower: 'bob', amount: 500, ratePct: 10, rounds: 3 }))
  const loan = Object.values(t.s.loans)[0]
  check('$500 at 10% repays $550', 550, loan.repay)
  check('Due in round 1 + 3', 4, loan.dueRound)
  check('Lender net worth counts the $550 owed', 1500 - 500 + 550, E.netWorth(t.g, t.s, 'ann').total)
  check('Borrower net worth subtracts it', 1500 + 500 - 550, E.netWorth(t.g, t.s, 'bob').total)
  assert.equal(D.dueLoans(t.s, 'bob').length, 0)
  for (let k = 0; k < 9; k++) t.run(E.endTurn(t.g, t.s))
  check('Nine turns of three players reach round 4', 4, t.s.round)
  assert.equal(D.dueLoans(t.s, 'bob').length, 1)
  t.run(D.repayLoan(t.g, t.s, loan.id))
  check('Ann after repayment', 1550, t.s.cash.ann)
  check('Bob after repayment', 1450, t.s.cash.bob)
  t.run(D.lend(t.g, t.s, { lender: 'ann', borrower: 'bob', amount: 100, ratePct: 0, rounds: 1 }))
  t.run(E.bankrupt(t.g, t.s, 'bob', 'bank'))
  assert.deepEqual(t.s.loans, {}, 'a bankrupt borrower\'s loan is written off')
})

test('free rent passes cover unpooled deeds only', () => {
  const t = setup()
  t.run(E.buy(t.g, t.s, 'bob', 39))
  t.run(D.grantPass(t.g, t.s, { holder: 'ann', grantor: 'bob', group: 'all', landings: 2, price: 100 }))
  check('Ann paid 100 for the pass', 1400, t.s.cash.ann)
  for (let k = 0; k < 2; k++) {
    const pass = D.passFor(t.g, t.s, 'ann', 39)!
    t.run(D.usePass(t.g, t.s, pass.id, 39))
  }
  assert.equal(D.passFor(t.g, t.s, 'ann', 39), null, 'both landings used')
  t.run(E.payRent(t.g, t.s, 'ann', 39))
  check('Third landing pays Boardwalk base rent 50', 1350, t.s.cash.ann)
  t.run(E.buy(t.g, t.s, 'cat', 37))
  t.run(D.grantPass(t.g, t.s, { holder: 'ann', grantor: 'bob', group: 'blue', landings: 1, price: 0 }))
  t.run(D.formPact(t.g, t.s, { members: ['bob', 'cat'], shares: { bob: 50, cat: 50 }, groups: ['blue'], allyRent: 'free' }))
  assert.equal(D.passFor(t.g, t.s, 'ann', 39), null, 'a pooled deed is not covered by a pass')
})

test('deals keep money conserved and old saves replay unchanged', () => {
  const t = orangePact()
  const total = () => Object.values(t.s.cash).reduce((a, b) => a + b, 0) + t.s.pot + t.s.bank
  t.run(D.formPact(t.g, t.s, { members: ['ann', 'bob'], shares: { ann: 60, bob: 40 }, groups: ['orange'], allyRent: 'free' }))
  for (const c of orange) t.run(E.build(t.g, t.s, c))
  t.run(E.payRent(t.g, t.s, 'cat', 16))
  t.run(D.lend(t.g, t.s, { lender: 'cat', borrower: 'ann', amount: 300, ratePct: 5, rounds: 2 }))
  t.run(D.endPact(t.g, t.s, Object.keys(t.s.pacts)[0]))
  check('Cash plus pot plus bank stays at 4500', 4500, total())
  const old = { ...t.g, rules: { ...t.g.rules } } as typeof t.g
  delete (old.rules as Partial<Rules>).deals
  const replayed = E.replay(old, t.log.slice(0, 3)) // three plain purchases, as saved before deals existed
  assert.deepEqual([replayed.pacts, replayed.loans, replayed.immunities], [{}, {}, {}])
  check('Old save replays Ann cash', 1140, replayed.cash.ann)
})

test.after(() => {
  console.log('\n  check'.padEnd(62) + 'expected  actual')
  for (const [l, e, a] of rows) console.log(`  ${l.padEnd(58)} ${String(e).padStart(8)} ${String(a).padStart(7)}${e === a ? '' : '  MISMATCH'}`)
})
