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
}

export type Player = { id: string; name: string; color: string; accessory: number; seed: number }

export type Game = { id: string; createdAt: number; board: Board; rules: Rules; players: Player[] }

export type Party = string // a player id, 'bank' or 'pot'

export type Op =
  | { op: 'transfer'; from: Party; to: Party; amount: number }
  | { op: 'own'; cell: number; owner: string | null }
  | { op: 'build'; cell: number; level: number }
  | { op: 'mortgage'; cell: number; on: boolean }
  | { op: 'jail'; player: string; in: boolean }
  | { op: 'jailCard'; player: string; delta: number }
  | { op: 'turn'; player: string }
  | { op: 'bankrupt'; player: string }

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
}

export type Err = { error: string; short?: number; who?: string }
