import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { groupCells, money } from '../engine/engine.ts'
import type { Entry, Game, State } from '../engine/types.ts'
import Creature, { type Reaction } from './Creature.tsx'

export const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
export function useReduced() {
  const [r, setR] = useState(reducedQuery.matches)
  useEffect(() => {
    const f = () => setR(reducedQuery.matches)
    reducedQuery.addEventListener('change', f)
    return () => reducedQuery.removeEventListener('change', f)
  }, [])
  return r
}

export function useDarkTheme() {
  const read = () => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches
  }
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

/** Up to five creatures stand on one arc; six or more split into a front row and a raised back step. */
export function layout(n: number) {
  if (n <= 5) {
    // Fits the camera's ~5.6 unit wide view: edge creature x plus its half width stays under 2.7.
    const spread = Math.min(Math.PI * 0.78, (n - 1) * 0.7)
    const R = 2.3
    const scale = n <= 3 ? 0.78 : n <= 4 ? 0.66 : 0.55
    return Array.from({ length: n }, (_, i) => {
      const a = n === 1 ? 0 : spread * (i / (n - 1) - 0.5)
      return { pos: [R * Math.sin(a), 0, -R * (1 - Math.cos(a)) - 0.4] as [number, number, number], scale }
    })
  }
  const front = Math.ceil(n / 2), scale = 0.5
  return Array.from({ length: n }, (_, i) => {
    const back = i >= front, k = back ? i - front : i, count = back ? n - front : front
    const x = (k - (count - 1) / 2) * 1.18
    return { pos: [x, back ? STEP : 0, back ? -1.7 : 0] as [number, number, number], scale }
  })
}
const STEP = 0.72

/** Coins per transfer grow with the log of the amount: one coin per doubling above 10. */
export const coinCount = (amount: number) => Math.max(1, Math.min(10, Math.round(Math.log2(Math.max(amount, 10) / 10)) + 1))

export type Flight = { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }
const MAX_COINS = 80
const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24)
const coinMat = new THREE.MeshStandardMaterial({ color: '#E8C872', metalness: 0.85, roughness: 0.3, emissive: '#7A5A14', emissiveIntensity: 0.6 })
const tmp = new THREE.Object3D()

export function Coins({ flights }: { flights: RefObject<Flight[]> }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useFrame(({ invalidate }) => {
    const now = performance.now() / 1000
    const list = flights.current
    let k = 0
    for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 > list[i].dur) list.splice(i, 1)
    for (const f of list) {
      if (k >= MAX_COINS) break
      const u = Math.min(1, Math.max(0, (now - f.t0) / f.dur))
      if (u <= 0) continue
      tmp.position.lerpVectors(f.from, f.to, u)
      tmp.position.y += Math.sin(u * Math.PI) * 1.1
      tmp.rotation.set(u * 9, u * 5, 0.4)
      tmp.scale.setScalar(u < 0.1 ? u * 10 : u > 0.92 ? (1 - u) * 12.5 : 1)
      tmp.updateMatrix()
      ref.current.setMatrixAt(k++, tmp.matrix)
    }
    ref.current.count = k
    ref.current.instanceMatrix.needsUpdate = true
    if (k) invalidate()
  })
  return <instancedMesh ref={ref} args={[coinGeo, coinMat, MAX_COINS]} frustumCulled={false} />
}

function Spotlight({ x, z, dark }: { x: number; z: number; dark: boolean }) {
  const cone = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.SpotLight>(null!)
  const { scene } = useThree()
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => { scene.add(target); return () => { scene.remove(target) } }, [scene, target])
  useFrame((_, dt) => {
    const c = cone.current
    c.position.x = THREE.MathUtils.damp(c.position.x, x, 6, dt)
    c.position.z = THREE.MathUtils.damp(c.position.z, z, 6, dt)
    light.current.position.set(c.position.x, 6, c.position.z + 1)
    target.position.set(c.position.x, 0, c.position.z)
    light.current.target = target
  })
  return (
    <>
      <spotLight ref={light} angle={0.32} penumbra={0.7} intensity={dark ? 60 : 30} distance={14} color="#FFE7B0" />
      <mesh ref={cone} position={[x, 1.6, z]}>
        <coneGeometry args={[1.25, 5.4, 40, 1, true]} />
        <meshBasicMaterial color={dark ? '#E8C872' : '#B38A2E'} transparent opacity={dark ? 0.1 : 0.08} depthWrite={false}
          blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

/** Warm key light plus a studio environment built from light panels, so brass reflects without fetching an HDR. */
export function StageLights({ dark }: { dark: boolean }) {
  return (
    <>
      <ambientLight intensity={dark ? 0.55 : 0.9} />
      <directionalLight position={[-4, 6, 6]} intensity={dark ? 1.6 : 2} color="#FFF4DD" />
      <directionalLight position={[5, 3, -4]} intensity={0.6} color="#9FC7B4" />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.2} position={[0, 4, -6]} scale={[12, 3, 1]} color="#FFF1CF" />
        <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#E8C872" />
        <Lightformer intensity={0.8} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
      </Environment>
    </>
  )
}

