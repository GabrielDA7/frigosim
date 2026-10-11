'use client'
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, OrthographicCamera } from '@react-three/drei'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { HOSES, HoseId, P_ATM, PORTS, PortId, SimState, compRunning, evrOpen, liquid, pAir, pRef, portNode, pressure, readings } from '@/lib/sim'
import { PROPS, Refrigerant, satT } from '@/lib/refrigerants'

export type Equip = 'manifold' | 'groupe' | 'svBP' | 'svHP' | 'evr' | 'kp' | 'pump' | 'vg' | 'refCyl' | 'recCyl' | 'rec' | 'n2' | 'scale'
export type V3 = [number, number, number]
export type Positions = Record<Equip, V3>
export type EndRef = { hose: HoseId; end: 'a' | 'b' }
export interface SceneProps {
  state: SimState; zoom: number; highlight: boolean; positions: Positions
  selectedEnd: EndRef | null; selectedEquip: Equip | null
  onSelectEnd: (e: EndRef | null) => void
  onConnect: (hose: HoseId, end: 'a' | 'b', port: PortId | null) => void
  onSelectEquip: (e: Equip | null) => void
  onMove: (e: Equip, pos: V3) => void
  onDropCylinder: (item: 'refCyl' | 'recCyl', onScale: boolean) => void
  onNotice: (msg: string) => void
  renderPopover: (e: Equip) => { title: string; body: React.ReactNode } | null
  renderEndPopover: (e: EndRef) => React.ReactNode
}

// ---------- disposition ----------
const G: V3 = [-1.35, 1.08, -1.88] // centre du groupe mural (fixe)
export const DEFAULT_POS: Positions = {
  groupe: G, svBP: G, svHP: G, evr: G, kp: G,
  manifold: [-1.5, 1.2, 0.3], vg: [-0.35, 0.98, 0.55], pump: [0.25, 1.02, 0.05], rec: [1.0, 1.05, 0.35],
  scale: [1.85, 0.94, 0.25], refCyl: [3.0, 0.37, -0.6], recCyl: [2.75, 0.4, 1.0], n2: [-2.9, 0.7, 0.9],
}
const HALF_H: Record<Equip, number> = { groupe: 0, svBP: 0, svHP: 0, evr: 0, kp: 0, manifold: 0.27, vg: 0.05, pump: 0.09, rec: 0.12, scale: 0.01, refCyl: 0.37, recCyl: 0.4, n2: 0.7 }
const RADIUS: Record<Equip, number> = { groupe: 0, svBP: 0, svHP: 0, evr: 0, kp: 0, manifold: 0.22, vg: 0.1, pump: 0.22, rec: 0.22, scale: 0.28, refCyl: 0.17, recCyl: 0.18, n2: 0.14 }
const MOVABLE = new Set<Equip>(['manifold', 'vg', 'pump', 'rec', 'scale', 'refCyl', 'recCyl', 'n2'])
const HANGABLE = new Set<Equip>(['manifold', 'vg'])
const BENCH = { x0: -2.2, x1: 2.2, z0: -0.2, z1: 0.8, top: 0.93 }
const BENCH_BOX = new THREE.Box3(new THREE.Vector3(-2.2, 0, -0.2), new THREE.Vector3(2.2, 0.93, 0.8))
const WALL_Z = -2.25
const UNIT_RECT = { x0: -2.5, x1: -0.2, y0: 0.8, y1: 2.2 }
const inBench = (x: number, z: number) => x > BENCH.x0 && x < BENCH.x1 && z > BENCH.z0 && z < BENCH.z1
const surfaceY = (x: number, z: number) => (inBench(x, z) ? BENCH.top : 0)
const hiddenByBench = (x: number, z: number) => [0, 0.3, 0.6, 0.93].some((t) => inBench(x + t, z + t))
const MAN_ROT = Math.PI / 4
const rotY = (v: V3, th: number): V3 => [v[0] * Math.cos(th) + v[2] * Math.sin(th), v[1], -v[0] * Math.sin(th) + v[2] * Math.cos(th)]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const hung = (p: V3) => p[2] < WALL_Z + 0.4
export const manifoldRot = (p: V3) => (hung(p) ? 0 : MAN_ROT)

/** Décalages locaux des composants du groupe (par rapport à G). */
const U = { svBP: [-0.6, 0.14, 0.33] as V3, svHP: [0.45, 0.08, 0.33] as V3, evr: [0.95, 0.6, -0.07] as V3, kp: [-0.67, 0.67, -0.24] as V3 }
const PORT_OFF: Record<PortId, { equip: Equip; off: V3 }> = {
  manLP: { equip: 'manifold', off: [-0.13, -0.3, 0.02] }, manREF: { equip: 'manifold', off: [0, -0.3, 0.02] }, manHP: { equip: 'manifold', off: [0.13, -0.3, 0.02] }, manVAC: { equip: 'manifold', off: [0.13, -0.3, -0.1] },
  svBP: { equip: 'groupe', off: add(U.svBP, [0, 0.1, 0.08]) }, svHP: { equip: 'groupe', off: add(U.svHP, [0, 0.1, 0.08]) },
  pumpIn: { equip: 'pump', off: [-0.2, 0.1, 0.18] }, vgPort: { equip: 'vg', off: [0, -0.05, 0.12] },
  recIn: { equip: 'rec', off: [-0.13, -0.03, 0.21] }, recOut: { equip: 'rec', off: [0.13, -0.03, 0.21] },
  refCylOut: { equip: 'refCyl', off: [0, 0.41, 0] }, recCylLiq: { equip: 'recCyl', off: [-0.1, 0.44, 0] }, recCylVap: { equip: 'recCyl', off: [0.1, 0.44, 0] },
  n2Out: { equip: 'n2', off: [0.16, 0.8, 0.12] },
}
const PORT_SHORT: Record<PortId, string> = { manLP: 'LOW', manHP: 'HIGH', manREF: 'REF', manVAC: 'VAC 3/8', svBP: 'voie BP', svHP: 'voie HP', pumpIn: 'POMPE', vgPort: 'VG', refCylOut: 'FLUIDE', recCylLiq: 'ROUGE liq.', recCylVap: 'BLEU vap.', recIn: 'IN', recOut: 'OUT', n2Out: 'N2' }
export const HOSE_LEN: Record<HoseId, number> = { blue: 4.0, red: 4.0, yellow: 4.0, black: 3.0, vg: 1.2 }
const HOSE_HOME: Record<HoseId, V3> = { blue: [-2.0, 0.93, 0.6], red: [-1.5, 0.93, 0.65], yellow: [-1.0, 0.93, 0.6], black: [-0.3, 0.93, 0.65], vg: [-0.6, 0.93, 0.45] }

export function equipPos(s: SimState, pos: Positions, e: Equip): V3 {
  if ((e === 'refCyl' || e === 'recCyl') && s.scale.item === e) return [pos.scale[0], pos.scale[1] + 0.02 + HALF_H[e], pos.scale[2]]
  if (e === 'svBP' || e === 'svHP' || e === 'evr' || e === 'kp') return add(G, U[e])
  return pos[e]
}
export const portPos = (s: SimState, pos: Positions, p: PortId): V3 => {
  const e = PORT_OFF[p].equip, base = equipPos(s, pos, e)
  return add(base, e === 'manifold' ? rotY(PORT_OFF[p].off, manifoldRot(base)) : PORT_OFF[p].off)
}
export function hoseReaches(s: SimState, pos: Positions, hose: HoseId, end: 'a' | 'b', port: PortId) {
  const other = s.hoses[hose][end === 'a' ? 'b' : 'a']
  if (!other) return true
  return dist(portPos(s, pos, port), portPos(s, pos, other)) <= HOSE_LEN[hose]
}

const PortalCtx = createContext<React.RefObject<HTMLDivElement | null> | null>(null)
const usePortal = () => useContext(PortalCtx) as React.RefObject<HTMLElement>
const Z = [5, 0] as [number, number]

