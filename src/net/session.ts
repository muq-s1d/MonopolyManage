import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js'
import type { Entry, Game, Player } from '../engine/types.ts'

/** A request waiting on the other players and then the host. */
/** `needs` must each say yes on their phone; `proxy` have no phone, so the host's Approve is their yes. */
export type Offer = { id: string; from: string; name: string; args: unknown[]; memo: string; needs: string[]; accepted: string[]; proxy?: string[] }
/**
 * A live auction on the host. `steps`: the raises the auctioneer allows, each bid is the top bid plus one of them.
 * `ms`: time left when sent, since phone clocks differ from the host's.
 */
export type Auction = { id: string; cell: number; by: string; steps: number[]; high: { pid: string; amount: number } | null; out: string[]; ms: number }

/** Checks the raises an auctioneer picked: one to four whole amounts from 1 to 1,000, smallest first. */
export function cleanSteps(x: unknown): number[] | null {
  if (!Array.isArray(x) || !x.length || x.length > 4 || !x.every(n => Number.isInteger(n) && n >= 1 && n <= 1000)) return null
  return [...new Set(x as number[])].sort((a, b) => a - b)
}
export type NewPlayer = Pick<Player, 'name' | 'color' | 'accessory'> & { seed?: number }

/** What the host says. Every one goes out stamped and signed by the host (see `Hosted`). */
export type HostBody =
  | { t: 'hello'; game: Game | null; entries: Entry[]; players: Player[]; seated: string[]; offers: Offer[]; auction?: Auction | null }
  | { t: 'done'; to: string; id: string; ok?: true; pending?: true; error?: string; pid?: string; admin?: boolean }
  | { t: 'offers'; offers: Offer[] }
  | { t: 'auction'; auction: Auction | null }
  | { t: 'sync'; keep: number; add: Entry[]; n: number }
  | { t: 'say'; pids: string[]; text: string; error?: boolean }
  | { t: 'bye' }

/**
 * A host message as sent: `hk` is the host's public key, `ep` when this host started and `seq` its running count,
 * so a phone can refuse anything older than what it has seen; `sig` signs everything else.
 */
export type Hosted<T = HostBody> = T extends unknown ? T & { hk: JsonWebKey; ep: number; seq: number; sig: string } : never

/**
 * Every message on a session channel. `me` is the sending phone's device id, `to` the device a reply is for.
 * The channel is shared, so nothing secret travels on it and both sides sign: phones their requests, the host its answers.
 */
export type Msg =
  | { t: 'hi'; me: string }
  | Hosted
  | Signed<{ t: 'seat'; pub?: JsonWebKey; player?: NewPlayer; host?: string; claim?: string }>
  | Signed<{ t: 'do'; name: string; args: unknown[] }>
  | Signed<{ t: 'answer'; offer: string; yes: boolean }>
  | Signed<{ t: 'decide'; offer: string; yes: boolean }>
  | Signed<{ t: 'bid'; auction: string; amount: number | null }> // null: out of the bidding

/** A phone's request: `key` names its public key, `sig` signs everything else, `id` and `at` stop a replay. */
export type Signed<T> = T & { me: string; id: string; key: string; at: number; sig: string }

// ---------- identity: a key pair per device; the private half never leaves it ----------

const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const, SIG = { name: 'ECDSA', hash: 'SHA-256' } as const
const bytes = (t: string) => new TextEncoder().encode(t)
export type Identity = { key: string; pub: JsonWebKey; jwk: JsonWebKey; sign: (data: string) => Promise<string> }

/** This device's key pair: the saved one, or a new one (save `jwk` to keep the seat across reloads). */
export async function identity(saved?: JsonWebKey | null): Promise<Identity> {
  let priv: CryptoKey, jwk: JsonWebKey
  if (saved?.d) { jwk = saved; priv = await crypto.subtle.importKey('jwk', saved, EC, true, ['sign']) }
  else { const k = await crypto.subtle.generateKey(EC, true, ['sign', 'verify']); priv = k.privateKey; jwk = await crypto.subtle.exportKey('jwk', priv) }
  const pub = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
  return { key: jwk.x!, pub, jwk, sign: async d => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign(SIG, priv, bytes(d))))) }
}

/** Whether `sig` is this public key's signature of `data`. Anything malformed is simply false. */
export async function verify(pub: JsonWebKey, data: string, sig: string) {
  try {
    const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y }, EC, false, ['verify'])
    return await crypto.subtle.verify(SIG, k, Uint8Array.from(atob(sig), c => c.charCodeAt(0)), bytes(data))
  } catch { return false }
}

export const SB_URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined
export const KEY = import.meta.env?.VITE_SUPABASE_KEY as string | undefined

/** Five letters without the look-alikes I, L and O: 23^5, about 6.4 million codes. */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), n => LETTERS[n % LETTERS.length]).join('')
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)

export type Link = {
  send: (m: Msg) => Promise<boolean>
  /** Device ids present on the channel, updated live. */
  present: () => string[]
  close: () => void
}

/**
 * Joins `session:<code>` over one WebSocket on port 443. Resolves once subscribed.
 * `onStatus` reports the link going up and down; realtime-js reconnects by itself.
 * ponytail: public channel, readable by anyone with the code and the public key. Private channels with RLS if this leaves friends and family.
 */
export function connect(code: string, me: string, onMsg: (m: Msg) => void, onStatus: (up: boolean) => void, onPresence: () => void): Promise<Link> {
  if (!SB_URL || !KEY) return Promise.reject(new Error('Sessions are not set up on this site'))
  // the default backs off to 10 s between tries, so a phone back from a tunnel waited half a minute; a failed try is cheap
  const client = new RealtimeClient(`${SB_URL.replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey: KEY }, reconnectAfterMs: (tries: number) => [500, 1000, 2000][tries - 1] ?? 3000,
  })
  const ch: RealtimeChannel = client.channel(`session:${code}`, { config: { broadcast: { ack: true }, presence: { key: me } } })
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as Msg))
  ch.on('presence', { event: 'sync' }, onPresence)
  const link: Link = {
    send: m => ch.send({ type: 'broadcast', event: 'm', payload: m }).then(r => r === 'ok'),
    present: () => Object.keys(ch.presenceState()),
    close: () => { ch.unsubscribe(); client.disconnect() },
  }
  return new Promise((resolve, reject) => {
    let first = true
    const timer = setTimeout(() => { if (first) { link.close(); reject(new Error('Could not reach the session service')) } }, 15000)
    ch.subscribe(status => {
      const up = status === 'SUBSCRIBED'
      if (up) ch.track({})
      if (first && up) { first = false; clearTimeout(timer); resolve(link) }
      else if (!first) onStatus(up)
    })
  })
}

/** Reads the one keepalive row. False means the project is paused or unreachable. */
export const awake = () =>
  fetch(`${SB_URL}/rest/v1/keepalive?select=id`, { headers: { apikey: KEY! } }).then(r => r.ok, () => false)