/** A pact member's sash takes the colour of the pact's first pooled set, so allies match and read as that set. */
function sashFor(game: Game, state: State, pid: string) {
  const pact = Object.values(state.pacts).find(x => x.members.includes(pid))
  if (!pact) return undefined
  return game.board.groups.find(g => g.id === pact.groups[0])?.color ?? '#C9A24B'
}

function Scene({ game, state, entries, reduced, dark }: { game: Game; state: State; entries: Entry[]; reduced: boolean; dark: boolean }) {
  const spots = useMemo(() => layout(game.players.length), [game.players.length])
  const idx = useMemo(() => new Map(game.players.map((p, i) => [p.id, i])), [game.players])
  const flights = useRef<Flight[]>([])
  const [reactions, setReactions] = useState<Record<string, Reaction>>({})
  const seen = useRef(entries.length)
  const invalidate = useThree(s => s.invalidate)

  // A new ledger entry: money flies between the parties and the creatures react.
  useEffect(() => {
    const prev = seen.current
    seen.current = entries.length
    if (entries.length <= prev) return
    const e = entries[entries.length - 1]
    const now = performance.now() / 1000
    const where = (party: string) => {
      const i = idx.get(party)
      if (i === undefined) return party === 'pot' ? new THREE.Vector3(0, 0.2, 2.2) : new THREE.Vector3(0, 3.6, -4.5)
      const [x, y, z] = spots[i].pos
      return new THREE.Vector3(x, y + 0.8, z + (state.turn === party ? 0.9 : 0))
    }
    const delta: Record<string, number> = {}
    for (const o of e.ops) {
      if (o.op !== 'transfer') continue
      delta[o.from] = (delta[o.from] ?? 0) - o.amount
      delta[o.to] = (delta[o.to] ?? 0) + o.amount
      if (reduced) continue
      const n = coinCount(o.amount)
      for (let c = 0; c < n; c++) flights.current.push({ from: where(o.from), to: where(o.to), t0: now + c * 0.07, dur: 0.85 })
    }
    const next: Record<string, Reaction> = {}
    for (const [id, d] of Object.entries(delta)) if (idx.has(id) && d) next[id] = { kind: d > 0 ? 'gain' : 'pay', at: now }
    if (Object.keys(next).length) setReactions(r => ({ ...r, ...next }))
    invalidate()
  }, [entries, idx, spots, state.turn, reduced, invalidate])

  const cheapest = Math.min(...game.board.cells.flatMap(c => (c.rents ? [c.rents[0]] : [])), 50)
  const active = idx.get(state.turn) ?? 0
  const [ax, , az] = spots[active].pos

  return (
    <>
      <StageLights dark={dark} />
      <Spotlight x={ax} z={az + 0.9} dark={dark} />
      {game.players.map((p, i) => {
        const owned = game.board.groups.some(g => {
          const cells = groupCells(game.board, g.id)
          return cells.length > 0 && cells.every(c => state.owner[c] === p.id)
        })
        return (
          <Creature key={p.id} player={p} target={spots[i].pos} scale={spots[i].scale}
            active={state.turn === p.id && !state.bankrupt[p.id]} jailed={state.jailed[p.id]} bankrupt={state.bankrupt[p.id]}
            low={!state.bankrupt[p.id] && state.cash[p.id] < cheapest * 3} proud={owned}
            reaction={reactions[p.id] ?? null} reduced={reduced} sash={sashFor(game, state, p.id)} />
        )
      })}
      {game.players.length > 5 && (
        <group position={[0, STEP - 1.34 * 0.5 - 0.36, -1.7]}>
          <mesh><boxGeometry args={[6.4, 0.72, 1.5]} /><meshStandardMaterial color={dark ? '#0C3227' : '#E4D8BC'} roughness={0.9} /></mesh>
          <mesh position={[0, 0.37, 0.76]}><boxGeometry args={[6.4, 0.04, 0.04]} /><meshStandardMaterial color="#C9A24B" metalness={1} roughness={0.3} /></mesh>
        </group>
      )}
      <Coins flights={flights} />
      <ContactShadows position={[0, -1.34 * spots[0].scale, 0]} opacity={dark ? 0.55 : 0.3} scale={14} blur={2.4} far={3} frames={reduced ? 1 : Infinity} />
    </>
  )
}

export default function Stage({ game, state, entries }: { game: Game; state: State; entries: Entry[] }) {
  const reduced = useReduced()
  const dark = useDarkTheme()
  const turn = game.players.find(p => p.id === state.turn)
  const label = `Stage with ${game.players.length} creatures. ${turn?.name ?? ''} is in the spotlight. ` +
    game.players.map(p => `${p.name} has ${money(game.board, state.cash[p.id])}${state.bankrupt[p.id] ? ', bankrupt' : state.jailed[p.id] ? ', in jail' : ''}`).join('. ')
  return (
    <div className="stage-canvas" role="img" aria-label={label}>
      <Canvas dpr={[1, 2]} frameloop={reduced ? 'demand' : 'always'} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true /* lets screenshots and captures see the stage */ }}
        camera={{ position: [0, 2.3, 8.2], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0.2, -0.9)}
        fallback={null}>
        <Scene game={game} state={state} entries={entries} reduced={reduced} dark={dark} />
      </Canvas>
    </div>
  )
}