// ---------- primitives ----------
function Box({ pos, size, color, rot, opacity }: { pos: V3; size: V3; color: string; rot?: V3; opacity?: number }) {
  return <mesh position={pos} rotation={rot} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} roughness={0.7} /></mesh>
}
function Cyl({ pos, r, h, color, rot, metal }: { pos: V3; r: number; h: number; color: string; rot?: V3; metal?: boolean }) {
  return <mesh position={pos} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[r, r, h, 28]} /><meshStandardMaterial color={color} metalness={metal ? 0.6 : 0.1} roughness={metal ? 0.35 : 0.6} /></mesh>
}
function Pipe({ pts, r = 0.013, color = '#b87333' }: { pts: V3[]; r?: number; color?: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05), 64, r, 10, false), [pts, r])
  return <mesh geometry={geo} castShadow><meshStandardMaterial color={color} metalness={0.5} roughness={0.4} /></mesh>
}
function Label({ pos, text, sub, show }: { pos: V3; text: string; sub?: string; show: boolean }) {
  const portal = usePortal()
  return <Html portal={portal} position={pos} center zIndexRange={Z} style={{ pointerEvents: 'none', opacity: show ? 1 : 0, transition: 'opacity .15s' }}><span className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-md">{text}{sub && <span className="ml-1 font-normal text-slate-500">{sub}</span>}</span></Html>
}
function Readout({ pos, text, tone, show, big }: { pos: V3; text: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; show: boolean; big?: boolean }) {
  const portal = usePortal()
  const cls = tone === 'good' ? 'bg-emerald-600 text-white' : tone === 'warn' ? 'bg-amber-500 text-white' : tone === 'bad' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
  return <Html portal={portal} position={pos} center zIndexRange={Z} style={{ pointerEvents: 'none', opacity: show ? 1 : 0, transition: 'opacity .15s' }}><span className={`floaty whitespace-nowrap rounded-full px-2 py-0.5 font-mono font-bold shadow-lg ${big ? 'text-sm' : 'text-[11px]'} ${cls}`}>{text}</span></Html>
}
/** Pont 3D → DOM : projection écran et ancres des fenêtres de commandes, mis à jour à chaque image par le contenu 3D. */
interface Bridge { proj: (v: V3) => [number, number]; size: { w: number; h: number }; equipAnchor: V3 | null; endAnchor: V3 | null; dragging: boolean }
/** Fenêtre de commandes rendue HORS du canvas, positionnée par rapport à son ancre 3D (pas de saut, toujours dans le cadre). */
function DomPopover({ bridge, which, title, onClose, children }: { bridge: React.RefObject<Bridge | null>; which: 'equipAnchor' | 'endAnchor'; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { // placement avant le premier affichage (pas de saut), puis suivi de l'ancre à chaque image
    let below: boolean | null = null
    const place = () => {
      const el = ref.current, b = bridge.current, a = b?.[which]; if (!el || !b || !a || b.dragging) { if (el) el.style.visibility = 'hidden'; return }
      const [x, y] = b.proj(a); if (below === null) below = y < b.size.h * 0.45
      const w = el.offsetWidth, h = el.offsetHeight, pad = 8
      el.style.left = `${Math.max(pad, Math.min(b.size.w - w - pad, x - w / 2))}px`; el.style.top = `${Math.max(pad, Math.min(b.size.h - h - pad, below ? y + 24 : y - h - 24))}px`; el.style.visibility = 'visible'
    }
    place(); let id = requestAnimationFrame(function loop() { place(); id = requestAnimationFrame(loop) })
    return () => cancelAnimationFrame(id)
  }, [bridge, which])
  return (
    <div ref={ref} className="pop card w-[22rem] max-w-[90vw] p-3 text-[13px]" style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'auto', zIndex: 30 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between gap-2"><b className="text-sm">{title}</b><button className="btn" onClick={onClose} aria-label="Fermer">✕</button></div>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">{children}</div>
    </div>
  )
}

// ---------- fluide visible ----------
function fluidLook(n: SimState['nodes'][keyof SimState['nodes']]) {
  const pr = pRef(n), pa = pAir(n)
  const isRef = n.refType && pr > pa
  return { color: isRef ? PROPS[n.refType!].color : '#f8fafc', liquid: !!isRef && liquid(n) > 0.0005 }
}
const N_BLOBS = 12
function FlowBlobs({ curveRef, flow, color, liquid: liq }: { curveRef: React.RefObject<THREE.Curve<THREE.Vector3> | null>; flow: number; color: string; liquid?: boolean }) {
  const inst = useRef<THREE.InstancedMesh>(null)
  const phase = useRef(Array.from({ length: N_BLOBS }, (_, i) => i / N_BLOBS))
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame((_, dt) => {
    const mesh = inst.current, curve = curveRef.current; if (!mesh || !curve) return
    const active = Math.abs(flow) >= 0.002
    const speed = Math.sign(flow) * Math.min(1.2, 0.25 + Math.abs(flow) * 0.6)
    const r = active ? (liq ? 0.036 : 0.026) * Math.min(1.4, 0.7 + Math.abs(flow)) : 0
    for (let i = 0; i < N_BLOBS; i++) { phase.current[i] = (((phase.current[i] + speed * dt) % 1) + 1) % 1; const q = curve.getPointAt(phase.current[i]); m.makeScale(r, r, r); m.setPosition(q); mesh.setMatrixAt(i, m) }
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={inst} args={[undefined, undefined, N_BLOBS]} frustumCulled={false}><sphereGeometry args={[1, 10, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={liq ? 0.9 : 0.6} transparent opacity={liq ? 0.95 : 0.8} /></instancedMesh>
}
const HOSE_N = 20
const nearBench = (x: number, z: number, m = 0.14) => x > BENCH.x0 - m && x < BENCH.x1 + m && z > BENCH.z0 - m && z < BENCH.z1 + m
/** Forme cible d'un flexible : chaînette plafonnée (le mou s'étale en boucle latérale), jamais à travers l'établi :
 *  deux extrémités sur l'établi → le flexible reste posé dessus ; un point au-dessus de l'emprise (marge) reste au niveau du plateau. */
function hoseTargets(a: V3, b: V3, len: number): THREE.Vector3[] {
  const d = Math.max(0.05, dist(a, b)), slack = Math.max(0, len - d)
  const onBenchA = nearBench(a[0], a[2]) && a[1] > BENCH.top - 0.05, onBenchB = nearBench(b[0], b[2]) && b[1] > BENCH.top - 0.05
  const both = onBenchA && onBenchB
  const sag = both ? 0.3 : Math.min(0.5, 0.04 + 0.3 * slack)
  const side = Math.min(0.8, 0.2 * slack) * (slack > d ? 1 : 0.35), nx = -(b[2] - a[2]) / d, nz = (b[0] - a[0]) / d
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= HOSE_N; i++) {
    const t = i / HOSE_N, bell = 4 * t * (1 - t)
    let x = a[0] + (b[0] - a[0]) * t + nx * side * bell, z = a[2] + (b[2] - a[2]) * t + nz * side * bell
    if (both && i > 0 && i < HOSE_N) { x = Math.max(BENCH.x0 + 0.05, Math.min(BENCH.x1 - 0.05, x)); z = Math.max(BENCH.z0 + 0.05, Math.min(BENCH.z1 - 0.05, z)) }
    let y = a[1] + (b[1] - a[1]) * t - sag * bell
    if (i > 0 && i < HOSE_N) { const floor = nearBench(x, z) && Math.max(a[1], b[1]) > BENCH.top - 0.05 ? BENCH.top + (both ? 0.025 : 0.3) : 0.025; y = Math.max(y, floor) }
    pts.push(new THREE.Vector3(x, y, z))
  }
  return pts
}
function Hose({ a, b, color, flow, len, fluid }: { a: V3; b: V3; color: string; flow: number; len: number; fluid: { color: string; liquid: boolean } }) {
  const targets = useMemo(() => hoseTargets(a, b, len), [a, b, len])
  const cur = useRef<THREE.Vector3[] | null>(null)
  const vel = useRef<THREE.Vector3[]>(Array.from({ length: HOSE_N + 1 }, () => new THREE.Vector3()))
  const mesh = useRef<THREE.Mesh>(null)
  const curveRef = useRef<THREE.Curve<THREE.Vector3> | null>(null)
  const taut = dist(a, b) > len * 0.97, active = Math.abs(flow) >= 0.002
  useFrame((_, dt) => {
    const h = Math.min(dt, 0.05)
    if (!cur.current) cur.current = targets.map((p) => p.clone())
    const c = cur.current, v = vel.current
    for (let i = 0; i <= HOSE_N; i++) {
      if (i === 0 || i === HOSE_N) { c[i].copy(targets[i]); v[i].set(0, 0, 0); continue }
      v[i].addScaledVector(targets[i].clone().sub(c[i]), 60 * h).multiplyScalar(Math.max(0, 1 - 7 * h)); c[i].addScaledVector(v[i], h)
      const floor = (nearBench(c[i].x, c[i].z) && Math.max(a[1], b[1]) > BENCH.top - 0.05 ? BENCH.top : 0) + 0.025; if (c[i].y < floor) { c[i].y = floor; v[i].y = Math.abs(v[i].y) * 0.2 }
    }
    const curve = new THREE.CatmullRomCurve3(c, false, 'catmullrom', 0.5); curveRef.current = curve
    if (mesh.current) { mesh.current.geometry.dispose(); mesh.current.geometry = new THREE.TubeGeometry(curve, 48, 0.018, 8, false) }
  })
  return <group><mesh ref={mesh} castShadow><tubeGeometry args={[new THREE.CatmullRomCurve3(targets), 48, 0.018, 8, false]} /><meshStandardMaterial color={taut ? '#f87171' : color} roughness={0.8} emissive={active ? fluid.color : '#000'} emissiveIntensity={active ? 0.25 : 0} /></mesh><FlowBlobs curveRef={curveRef} flow={flow} color={fluid.color} liquid={fluid.liquid} /></group>
}
function PipeFlow({ pts, rate, color, liquid: liq }: { pts: V3[]; rate: number; color: string; liquid?: boolean }) {
  const holder = useMemo(() => ({ current: new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05) as THREE.Curve<THREE.Vector3> | null }), [pts])
  return <FlowBlobs curveRef={holder} flow={rate} color={color} liquid={liq} />
}
function LiquidLevel({ pos, r, h, frac, color }: { pos: V3; r: number; h: number; frac: number; color: string }) {
  const target = Math.max(0.004, Math.min(1, frac)); const mesh = useRef<THREE.Mesh>(null); const cur = useRef(target)
  useFrame((st, dt) => { cur.current += (target - cur.current) * Math.min(1, dt * 3); const f = cur.current, m = mesh.current; if (!m) return; const wobble = Math.abs(target - cur.current) > 0.002 ? 1 + 0.03 * Math.sin(st.clock.elapsedTime * 12) : 1; m.scale.set(wobble, f, wobble); m.position.set(pos[0], pos[1] - h / 2 + (h * f) / 2, pos[2]); m.visible = f > 0.006 })
  return <mesh ref={mesh}><cylinderGeometry args={[r, r, h, 24]} /><meshStandardMaterial color={color} transparent opacity={0.85} emissive={color} emissiveIntensity={0.25} /></mesh>
}
/** Enseigne murale : texte dessiné sur une texture (style ardoise, accent jaune). Remplacer par le logo officiel si disponible. */
function Sign() {
  const [logo, setLogo] = useState<THREE.Texture | null>(null)
  useEffect(() => { const url = process.env.NEXT_PUBLIC_BRAND_LOGO; if (!url) return; let on = true; new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; if (on) setLogo(t) }); return () => { on = false } }, [])
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas'); c.width = 768; c.height = 224; const ctx = c.getContext('2d')!
    ctx.fillStyle = '#1f1f1f'; ctx.fillRect(0, 0, 768, 224); ctx.fillStyle = '#f5c400'; ctx.fillRect(0, 206, 768, 18)
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'italic 54px Georgia, "Times New Roman", serif'; ctx.fillText("l'atelier", 384, 78)
    ctx.font = 'bold 66px Georgia, "Times New Roman", serif'; ctx.fillText('des Chefs', 384, 148)
    ctx.fillStyle = '#f5c400'; ctx.font = '600 22px Inter, system-ui, sans-serif'; ctx.fillText('F O R M A T I O N   F R O I D', 384, 190)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }, [])
  return (
    <group position={[1.9, 2.25, -2.24]}>
      <Box pos={[0, 0, -0.01]} size={[1.54, 0.49, 0.03]} color="#111111" />
      <mesh position={[0, 0, 0.006]}><planeGeometry args={[1.5, 0.4375]} />{logo ? <meshBasicMaterial map={logo} toneMapped={false} transparent /> : tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshBasicMaterial color="#1f1f1f" />}</mesh>
    </group>
  )
}
/** Dessin de l'afficheur LCD du manifold sur un canvas (hors composant : mutation libre de la texture). */
function drawLcd(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, scale: string, lp: number, hp: number, tL: number, tH: number) {
  const c = canvas.getContext('2d')!; c.fillStyle = '#d9f99d'; c.fillRect(0, 0, 440, 220); c.fillStyle = '#1a2e05'; c.font = 'bold 20px ui-monospace, monospace'
  c.textAlign = 'left'; c.fillText(`LOW · ${scale}`, 18, 34); c.textAlign = 'right'; c.fillText('HIGH', 422, 34)
  c.font = 'bold 60px ui-monospace, monospace'; c.textAlign = 'left'; c.fillText(Number.isNaN(lp) ? 'Err' : lp.toFixed(2), 18, 104); c.textAlign = 'right'; c.fillText(Number.isNaN(hp) ? 'Err' : hp.toFixed(2), 422, 104)
  c.font = 'bold 20px ui-monospace, monospace'; c.textAlign = 'left'; c.fillText('bar · t. rosée', 18, 138); c.textAlign = 'right'; c.fillText('bar · t. bulle', 422, 138)
  c.font = 'bold 40px ui-monospace, monospace'; c.textAlign = 'left'; c.fillText(Number.isNaN(tL) ? '--' : `${tL.toFixed(1)} °C`, 18, 196); c.textAlign = 'right'; c.fillText(Number.isNaN(tH) ? '--' : `${tH.toFixed(1)} °C`, 422, 196)
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true
}
function Lcd({ scale, lp, hp }: { scale: Refrigerant; lp: number; hp: number }) {
  const canvas = useMemo(() => (typeof document === 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: 440, height: 220 })), [])
  const tex = useMemo(() => (canvas ? new THREE.CanvasTexture(canvas) : null), [canvas])
  const tL = Number.isNaN(lp) ? NaN : satT(scale, 'dew', lp + P_ATM), tH = Number.isNaN(hp) ? NaN : satT(scale, 'bubble', hp + P_ATM)
  useEffect(() => { if (canvas && tex) drawLcd(canvas, tex, scale, lp, hp, tL, tH) }, [canvas, tex, scale, lp, hp, tL, tH])
  if (!tex) return null
  return <mesh position={[0, 0.12, 0.049]}><planeGeometry args={[0.3, 0.15]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
}
/** Vanne de service 3 positions : volant, tige, presse-étoupe, bouchons. */
function ServiceValve({ pos, v, hovered }: { pos: V3; v: SimState['sv']['bp']; hovered: boolean }) {
  const angle = v.seat === 'back' ? 0 : v.seat === 'read' ? Math.PI / 2 : Math.PI
  return (
    <group position={pos}>
      <Box pos={[0, 0, 0]} size={[0.12, 0.1, 0.1]} color={hovered ? '#94a3b8' : '#64748b'} />
      <Cyl pos={[0, 0.1, 0.08]} r={0.03} h={0.04} color="#d97706" metal />
      <group rotation={[0, angle, 0]} position={[0, 0.08, 0]}><Cyl pos={[0, 0, 0]} r={0.02} h={0.06} color="#b45309" metal /><Box pos={[0, 0.035, 0]} size={[0.08, 0.02, 0.02]} color={v.seat === 'back' ? '#16a34a' : v.seat === 'read' ? '#2563eb' : '#dc2626'} /></group>
      <Cyl pos={[0, 0.05, 0]} r={0.035} h={0.012} color={v.gland === 'loose' ? '#fbbf24' : '#9ca3af'} metal />
      {v.stemCap && <Cyl pos={[0, 0.12, 0]} r={0.03} h={0.04} color="#111827" />}
      {v.portCap && <Cyl pos={[0, 0.1, 0.11]} r={0.024} h={0.02} color="#111827" rot={[Math.PI / 2, 0, 0]} />}
    </group>
  )
}

