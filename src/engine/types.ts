export type CellKind =
  | 'go' | 'property' | 'railroad' | 'utility' | 'tax'
  | 'chance' | 'chest' | 'jail' | 'parking' | 'gotojail'

export type Cell = {
  kind: CellKind
  name: string
  group?: string        // property only
  price?: number        // property, railroad, utility
  rents?: number[]      // property: [base, 1h, 2h, 3h, 4h, hotel]
  houseCost?: number    // property
  amount?: number       // tax
}

export type Group = { id: string; name: string; color: string }

export type Effect =
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'collectEach'; amount: number }
  | { type: 'payEach'; amount: number }
  | { type: 'repairs'; house: number; hotel: number }
  | { type: 'jail' }
  | { type: 'jailCard' }
  | { type: 'advance'; cell: number }
  | { type: 'nearest'; kind: 'railroad' | 'utility' }
  | { type: 'move' }

export type Card = { title: string; effect: Effect }

export type Board = {
  id: string
  name: string
  currency: string
  salary: number
  startingCash: number
  jailFine: number
  houses: number
  hotels: number
  railroadRents: number[]       // by number owned
  utilityMultipliers: number[]  // dice multiplier by number owned
  groups: Group[]
  cells: Cell[]
  chance: Card[]
  chest: Card[]
}

export type Rules = {
  freeParking: boolean
  doubleGo: boolean
  auctions: boolean
  evenBuild: boolean
  bankLimit: boolean
  mortgageInterest: boolean
  setDoubleRent: boolean
  noRentInJail: boolean
  deals?: boolean // alliances, loans and free rent; missing on older games means on
}

export type Player = { id: string; name: string; color: string; accessory: number; seed: number }

export type Game = { id: string; createdAt: number; board: Board; rules: Rules; players: Player[] }

export type Party = string // a player id, 'bank' or 'pot'

/** Players pooling the deeds they own in some groups. Shares are whole percentages summing to 100. */
export type Pact = {
  id: string
  members: string[]
  shares: Record<string, number>
  groups: string[]          // colour group ids, 'railroad', 'utility'
  allyRent: 'free' | 'paid' // what members pay when landing on the pact's own deeds
}

export type Loan = { id: string; lender: string; borrower: string; amount: number; repay: number; dueRound: number }

/** Free landings on the grantor's own deeds (all of them, or one group). */
export type Immunity = { id: string; holder: string; grantor: string; group: string; landings: number }

export type Op =
  | { op: 'transfer'; from: Party; to: Party; amount: number }
  | { op: 'own'; cell: number; owner: string | null }
  | { op: 'build'; cell: number; level: number }
  | { op: 'mortgage'; cell: number; on: boolean }
  | { op: 'jail'; player: string; in: boolean }
  | { op: 'jailCard'; player: string; delta: number }
  | { op: 'turn'; player: string }
  | { op: 'bankrupt'; player: string }
  | { op: 'pact'; id: string; pact: Pact | null }
  | { op: 'loan'; id: string; loan: Loan | null }
  | { op: 'immunity'; id: string; immunity: Immunity | null }

export type Entry = { at: number; memo: string; ops: Op[] }

export type State = {
  cash: Record<string, number>
  pot: number
  bank: number                     // net money the bank has taken in; starts at 0
  owner: (string | null)[]
  level: number[]                  // 0 to 4 houses, 5 = hotel
  mortgaged: boolean[]
  jailed: Record<string, boolean>
  jailTurns: Record<string, number>
  jailCards: Record<string, number>
  bankrupt: Record<string, boolean>
  turn: string
  round: number
  pacts: Record<string, Pact>
  loans: Record<string, Loan>
  immunities: Record<string, Immunity>
}

export type Err = { error: string; short?: number; who?: string }
