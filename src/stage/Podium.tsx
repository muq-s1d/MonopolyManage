import { useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import type { Player } from '../engine/types.ts'
import Creature, { type Reaction } from './Creature.tsx'
import { StageLights, useDarkTheme, useReduced } from './Stage.tsx'

// Winner in the middle on the tallest block, second on the left, third on the right.
const SPOTS: { x: number; h: number }[] = [{ x: 0, h: 1.1 }, { x: -2.1, h: 0.65 }, { x: 2.1, h: 0.35 }]
const SCALE = 0.72

/** Backs the camera off on narrow canvases so all three blocks (about 6.4 units wide) stay in frame. */
function Fit() {
  const { camera, size } = useThree()
  const aspect = size.width / size.height
  // half width visible at distance d with a 34 degree vertical field of view is d * tan(17°) * aspect
  const d = Math.max(6.4, 3.4 / (Math.tan((17 * Math.PI) / 180) * aspect))
  camera.position.set(0, 1.9 * (d / 6.4), d)
  camera.lookAt(0, 0.45, 0)
  return null
}

export default function Podium({ ranked }: { ranked: { player: Player; bankrupt: boolean }[] }) {
  const reduced = useReduced()
  const dark = useDarkTheme()
  const [cheer] = useState<Reaction>(() => ({ kind: 'gain', at: performance.now() / 1000 + 0.4 }))
  const top = ranked.slice(0, 3)
  return (
    <div className="podium-canvas" role="img" aria-label={`Podium: ${top.map((r, i) => `${i + 1}. ${r.player.name}`).join(', ')}`}>
      <Canvas dpr={[1, 2]} frameloop={reduced ? 'demand' : 'always'} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 1.9, 6.4], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0.45, 0)}>
        <Fit />
        <StageLights dark={dark} />
        {top.map((r, i) => (
          <group key={r.player.id}>
            <mesh position={[SPOTS[i].x, SPOTS[i].h / 2 - 1.34 * SCALE, 0]}>
              <boxGeometry args={[1.8, SPOTS[i].h, 1.6]} />
              <meshStandardMaterial color="#C9A24B" metalness={0.55} roughness={0.38} />
            </mesh>
            <Creature player={r.player} target={[SPOTS[i].x, SPOTS[i].h, 0]} scale={SCALE}
              active={false} jailed={false} bankrupt={r.bankrupt} low={false} proud={i === 0}
              reaction={i === 0 ? cheer : null} reduced={reduced} />
          </group>
        ))}
        <ContactShadows position={[0, -1.34 * SCALE, 0]} opacity={dark ? 0.55 : 0.3} scale={10} blur={2.4} far={3} frames={1} />
      </Canvas>
    </div>
  )
}