type Drag =
  | { kind: 'hose'; hose: HoseId; end: 'a' | 'b'; pos: V3; moved: boolean; start: [number, number]; plane: THREE.Plane; candidate: PortId | null }
  | { kind: 'equip'; equip: Equip; moved: boolean; start: [number, number]; notified?: boolean }

// ---------- contenu ----------
function Content(p: SceneProps & { setBridge: (b: Bridge) => void }) {
  const { state: s, positions: pos } = p
  const portal = usePortal()
  const { camera, size, raycaster, scene, events } = useThree()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [freePos, setFreePos] = useState<Partial<Record<string, V3>>>({})
  const forgetFree = (hose: HoseId, end: 'a' | 'b') => setFreePos((f) => { if (!f[hose + end]) return f; const n = { ...f }; delete n[hose + end]; return n })
  const live = useRef({ s, pos, drag, p, freePos }); useEffect(() => { live.current = { s, pos, drag, p, freePos } })
  const controls = useRef<{ enabled: boolean } | null>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { live.current.p.onSelectEquip(null); live.current.p.onSelectEnd(null) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])

  const toScreen = (v: V3) => { const w = new THREE.Vector3(...v).project(camera); return [((w.x + 1) / 2) * size.width, ((1 - w.y) / 2) * size.height] as [number, number] }
  const used = useMemo(() => { const m = new Map<PortId, EndRef>(); for (const h of Object.values(s.hoses)) { if (h.a) m.set(h.a, { hose: h.id, end: 'a' }); if (h.b) m.set(h.b, { hose: h.id, end: 'b' }) } return m }, [s.hoses])
  const endPos = (hose: HoseId, end: 'a' | 'b', st = s, ps = pos, dr = drag, fp = freePos): V3 => {
    const h = st.hoses[hose]
    if (dr?.kind === 'hose' && dr.hose === hose && dr.end === end) return dr.pos
    const port = h[end]; if (port) return portPos(st, ps, port)
    const f = fp[hose + end]; if (f) return f
    const other = h[end === 'a' ? 'b' : 'a']
    if (other) { const o = portPos(st, ps, other); const q: V3 = [o[0] + (end === 'a' ? -0.2 : 0.2), o[1] - 0.35, o[2] + 0.25]; q[1] = Math.max(q[1], surfaceY(q[0], q[2]) + 0.05); return q }
    return add(HOSE_HOME[hose], [end === 'a' ? -0.4 : 0.4, 0, 0])
  }
  const otherEnd = (st: SimState, ps: Positions, hose: HoseId, end: 'a' | 'b') => { const o = st.hoses[hose][end === 'a' ? 'b' : 'a']; return o ? portPos(st, ps, o) : null }

  useEffect(() => {
    if (!drag) return
    const el = document.getElementById('scene-canvas')!
    const MAGNET = 110, SNAP = 45
    const nearestFreePort = (x: number, y: number, self: EndRef, within = SNAP) => {
      const { s: st, pos: ps } = live.current; let best: PortId | null = null, bd = within
      for (const id of Object.keys(PORTS) as PortId[]) {
        const taken = Object.values(st.hoses).some((h) => (h.a === id && !(h.id === self.hose && self.end === 'a')) || (h.b === id && !(h.id === self.hose && self.end === 'b'))); if (taken) continue
        const [px, py] = toScreen(portPos(st, ps, id)); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = id }
      }
      return best ? { id: best, d: bd } : null
    }
    const pointerOnPlane = (e: PointerEvent, plane: THREE.Plane) => { const r = el.getBoundingClientRect(); const x = e.clientX - r.left, yy = e.clientY - r.top; raycaster.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(yy / r.height) * 2 + 1), camera); const h = new THREE.Vector3(); raycaster.ray.intersectPlane(plane, h); return { x, y: yy, p: [h.x, h.y, h.z] as V3 } }
    const surfaceHit = (e: PointerEvent, hangable: boolean) => {
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left, yy = e.clientY - r.top
      raycaster.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(yy / r.height) * 2 + 1), camera); const ray = raycaster.ray
      const cands: { t: number; p: V3; kind: 'bench' | 'floor' | 'wall' }[] = []
      const bh = new THREE.Vector3(); if (ray.intersectBox(BENCH_BOX, bh)) cands.push({ t: ray.origin.distanceTo(bh), kind: 'bench', p: [Math.max(BENCH.x0 + 0.15, Math.min(BENCH.x1 - 0.15, bh.x)), BENCH.top, Math.max(BENCH.z0 + 0.15, Math.min(BENCH.z1 - 0.15, bh.z))] })
      const tryPlane = (plane: THREE.Plane, kind: 'floor' | 'wall', ok: (p: V3) => boolean) => { const h = new THREE.Vector3(); if (ray.intersectPlane(plane, h)) { const q: V3 = [h.x, h.y, h.z]; if (ok(q)) cands.push({ t: ray.origin.distanceTo(h), p: q, kind }) } }
      if (hangable) tryPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -WALL_Z), 'wall', (q) => q[0] > -3.1 && q[0] < 3.1 && q[1] > 0.9 && q[1] < 2.4 && !(q[0] > UNIT_RECT.x0 && q[0] < UNIT_RECT.x1 && q[1] > UNIT_RECT.y0 && q[1] < UNIT_RECT.y1))
      tryPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), 'floor', (q) => q[0] > -3.0 && q[0] < 3.2 && q[2] > -1.6 && q[2] < 2.5 && !hiddenByBench(q[0], q[2]))
      cands.sort((u, v) => u.t - v.t); return { x, y: yy, hit: cands[0] ?? null }
    }
    const move = (e: PointerEvent) => {
      const { drag: d, s: st, pos: ps, p: pp } = live.current; if (!d) return
      if (d.kind === 'hose') {
        const { x, y, p: free } = pointerOnPlane(e, d.plane)
        const moved = d.moved || Math.hypot(x - d.start[0], y - d.start[1]) > 6
        const near = moved ? nearestFreePort(x, y, d, MAGNET) : null
        let q: V3 = free
        if (near) { const target = portPos(st, ps, near.id); const k = Math.min(1, Math.max(0, 1 - (near.d - SNAP * 0.6) / (MAGNET - SNAP * 0.6))); const w = k * k * (3 - 2 * k); q = [free[0] + (target[0] - free[0]) * w, free[1] + (target[1] - free[1]) * w, free[2] + (target[2] - free[2]) * w] }
        setDrag({ ...d, pos: q, moved, candidate: near && near.d < SNAP ? near.id : null }); return
      }
      const { x, y, hit } = surfaceHit(e, HANGABLE.has(d.equip))
      const moved = d.moved || Math.hypot(x - d.start[0], y - d.start[1]) > 6
      if (!moved || !hit) { setDrag({ ...d, moved }); return }
      const next: V3 = hit.kind === 'wall' ? [hit.p[0], hit.p[1], WALL_Z + 0.08] : [hit.p[0], hit.p[1] + HALF_H[d.equip] + 0.001, hit.p[2]]
      if (hit.kind === 'floor') { const m = RADIUS[d.equip] + 0.05; if (inBench(next[0], next[2]) || (next[0] > BENCH.x0 - m && next[0] < BENCH.x1 + m && next[2] > BENCH.z0 - m && next[2] < BENCH.z1 + m)) { const dz = next[2] > (BENCH.z0 + BENCH.z1) / 2 ? BENCH.z1 + m - next[2] : BENCH.z0 - m - next[2]; const dx = next[0] > 0 ? BENCH.x1 + m - next[0] : BENCH.x0 - m - next[0]; if (Math.abs(dz) < Math.abs(dx)) next[2] += dz; else next[0] += dx } }
      const overlap = (Object.keys(ps) as Equip[]).some((o) => { if (o === d.equip || !MOVABLE.has(o)) return false; if ((o === 'scale' && (d.equip === 'refCyl' || d.equip === 'recCyl')) || (d.equip === 'scale' && (o === 'refCyl' || o === 'recCyl') && st.scale.item === o)) return false; const q = equipPos(st, ps, o); return Math.abs(q[1] - HALF_H[o] - (next[1] - HALF_H[d.equip])) < 0.3 && Math.hypot(q[0] - next[0], q[2] - next[2]) < RADIUS[o] + RADIUS[d.equip] })
      if (overlap) return
      const nextPos = { ...ps, [d.equip]: next }
      const taut = Object.values(st.hoses).find((h) => (['a', 'b'] as const).some((end) => { const port = h[end]; if (!port || PORT_OFF[port].equip !== d.equip) return false; const o = otherEnd(st, nextPos, h.id, end); return !!o && dist(portPos(st, nextPos, port), o) > HOSE_LEN[h.id] }))
      if (taut) { if (!d.notified) { pp.onNotice(`${HOSES[taut.id].label} tendu (${HOSE_LEN[taut.id]} m) : déconnecter ou rapprocher.`); setDrag({ ...d, moved, notified: true }) } return }
      if ((d.equip === 'refCyl' || d.equip === 'recCyl') && st.scale.item === d.equip) pp.onDropCylinder(d.equip, false)
      setDrag({ ...d, moved }); pp.onMove(d.equip, next)
    }
    const up = (e: PointerEvent) => {
      const { drag: d, s: st, pos: ps, p: pp } = live.current; setDrag(null); if (!d) return
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top
      if (d.kind === 'equip') {
        if (!d.moved) { pp.onSelectEquip(pp.selectedEquip === d.equip ? null : d.equip); return }
        if (d.equip === 'refCyl' || d.equip === 'recCyl') { const c = ps[d.equip]; pp.onDropCylinder(d.equip, Math.hypot(c[0] - ps.scale[0], c[2] - ps.scale[2]) < 0.5 && Math.abs(c[1] - HALF_H[d.equip] - surfaceY(ps.scale[0], ps.scale[2])) < 0.1) }
        return
      }
      if (!d.moved) { pp.onSelectEnd(pp.selectedEnd?.hose === d.hose && pp.selectedEnd.end === d.end ? null : { hose: d.hose, end: d.end }); pp.onSelectEquip(null); return }
      const near = nearestFreePort(x, y, d); const was = st.hoses[d.hose][d.end]
      if (near) {
        const o = otherEnd(st, ps, d.hose, d.end)
        if (o && dist(portPos(st, ps, near.id), o) > HOSE_LEN[d.hose]) pp.onNotice(`${HOSES[d.hose].label} trop court (${HOSE_LEN[d.hose]} m) : rapprocher l'équipement.`)
        else { if (near.id !== was) pp.onConnect(d.hose, d.end, near.id); forgetFree(d.hose, d.end); return }
      }
      const o = otherEnd(st, ps, d.hose, d.end)
      const sh = surfaceHit(e, false).hit
      let drop: V3 = sh ? [sh.p[0], sh.p[1] + 0.05, sh.p[2]] : [d.pos[0], surfaceY(d.pos[0], d.pos[2]) + 0.05, d.pos[2]]
      if (!sh) { pp.onNotice('Impossible de poser le flexible ici (zone cachée) : il revient devant.'); drop = [Math.max(-2.8, Math.min(2.8, drop[0])), 0.05, Math.max(0.95, Math.min(2.2, drop[2]))] }
      if (o && dist(drop, o) > HOSE_LEN[d.hose]) { const k = HOSE_LEN[d.hose] / dist(drop, o); drop = [o[0] + (drop[0] - o[0]) * k, o[1] + (drop[1] - o[1]) * k, o[2] + (drop[2] - o[2]) * k]; drop[1] = Math.max(drop[1], surfaceY(drop[0], drop[2]) + 0.05) }
      setFreePos((f) => ({ ...f, [d.hose + d.end]: drop }))
      if (was) pp.onConnect(d.hose, d.end, null)
    }
    const cancel = () => setDrag(null)
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel) }
  }, [!!drag]) // eslint-disable-line react-hooks/exhaustive-deps

  const canvasXY = (e: ThreeEvent<PointerEvent>): [number, number] => { const r = document.getElementById('scene-canvas')!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const startHose = (hose: HoseId, end: 'a' | 'b') => (e: ThreeEvent<PointerEvent>) => {
    if (hose === 'vg' && end === 'a') return
    e.stopPropagation(); if (controls.current) controls.current.enabled = false
    const ep = endPos(hose, end); const normal = new THREE.Vector3(); camera.getWorldDirection(normal)
    setDrag({ kind: 'hose', hose, end, pos: ep, moved: false, start: canvasXY(e), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...ep)), candidate: null })
  }
  const startEquip = (equip: Equip) => (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (controls.current) controls.current.enabled = false; setDrag({ kind: 'equip', equip, moved: false, start: canvasXY(e) }) }
  const clickPort = (id: PortId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (p.selectedEnd && !used.has(id)) {
      const o = otherEnd(s, pos, p.selectedEnd.hose, p.selectedEnd.end)
      if (o && dist(portPos(s, pos, id), o) > HOSE_LEN[p.selectedEnd.hose]) { p.onNotice(`${HOSES[p.selectedEnd.hose].label} trop court : rapprocher l'équipement.`); return }
      p.onConnect(p.selectedEnd.hose, p.selectedEnd.end, id); forgetFree(p.selectedEnd.hose, p.selectedEnd.end); p.onSelectEnd(null)
    } else if (used.has(id)) { p.onSelectEnd(used.get(id)!); p.onSelectEquip(null) } else { p.onSelectEquip(PORT_OFF[id].equip === 'groupe' ? (id === 'svBP' ? 'svBP' : 'svHP') : PORT_OFF[id].equip) }
  }
  const hov = (k: string) => ({ onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(k) }, onPointerOut: () => setHover((h) => (h === k ? null : h)) })
  const vis = (k: string) => !drag && hover === k
  const equipProps = (e: Equip) => ({ name: 'equip:' + e, position: equipPos(s, pos, e), onPointerDown: startEquip(e), ...hov(e) })

  const running = compRunning(s)
  const fanRef = useRef<THREE.Group>(null)
  const zoomTarget = useRef(p.zoom); useEffect(() => { zoomTarget.current = p.zoom }, [p.zoom])
  /* eslint-disable -- objets three.js mutés dans la boucle de rendu */
  useFrame((_, dt) => { if (fanRef.current && running) fanRef.current.rotation.z += dt * 12; const c = camera as THREE.OrthographicCamera; if (Math.abs(c.zoom - zoomTarget.current) > 0.05) { c.zoom += (zoomTarget.current - c.zoom) * Math.min(1, dt * 8); c.updateProjectionMatrix() } })
  /* eslint-enable */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const hitTest = (x: number, y: number) => { raycaster.setFromCamera(new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1), camera); return raycaster.intersectObjects(scene.children, true).map((i) => { let o: THREE.Object3D | null = i.object; while (o && !o.name) o = o.parent; return o?.name ?? '?' }).slice(0, 4) }
    ;(window as unknown as Record<string, unknown>).__fs = { connected: events.connected, port: (id: PortId) => toScreen(portPos(s, pos, id)), end: (h: HoseId, e: 'a' | 'b') => toScreen(endPos(h, e)), equip: (e: Equip) => toScreen(equipPos(s, pos, e)), hoses: s.hoses, positions: pos, drag, hitTest, sv: s.sv, scale: s.scale }
  })
  const r = readings(s)
  const g = (o: V3) => add(G, o)
  const candidate = drag?.kind === 'hose' ? drag.candidate : null
  const popAnchor = (e: Equip): V3 => { const q = equipPos(s, pos, e); return [q[0], q[1] + (e === 'groupe' ? 0.95 : e === 'n2' ? 1.1 : e === 'refCyl' || e === 'recCyl' ? 0.6 : e === 'manifold' ? 0.4 : e === 'svBP' || e === 'svHP' ? 0.25 : 0.3), q[2]] }
  const syncBridge = () => { p.setBridge({ proj: toScreen, size: { w: size.width, h: size.height }, equipAnchor: p.selectedEquip ? popAnchor(p.selectedEquip) : null, endAnchor: p.selectedEnd && s.hoses[p.selectedEnd.hose][p.selectedEnd.end] ? add(endPos(p.selectedEnd.hose, p.selectedEnd.end), [0, 0.12, 0]) : null, dragging: !!drag }) }
  useEffect(syncBridge); useFrame(syncBridge)
  const vgTone = s.damaged.vg ? 'bad' : r.vgMbar <= (s.vacUnit === 'mbar' ? 25 : 0.667) ? 'good' : r.vgMbar < 100 ? 'warn' : 'neutral'
  const fluidColor = PROPS[s.refrigerant].color

  return (
    <group>
      {/* sol, murs, établi, enseigne */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[9, 7]} /><meshStandardMaterial color="#d6dde8" /></mesh>
      <Box pos={[0, 1.4, -2.3]} size={[9, 2.8, 0.1]} color="#f7f8fa" />
      <Box pos={[-3.3, 1.4, 0]} size={[0.1, 2.8, 5]} color="#e2e6ec" />
      <Box pos={[-3.3, 1.4, -2.3]} size={[0.14, 2.84, 0.14]} color="#cfd5de" />
      <Box pos={[0, 0.04, -2.24]} size={[9, 0.08, 0.03]} color="#2a2a2a" /><Box pos={[-3.24, 0.04, 0]} size={[0.03, 0.08, 5]} color="#2a2a2a" />
      <Box pos={[0, 2.79, -2.24]} size={[9, 0.025, 0.03]} color="#f5c400" /><Box pos={[-3.24, 2.79, 0]} size={[0.03, 0.025, 5]} color="#f5c400" />
      <Box pos={[0, 0.45, 0.3]} size={[4.4, 0.9, 1.0]} color="#ffffff" />
      <Box pos={[0, 0.91, 0.3]} size={[4.5, 0.04, 1.08]} color="#cbd5e1" />
      <Box pos={[0.6, 1.75, -2.23]} size={[3.6, 0.03, 0.03]} color="#94a3b8" />
      <Label show={vis('rail')} pos={[0.6, 1.85, -2.2]} text="Rail d'accrochage" sub="glisser le manifold ou le vacuomètre ici" />
      <mesh position={[0.6, 1.75, -2.23]} {...hov('rail')}><boxGeometry args={[3.6, 0.2, 0.08]} /><meshStandardMaterial transparent opacity={0} /></mesh>
      {/* enseigne murale, discrète : ardoise d'atelier (texture dessinée) */}
      <Sign />

      {/* ---- groupe de condensation mural ---- */}
      <group name="equip:groupe" {...hov('groupe')} onClick={(e) => { e.stopPropagation(); p.onSelectEquip(p.selectedEquip === 'groupe' ? null : 'groupe') }}>
        <Box pos={g([0, 0, 0])} size={[1.75, 0.05, 0.7]} color="#64748b" /><Box pos={g([0, 0.001, 0])} size={[1.6, 0.052, 0.55]} color="#94a3b8" />
        <group {...hov('cond')}><Box pos={g([0, 0.34, -0.32])} size={[0.95, 0.56, 0.07]} color="#334155" />{Array.from({ length: 9 }, (_, i) => <Box key={i} pos={g([-0.42 + i * 0.105, 0.34, -0.28])} size={[0.012, 0.5, 0.02]} color="#94a3b8" />)}</group>
        <group ref={fanRef} position={g([0, 0.34, -0.27])}><Cyl pos={[0, 0, 0]} r={0.2} h={0.012} color="#1e293b" rot={[Math.PI / 2, 0, 0]} />{[0, 1, 2, 3].map((i) => <Box key={i} pos={[Math.cos((i * Math.PI) / 2) * 0.1, Math.sin((i * Math.PI) / 2) * 0.1, 0.01]} size={[0.16, 0.05, 0.005]} color="#cbd5e1" rot={[0, 0, (i * Math.PI) / 2]} />)}</group>
        <group {...hov('comp')}><Cyl pos={g([-0.35, 0.2, 0.08])} r={0.16} h={0.34} color="#111827" /><Cyl pos={g([-0.35, 0.38, 0.08])} r={0.13} h={0.04} color="#1f2937" /></group>
        <group {...hov('receiver')}>
          <mesh position={g([0.45, 0.22, 0.08])} castShadow><cylinderGeometry args={[0.075, 0.075, 0.38, 28]} /><meshStandardMaterial color="#1f2937" transparent opacity={0.45} /></mesh>
          <LiquidLevel pos={g([0.45, 0.22, 0.08])} r={0.068} h={0.36} frac={liquid(s.nodes.circHi) / (PROPS[s.nodes.circHi.refType ?? s.refrigerant].rhoLiq * 1.6)} color={PROPS[s.nodes.circHi.refType ?? s.refrigerant].color} />
        </group>
        <group {...hov('drier')}><Cyl pos={g([0.6, 0.54, -0.07])} r={0.04} h={0.15} color={s.circuit.faulty && !s.circuit.replaced ? '#1d4ed8' : '#3b82f6'} rot={[0, 0, Math.PI / 2]} /></group>
        <group {...hov('sight')}><Cyl pos={g([0.8, 0.54, -0.07])} r={0.03} h={0.06} color={s.circuit.faulty && !s.circuit.replaced ? '#facc15' : '#4ade80'} rot={[0, 0, Math.PI / 2]} /></group>
        {/* électrovanne (cliquable) */}
        <group name="equip:evr" {...hov('evr')} onClick={(e) => { e.stopPropagation(); p.onSelectEquip(p.selectedEquip === 'evr' ? null : 'evr') }}>
          <Box pos={g(U.evr)} size={[0.07, 0.1, 0.07]} color={s.elec.coil ? '#1d4ed8' : '#64748b'} /><Cyl pos={g(add(U.evr, [0, -0.06, 0]))} r={0.025} h={0.08} color="#b45309" rot={[0, 0, Math.PI / 2]} metal />
          {s.elec.magnet && <Box pos={g(add(U.evr, [0, 0.07, 0]))} size={[0.05, 0.03, 0.05]} color="#dc2626" />}
          {!s.elec.coil && <Box pos={g(add(U.evr, [0.18, -0.55, 0.3]))} size={[0.07, 0.1, 0.07]} color="#1d4ed8" />}
        </group>
        <group {...hov('tev')}><Cyl pos={g([1.1, 0.8, -0.07])} r={0.03} h={0.1} color="#b45309" metal /><Cyl pos={g([1.1, 0.89, -0.07])} r={0.04} h={0.02} color="#b45309" metal /></group>
        {/* pressostats (cliquables) */}
        <group name="equip:kp" {...hov('kp')} onClick={(e) => { e.stopPropagation(); p.onSelectEquip(p.selectedEquip === 'kp' ? null : 'kp') }}>
          <Box pos={g([-0.75, 0.67, -0.24])} size={[0.1, 0.13, 0.08]} color="#f8fafc" /><Box pos={g([-0.6, 0.67, -0.24])} size={[0.1, 0.13, 0.08]} color="#f8fafc" />
          {s.elec.coverOn && <Box pos={g([-0.675, 0.67, -0.22])} size={[0.26, 0.15, 0.03]} color="#e2e8f0" opacity={0.85} />}
          <Box pos={g([-0.75, 0.67, -0.19])} size={[0.06, 0.05, 0.005]} color={s.switches.lp && !s.elec.forceLP ? '#ef4444' : '#22c55e'} /><Box pos={g([-0.6, 0.67, -0.19])} size={[0.06, 0.05, 0.005]} color={s.switches.hp ? '#ef4444' : '#22c55e'} />
        </group>
        {/* vannes de service 3 positions (cliquables) */}
        <group name="equip:svBP" {...hov('svBP')} onClick={(e) => { e.stopPropagation(); p.onSelectEquip(p.selectedEquip === 'svBP' ? null : 'svBP') }}><ServiceValve pos={g(U.svBP)} v={s.sv.bp} hovered={hover === 'svBP'} /></group>
        <group name="equip:svHP" {...hov('svHP')} onClick={(e) => { e.stopPropagation(); p.onSelectEquip(p.selectedEquip === 'svHP' ? null : 'svHP') }}><ServiceValve pos={g(U.svHP)} v={s.sv.hp} hovered={hover === 'svHP'} /></group>
        {/* armoire électrique / sectionneur */}
        <Box pos={g([-1.05, 0.45, -0.25])} size={[0.22, 0.3, 0.1]} color="#e2e8f0" /><Box pos={g([-1.05, 0.5, -0.19])} size={[0.05, 0.08, 0.01]} color={s.elec.power ? '#22c55e' : '#ef4444'} />
        {/* tuyauteries */}
        <Pipe pts={[g([-0.51, 0.32, 0.08]), g([-0.6, 0.32, 0.28]), g(add(U.svBP, [0, 0.05, 0]))]} />
        <Pipe pts={[g([-0.25, 0.38, 0.08]), g([-0.1, 0.42, 0.23]), g([-0.2, 0.36, -0.02]), g([0, 0.62, -0.22]), g([0.35, 0.57, -0.22]), g([0.45, 0.42, 0.08])]} />
        <Pipe pts={[g([0.45, 0.04, 0.08]), g(add(U.svHP, [0, 0.05, 0]))]} />
        <Pipe pts={[g(add(U.svHP, [0, 0.05, 0])), g([0.6, 0.3, 0.2]), g([0.45, 0.49, -0.07]), g([0.53, 0.54, -0.07])]} />
        <Pipe pts={[g([0.67, 0.54, -0.07]), g([0.77, 0.54, -0.07])]} /><Pipe pts={[g([0.83, 0.54, -0.07]), g([0.91, 0.54, -0.07])]} /><Pipe pts={[g([0.99, 0.54, -0.07]), g([1.1, 0.54, -0.07]), g([1.1, 0.75, -0.07])]} />
        <Pipe pts={[g([1.1, 0.9, -0.07]), g([1.1, 1.02, -0.07]), [1.4, 2.1, -1.95], [1.8, 2.1, -1.9], [1.8, 1.7, -1.9]]} />
        <Pipe pts={[[1.6, 1.3, -1.9], [1.6, 1.0, -1.9], g([-0.25, -0.08, -0.22]), g([-0.51, 0.12, -0.07]), g([-0.51, 0.32, 0.08])]} r={0.016} />
        <Pipe pts={[g([-0.75, 0.6, -0.24]), g([-0.75, 0.22, -0.22]), g([-0.55, 0.22, -0.07])]} r={0.006} /><Pipe pts={[g([-0.6, 0.6, -0.24]), g([-0.6, 0.42, -0.22]), g([-0.15, 0.42, -0.07])]} r={0.006} />
        {running && (<>
          <PipeFlow pts={[g([-0.25, 0.38, 0.08]), g([-0.1, 0.42, 0.23]), g([-0.2, 0.36, -0.02]), g([0, 0.62, -0.22]), g([0.35, 0.57, -0.22]), g([0.45, 0.42, 0.08])]} rate={1.2} color="#fb923c" />
          <PipeFlow pts={[g([0.45, 0.04, 0.08]), g(add(U.svHP, [0, 0.05, 0])), g([0.6, 0.3, 0.2]), g([0.45, 0.49, -0.07]), g([0.53, 0.54, -0.07]), g([0.67, 0.54, -0.07]), g([0.91, 0.54, -0.07]), g([1.1, 0.54, -0.07]), g([1.1, 0.75, -0.07])]} rate={evrOpen(s) && s.sv.hp.seat !== 'front' ? 1 : 0} color={fluidColor} liquid />
          <PipeFlow pts={[g([1.1, 0.9, -0.07]), g([1.1, 1.02, -0.07]), [1.4, 2.1, -1.95], [1.8, 2.1, -1.9], [1.8, 1.7, -1.9]]} rate={evrOpen(s) && s.sv.hp.seat !== 'front' ? 1 : 0} color="#bae6fd" />
          <PipeFlow pts={[[1.6, 1.3, -1.9], [1.6, 1.0, -1.9], g([-0.25, -0.08, -0.22]), g([-0.51, 0.12, -0.07]), g([-0.51, 0.32, 0.08])]} rate={s.sv.bp.seat !== 'front' ? 1 : 0} color="#bae6fd" />
        </>)}
        {/* raccords contrôlables */}
        {([[0.53, 0.54, -0.07], [0.67, 0.54, -0.07], [0.8, 0.6, -0.07], add(U.svHP, [0.05, 0.05, 0]), add(U.svBP, [0.08, 0.05, 0]), [-0.6, 0.6, -0.26], [-0.75, 0.6, -0.26], [0.95, 0.54, -0.07], [1.1, 0.74, -0.07], [1.6, 1.3, -1.9 - G[2]]] as V3[]).map((o, i) => {
          const q = i === 9 ? ([1.6, 1.3, -1.9] as V3) : g(o); const leak = s.inspections[i]?.result === 'bulles' || s.inspections[i]?.result === 'fuite'
          return <group key={i}><Cyl pos={q} r={0.022} h={0.026} color={leak ? '#ef4444' : s.inspections[i] ? '#22c55e' : '#d97706'} metal />{s.inspections[i]?.result === 'bulles' && [0, 1, 2].map((k) => <mesh key={k} position={add(q, [0.03 * k - 0.03, 0.05 + 0.02 * k, 0.03])}><sphereGeometry args={[0.012, 10, 10]} /><meshStandardMaterial color="white" transparent opacity={0.8} /></mesh>)}</group>
        })}
        <Label show={vis('comp')} pos={g([-0.35, 0.67, 0.08])} text="Compresseur hermétique" sub={running ? '● marche' : 'arrêt'} />
        <Label show={vis('receiver')} pos={g([0.45, 0.52, 0.28])} text="Réservoir de liquide" />
        <Label show={vis('drier')} pos={g([0.6, 0.72, -0.07])} text="Filtre déshydrateur" sub={s.circuit.faulty && !s.circuit.replaced ? 'fuyard' : ''} />
        <Label show={vis('sight')} pos={g([0.8, 0.72, -0.07])} text="Voyant de liquide" sub={s.circuit.faulty && !s.circuit.replaced ? 'jaune · humidité' : 'vert · sec'} />
        <Label show={vis('evr')} pos={g(add(U.evr, [0, 0.2, 0]))} text="Électrovanne" sub={evrOpen(s) ? 'ouverte' : 'fermée · cliquer'} />
        <Label show={vis('tev')} pos={g([1.1, 1.12, -0.07])} text="Détendeur thermostatique" />
        <Label show={vis('kp')} pos={g([-0.67, 0.9, -0.22])} text="Pressostats KP BP / HP" sub="cliquer" />
        <Label show={vis('cond')} pos={g([0, 0.74, -0.32])} text="Condenseur à air" />
        <Label show={vis('svBP')} pos={g(add(U.svBP, [0, 0.3, 0]))} text="Vanne de service BP" sub={`${s.sv.bp.seat === 'back' ? 'cale arrière' : s.sv.bp.seat === 'read' ? 'lecture' : 'cale avant'} · cliquer`} />
        <Label show={vis('svHP')} pos={g(add(U.svHP, [0, 0.3, 0]))} text="Vanne de service HP" sub={`${s.sv.hp.seat === 'back' ? 'cale arrière' : s.sv.hp.seat === 'read' ? 'lecture' : 'cale avant'} · cliquer`} />
        <Label show={vis('groupe')} pos={g([0, -0.12, 0.3])} text="Groupe de condensation" sub="cliquer : plaque, sectionneur, fuites" />
      </group>

      {/* ---- chambre froide ---- */}
      <group {...hov('evap')}>
        <Box pos={[1.7, 0.9, -1.55]} size={[1.5, 1.8, 0.05]} color="#e2e8f0" opacity={0.35} /><Box pos={[0.95, 0.9, -1.9]} size={[0.05, 1.8, 0.8]} color="#e2e8f0" opacity={0.35} /><Box pos={[1.7, 1.78, -1.9]} size={[1.5, 0.05, 0.8]} color="#e2e8f0" opacity={0.35} />
        <Box pos={[1.7, 1.5, -1.95]} size={[0.8, 0.3, 0.3]} color="#f8fafc" />{[1.45, 1.95].map((x) => <Cyl key={x} pos={[x, 1.5, -1.79]} r={0.1} h={0.02} color="#475569" rot={[Math.PI / 2, 0, 0]} />)}
        <Label show={vis('evap')} pos={[1.7, 1.25, -1.8]} text="Évaporateur" sub="chambre froide" />
      </group>

      {/* ---- manifold numérique ---- */}
      <group {...equipProps('manifold')}>
        <group rotation={[0, manifoldRot(equipPos(s, pos, 'manifold')), 0]}>
          <Box pos={[0, 0, 0]} size={[0.38, 0.46, 0.09]} color="#1f2937" /><Box pos={[-0.19, 0, 0]} size={[0.012, 0.44, 0.08]} color="#16a34a" /><Box pos={[0.19, 0, 0]} size={[0.012, 0.44, 0.08]} color="#16a34a" />
          <Box pos={[0, 0.12, 0.046]} size={[0.3, 0.15, 0.004]} color="#d9f99d" />
          {[-0.09, 0, 0.09].flatMap((x) => [-0.01, -0.06, -0.11].map((y) => <Cyl key={x + ':' + y} pos={[x, y, 0.047]} r={0.014} h={0.006} color={y === -0.11 ? '#facc15' : '#f59e0b'} rot={[Math.PI / 2, 0, 0]} />))}
          <Cyl pos={[-0.13, -0.18, 0.06]} r={0.038} h={0.05} color="#2563eb" rot={[Math.PI / 2, 0, 0]} /><Cyl pos={[0.13, -0.18, 0.06]} r={0.038} h={0.05} color="#dc2626" rot={[Math.PI / 2, 0, 0]} />
          <Cyl pos={[0, -0.18, 0.048]} r={0.03} h={0.01} color="#e2e8f0" rot={[Math.PI / 2, 0, 0]} /><Cyl pos={[0, -0.18, 0.052]} r={0.02} h={0.006} color={fluidLook(s.nodes.manMid).color} rot={[Math.PI / 2, 0, 0]} />
          <Box pos={[0, -0.235, 0]} size={[0.36, 0.03, 0.09]} color="#b45309" />{[-0.13, 0, 0.13].map((x) => <Cyl key={x} pos={[x, -0.27, 0.02]} r={0.018} h={0.06} color="#d97706" metal />)}<Cyl pos={[0.13, -0.27, -0.1]} r={0.022} h={0.06} color="#d97706" metal />
          <Box pos={[0, -0.26, -0.06]} size={[0.06, 0.06, 0.03]} color="#475569" /><Box pos={[0, -0.28, -0.1]} size={[0.06, 0.02, 0.12]} color="#475569" />
          <Lcd scale={s.manScale} lp={s.damaged.lp ? NaN : r.lp} hp={s.damaged.hp ? NaN : r.hp} />
        </group>
        <Readout pos={[0, 0.4, 0]} show={!drag} big tone={s.damaged.lp || s.damaged.hp || r.hp > s.circuit.maxTest ? 'bad' : r.hp > s.circuit.maxTest - 3 ? 'warn' : 'neutral'} text={`BP ${s.damaged.lp ? 'HS' : r.lp.toFixed(2)} · HP ${s.damaged.hp ? 'HS' : r.hp.toFixed(2)} bar`} />
        <Label show={vis('manifold')} pos={[0, 0.5, 0]} text="Manifold" sub="cliquer : vannes LOW / HIGH" />
      </group>
      {/* vacuomètre */}
      <group {...equipProps('vg')}>
        <Box pos={[0, 0, 0]} size={[0.12, 0.12, 0.08]} color="#1f2937" /><Box pos={[0, 0.02, 0.041]} size={[0.08, 0.04, 0.003]} color={s.damaged.vg ? '#ef4444' : '#bbf7d0'} />
        <Readout pos={[0, 0.22, 0]} show={!drag} big tone={vgTone} text={s.damaged.vg ? 'HS' : r.vgMbar > 1000 ? `${(r.vgMbar / 1000).toFixed(2)} bar abs` : s.vacUnit === 'mbar' ? `${r.vgMbar < 10 ? r.vgMbar.toFixed(2) : r.vgMbar.toFixed(1)} mbar` : `${Math.round(r.vgMicron)} µ`} />
        <Label show={vis('vg')} pos={[0, 0.36, 0]} text="Vacuomètre" sub="cliquer : unité, cible" />
      </group>
      {/* pompe à vide */}
      <group {...equipProps('pump')}>
        <Box pos={[0, 0, 0]} size={[0.34, 0.2, 0.2]} color="#1e293b" /><Cyl pos={[0.08, 0, 0]} r={0.09} h={0.24} color="#eab308" rot={[0, 0, Math.PI / 2]} /><Box pos={[-0.2, 0.06, 0.12]} size={[0.05, 0.1, 0.05]} color="#9ca3af" />
        <Box pos={[0.17, 0.02, 0.11]} size={[0.03, 0.08, 0.004]} color="#bfdbfe" /><Box pos={[0.17, 0.01, 0.112]} size={[0.03, 0.045, 0.003]} color="#f59e0b" />
        <PipeFlow pts={[[0.1, 0.1, 0], [0.12, 0.3, 0.02], [0.1, 0.5, 0.04]]} rate={s.pumpOn ? Math.min(1, 0.2 + pressure(s.nodes.pump) * 0.6) : 0} color="#f8fafc" />
        <Readout pos={[0, 0.3, 0]} show={!drag && s.pumpOn} tone="good" text="● pompe en marche" />
        <Label show={vis('pump')} pos={[0, 0.2, 0]} text="Pompe à vide" sub={s.pumpOn ? '● marche' : 'arrêt · cliquer'} />
      </group>
      {/* récupérateur */}
      <group {...equipProps('rec')}>
        <Box pos={[0, 0, 0]} size={[0.34, 0.26, 0.28]} color="#1f2937" /><Box pos={[0, 0.07, 0.145]} size={[0.26, 0.08, 0.005]} color="#fde68a" /><Cyl pos={[0, -0.06, 0.15]} r={0.03} h={0.02} color={s.rec.mode === 'recover' ? '#22c55e' : '#f97316'} rot={[Math.PI / 2, 0, 0]} />
        <Cyl pos={[-0.13, -0.08, 0.15]} r={0.02} h={0.02} color={s.rec.in === 'closed' ? '#ef4444' : s.rec.in === 'liquid' ? '#3b82f6' : '#22c55e'} rot={[Math.PI / 2, 0, 0]} />
        <Readout pos={[0, 0.34, 0]} show={!drag && s.rec.power} tone={s.rec.tripped ? 'bad' : s.rec.done ? 'good' : 'neutral'} text={s.rec.tripped ? 'SÉCURITÉ HP' : s.rec.done ? 'terminé · 0 bar' : `IN ${r.recIn.toFixed(1)} bar · ${s.rec.in.toUpperCase()}`} />
        <Label show={vis('rec')} pos={[0, 0.23, 0]} text="Groupe de récupération" sub="cliquer : IN / OUT / mode" />
      </group>
      {/* balance */}
      <group {...equipProps('scale')}>
        <Box pos={[0, 0, 0]} size={[0.5, 0.04, 0.5]} color="#94a3b8" /><Box pos={[0, 0.01, 0.28]} size={[0.2, 0.05, 0.06]} color="#1f2937" />
        <Readout pos={[0, 0.16, 0.34]} show={!drag && !!s.scale.item} big tone="neutral" text={`${r.scaleNet >= 0 ? '+' : ''}${r.scaleNet.toFixed(3)} kg`} />
        <Label show={vis('scale')} pos={[0, 0.1, 0.3]} text="Balance" sub={s.scale.item ? 'cliquer : tare' : 'glisser une bouteille ici'} />
      </group>
      {/* bouteille de fluide */}
      <group {...equipProps('refCyl')}>
        <group rotation={[s.refCyl.inverted ? Math.PI : 0, 0, 0]}>
          <mesh castShadow><cylinderGeometry args={[0.14, 0.14, 0.66, 28]} /><meshStandardMaterial color={PROPS[s.refCyl.type].cylinder} transparent opacity={0.55} /></mesh>
          <LiquidLevel pos={[0, 0, 0]} r={0.13} h={0.64} frac={liquid(s.nodes.refCyl) / (PROPS[s.refCyl.type].rhoLiq * 12.3)} color={PROPS[s.refCyl.type].color} />
          <Cyl pos={[0, 0.36, 0]} r={0.06} h={0.08} color="#94a3b8" metal /><Box pos={[0, 0.05, 0.141]} size={[0.16, 0.2, 0.003]} color="white" />
        </group>
        <Readout pos={[0, 0.55, 0]} show={!drag} tone={s.refCyl.type === s.refrigerant ? 'neutral' : 'warn'} text={`${s.refCyl.type} · ${s.refCyl.inverted ? 'liquide' : 'vapeur'}`} />
        <Label show={vis('refCyl')} pos={[0, 0.68, 0]} text="Bouteille de fluide" sub="cliquer : fluide, position, robinet" />
      </group>
      {/* bouteille de transfert */}
      <group {...equipProps('recCyl')}>
        <mesh position={[0, -0.07, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.6, 28]} /><meshStandardMaterial color="#9ca3af" transparent opacity={0.55} /></mesh>
        <LiquidLevel pos={[0, -0.07, 0]} r={0.14} h={0.58} frac={liquid(s.nodes.recCyl) / (PROPS[s.nodes.recCyl.refType ?? s.refrigerant].rhoLiq * 12.3)} color={PROPS[s.nodes.recCyl.refType ?? s.refrigerant].color} />
        <Cyl pos={[0, 0.3, 0]} r={0.15} h={0.14} color="#facc15" /><Cyl pos={[-0.1, 0.42, 0]} r={0.03} h={0.06} color="#dc2626" metal /><Cyl pos={[0.1, 0.42, 0]} r={0.03} h={0.06} color="#2563eb" metal />
        <Readout pos={[0, 0.62, 0]} show={!drag} tone={r.recFill > 1 ? 'bad' : r.recFill > 0.8 ? 'warn' : 'neutral'} text={`${s.nodes.recCyl.ref.toFixed(2)} / ${r.recMax.toFixed(1)} kg`} />
        <Label show={vis('recCyl')} pos={[0, 0.7, 0]} text="Bouteille de transfert" sub="rouge = liquide · bleu = vapeur" />
      </group>
      {/* azote */}
      <group {...equipProps('n2')}>
        <Cyl pos={[0, 0, 0]} r={0.11} h={1.4} color="#1f2937" /><Cyl pos={[0, 0.75, 0]} r={0.04} h={0.1} color="#9ca3af" metal /><Box pos={[0.08, 0.8, 0.05]} size={[0.14, 0.08, 0.08]} color="#9ca3af" />
        <Cyl pos={[0.02, 0.88, 0.05]} r={0.035} h={0.02} color="white" /><Cyl pos={[0.13, 0.88, 0.05]} r={0.035} h={0.02} color="white" /><Box pos={[0, 0.05, 0.112]} size={[0.14, 0.25, 0.003]} color="#f1f5f9" />
        <Readout pos={[0, 1.0, 0]} show={!drag} tone={s.n2Type === 'U' ? 'neutral' : 'warn'} text={`N2 ${s.n2Type === 'U' ? 'sec U' : 'industriel'} · sortie ${Math.max(0, r.n2Out).toFixed(1)} bar`} />
        <Label show={vis('n2')} pos={[0, 1.14, 0]} text="Azote + détendeur" sub="cliquer : consigne, robinets" />
      </group>

      {/* ---- raccords ---- */}
      {(Object.keys(PORTS) as PortId[]).map((id) => {
        const q = portPos(s, pos, id); const free = !used.has(id)
        const hl = (p.highlight && !!p.selectedEnd && free) || candidate === id
        const show = !drag && (hl || hover === 'port:' + id)
        const isolated = portNode(s, id) === null
        return (
          <group key={id} position={q}>
            <mesh name={'port:' + id} onClick={clickPort(id)} onPointerDown={(e) => e.stopPropagation()} {...hov('port:' + id)}><cylinderGeometry args={[0.035, 0.035, 0.06, 16]} /><meshStandardMaterial color={candidate === id ? '#fbbf24' : hl ? '#60a5fa' : isolated ? '#78716c' : '#b45309'} emissive={candidate === id ? '#f59e0b' : hl ? '#3b82f6' : '#000'} emissiveIntensity={hl ? 0.9 : 0} metalness={0.6} roughness={0.3} /></mesh>
            <Html portal={portal} position={[0, 0.06, 0]} center zIndexRange={Z} style={{ pointerEvents: 'none', opacity: show ? 1 : 0, transition: 'opacity .15s' }}><span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold shadow ${hl ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'}`}>{hover === 'port:' + id ? PORTS[id].label : PORT_SHORT[id]}</span></Html>
          </group>
        )
      })}

      {/* ---- flexibles ---- */}
      {(Object.keys(HOSES) as HoseId[]).map((id) => {
        const a = endPos(id, 'a'), b = endPos(id, 'b'); const color = id === 'vg' ? '#64748b' : HOSES[id].color
        return (
          <group key={id}>
            <Hose a={a} b={b} color={color} flow={s.flows[id] ?? 0} len={HOSE_LEN[id]} fluid={fluidLook(s.nodes[HOSES[id].node])} />
            {(['a', 'b'] as const).map((end) => {
              if (id === 'vg' && end === 'a') return null
              const q = end === 'a' ? a : b; const selected = p.selectedEnd?.hose === id && p.selectedEnd.end === end; const open = s.hoseValve[id][end]
              return (
                <group key={end} position={q}>
                  <mesh name={'hose:' + id + ':' + end} onPointerDown={startHose(id, end)} {...hov('hose:' + id + end)}><cylinderGeometry args={[0.048, 0.048, 0.1, 16]} /><meshStandardMaterial color={selected ? '#fbbf24' : color} emissive={selected ? '#f59e0b' : '#000'} emissiveIntensity={selected ? 0.9 : 0} /></mesh>
                  {id !== 'vg' && <Box pos={[0.06, 0.02, 0]} size={[0.05, 0.015, 0.015]} color={open ? '#22c55e' : '#ef4444'} rot={[0, 0, open ? 0 : Math.PI / 2]} />}
                  <Html portal={portal} position={[0, -0.09, 0]} center zIndexRange={Z} style={{ pointerEvents: 'none', opacity: !drag && !selected && hover === 'hose:' + id + end ? 1 : 0, transition: 'opacity .15s' }}><span className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white shadow" style={{ background: color }}>{HOSES[id].label.replace('Flexible ', '').replace('Raccord ', '')}{s.hoses[id][end] ? '' : ' · libre'}{id !== 'vg' ? ` · robinet ${open ? 'ouvert' : 'fermé'}` : ''}</span></Html>
                </group>
              )
            })}
          </group>
        )
      })}

      <OrbitControls ref={controls as never} enableRotate={false} enabled={!drag} enablePan enableZoom enableDamping dampingFactor={0.12} zoomSpeed={0.6} panSpeed={1.2} minZoom={60} maxZoom={320} onChange={() => { zoomTarget.current = (camera as THREE.OrthographicCamera).zoom }} target={[-0.2, 1.0, -0.5]} mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }} touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }} />
    </group>
  )
}

