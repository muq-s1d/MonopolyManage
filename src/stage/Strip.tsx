import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Game, Party } from '../engine/types.ts'
import type { Ev } from '../ui/events.ts'
import Creature from './Creature.tsx'
import Scene, { Fit } from './Scenes.tsx'
import { Coins, coinCount, StageLights, useDarkTheme, useReduced, type Flight } from './Stage.tsx'

export type Shown = Ev & { id: number }

const isPlayer = (p: Party | null): p is string => !!p && p !== 'bank' && p !== 'pot'
const PROUD = new Set(['buy', 'house', 'hotel', 'unmortgage', 'pact', 'jackpot', 'free', 'card'])

/** The moment's players side by side, payer on the left: coins fly out of one and rain into the other. */
function Moment({ game, ev, reduced }: { game: Game; ev: Shown; reduced: boolean }) {
  const flights = useRef<Flight[]>([])
  const invalidate = useThree(s => s.invalidate)
  const cast = [...new Set([ev.from, ev.to, ev.actor].filter(isPlayer))].slice(0, 2)
  const spot = (i: number): [number, number, number] => (cast.length === 1 ? [0, 0, 0] : [i ? 1.8 : -1.8, 0, 0])
  const at = useMemo(() => performance.now() / 1000 + 0.15, [])

  useEffect(() => {
    const where = (p: Party) => {
      const i = cast.indexOf(p)
      return i < 0 ? (p === 'pot' ? new THREE.Vector3(0, -0.8, 2) : new THREE.Vector3(0, 2.6, -3)) : new THREE.Vector3(spot(i)[0], 0.4, 0.3)
    }
    if (!reduced && ev.from && ev.to && ev.amount)
      for (let c = 0; c < coinCount(ev.amount); c++) flights.current.push({ from: where(ev.from), to: where(ev.to), t0: at + c * 0.07, dur: 0.8 })
    invalidate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one moment, keyed by its id

  return (
    <>
      {cast.map((pid, i) => {
        const player = game.players.find(p => p.id === pid)!
        const gain = pid === ev.to || (!ev.from && pid === ev.actor && PROUD.has(ev.kind))
        return (
          <Creature key={pid} player={player} target={spot(i)} scale={0.62} active={false}
            jailed={ev.kind === 'jail' && pid === ev.actor} bankrupt={ev.kind === 'bankrupt' && pid === ev.actor}
            low={false} proud={gain && PROUD.has(ev.kind)} reduced={reduced}
            reaction={pid === ev.from ? { kind: 'pay', at } : gain ? { kind: 'gain', at } : null} />
        )
      })}
      <Coins flights={flights} />
    </>
  )
}

/** One canvas for every strip, kept alive between moments so a phone compiles its shaders once. */
export default function Strip({ game, ev, big }: { game: Game; ev: Shown | null; big: boolean }) {
  const reduced = useReduced()
  const dark = useDarkTheme()
  return (
    <Canvas dpr={[1, 2]} frameloop={ev && !reduced ? 'always' : 'demand'} gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0.4, 6.5], fov: 26 }} fallback={null}>
      <StageLights dark={dark} />
      {big ? <Fit width={4.8} base={12} /> : <Fit width={5.4} base={6.5} />}
      {ev && (big ? <Scene key={ev.id} game={game} ev={ev} /> : <Moment key={ev.id} game={game} ev={ev} reduced={reduced} />)}
    </Canvas>
  )
}
