import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js'
import type { Entry, Game, Player } from '../engine/types.ts'

/** A request waiting on the other players and then the host. */
export type Offer = { id: string; from: string; name: string; args: unknown[]; memo: string; needs: string[]; accepted: string[] }
export type NewPlayer = Pick<Player, 'name' | 'color' | 'accessory'>

/** Every message on a session channel. `me` is the sending phone's device id, `to` the device a reply is for. */
export type Msg =
  | { t: 'hi'; me: string }
  | { t: 'hello'; game: Game | null; entries: Entry[]; players: Player[]; seated: string[]; offers: Offer[] }
  | { t: 'seat'; me: string; id: string; token?: string; player?: NewPlayer; host?: string }
  | { t: 'do'; me: string; id: string; token: string; name: string; args: unknown[] }
  | { t: 'done'; to: string; id: string; ok?: true; pending?: true; error?: string; pid?: string; token?: string; admin?: boolean }
  | { t: 'answer'; me: string; token: string; offer: string; yes: boolean }
  | { t: 'decide'; me: string; token: string; offer: string; yes: boolean }
  | { t: 'offers'; offers: Offer[] }
  | { t: 'sync'; keep: number; add: Entry[]; n: number }
  | { t: 'say'; pids: string[]; text: string; error?: boolean }
  | { t: 'bye' }

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
  const client = new RealtimeClient(`${SB_URL.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: KEY } })
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