export default function Scene(props: SceneProps) {
  const portal = useRef<HTMLDivElement>(null)
  const bridge = useRef<Bridge | null>(null)
  const setBridge = (b: Bridge) => { bridge.current = b }
  const pop = props.selectedEquip ? props.renderPopover(props.selectedEquip) : null
  const endSel = props.selectedEnd && props.state.hoses[props.selectedEnd.hose][props.selectedEnd.end] ? props.selectedEnd : null
  return (
    <div className="relative h-full w-full">
      <Canvas id="scene-canvas" shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 2]} onPointerMissed={() => { props.onSelectEnd(null); props.onSelectEquip(null) }} style={{ touchAction: 'none' }}>
        <color attach="background" args={['#dbe6f5']} />
        <OrthographicCamera makeDefault position={[6, 6, 6]} zoom={140} near={0.1} far={50} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 8, 3]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
        <PortalCtx.Provider value={portal}><Content {...props} setBridge={setBridge} /></PortalCtx.Provider>
      </Canvas>
      <div ref={portal} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      {pop && props.selectedEquip && <DomPopover key={props.selectedEquip} bridge={bridge} which="equipAnchor" title={pop.title} onClose={() => props.onSelectEquip(null)}>{pop.body}</DomPopover>}
      {endSel && <DomPopover key={endSel.hose + endSel.end} bridge={bridge} which="endAnchor" title={`${HOSES[endSel.hose].label} · extrémité ${endSel.end === 'a' ? '1' : '2'}`} onClose={() => props.onSelectEnd(null)}>{props.renderEndPopover(endSel)}</DomPopover>}
    </div>
  )
}
