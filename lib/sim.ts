import { PROPS, REFRIGERANTS, Refrigerant, satP, satPWater } from './refrigerants'
import { Profile, PROFILES, ProfileId } from './profiles'
export { satT, satP, PROPS } from './refrigerants'

// ---------- Constantes physiques (modèle simplifié, isotherme sauf circuit) ----------
export const R = 0.08314 // bar·L/(mol·K)
export const P_ATM = 1.013
export const T_AMB = 20
const K = (t: number) => t + 273.15
export const MICRON_PER_MBAR = 750.06

const C_HOSE = 1.0 // L/s : conductance flexible ↔ raccord
const C_MAN = 1.0 // L/s : vanne manifold grande ouverte
const C_VENT = 0.3 // L/s : raccord ouvert à l'air
const C_TXV = 0.02 // L/s : égalisation BP/HP via détendeur
const C_LINE = 2.0 // L/s : ligne d'aspiration (vanne de service en position lecture)
const C_LIQ = 0.003 // kg/(bar·s) : débit liquide raccord grand ouvert
const C_LIQ_TXV = 0.0005
const S_PUMP = 0.1 // L/s : vitesse effective pompe à vide
const P_ULT = 0.00002 // bar abs (≈15 microns)
const C_PUMP_OFF = 0.001 // L/s : retour d'air pompe arrêtée non isolée
const S_COMP = 0.3 // L/s : déplacement compresseur
const S_REC = 0.15 // L/s : groupe de récupération (vapeur)
const C_REG = 2 // L/s : détendeur azote
const H2O_RATE = 0.0001 // mol/s : dégazage humidité
export const P_REC_DONE = 0.6 // bar abs : arrêt auto récupération (≈ -0,4 bar rel.)
const P_REC_TRIP = 39 // bar abs : pressostat HP du groupe de récupération
export const LIMITS = { lp: 36, hp: 56, vg: 11 } // bar abs : destruction mano BP / HP / vacuomètre

export type NodeId = 'circLo' | 'suct' | 'circHi' | 'manLo' | 'manHi' | 'manMid' | 'pump' | 'refCyl' | 'recCyl' | 'recIn' | 'recOut' | 'n2reg' | 'vg' | 'hBlue' | 'hRed' | 'hYellow' | 'hBlack' | 'hVg' | 'atm'
export type HoseId = 'blue' | 'red' | 'yellow' | 'black' | 'vg'
export type PortId = 'manLP' | 'manHP' | 'manREF' | 'manVAC' | 'svBP' | 'svHP' | 'pumpIn' | 'refCylOut' | 'recCylLiq' | 'recCylVap' | 'recIn' | 'recOut' | 'n2Out' | 'vgPort'
export type ValveId = 'manLo' | 'manHi' | 'pumpValve' | 'refCylValve' | 'recCylLiqValve' | 'recCylVapValve' | 'recOutValve' | 'n2Valve' | 'n2CylValve'
export type Mode = 'sandbox' | 'guided' | 'assessment'
export type ExerciseId = 'manifold' | 'recup' | 'azote' | 'vide' | 'charge' | 'examen'
export type Seat = 'back' | 'read' | 'front'
export interface ServiceValve { seat: Seat; gland: 'tight' | 'loose'; stemCap: boolean; portCap: boolean }

export interface Node { id: NodeId; V: number; T: number; air: number; h2o: number; ref: number; refType: Refrigerant | null; contaminated: boolean; transit: boolean }
export interface Hose { id: HoseId; a: PortId | null; b: PortId | null }
export interface Ev { t: number; wall: number; kind: 'action' | 'fault' | 'info' | 'step' | 'xfer'; code?: FaultCode; msg: string }

export const HOSES: Record<HoseId, { node: NodeId; label: string; color: string; fixedA?: boolean }> = {
  blue: { node: 'hBlue', label: 'Flexible BP (bleu)', color: '#2563eb' },
  red: { node: 'hRed', label: 'Flexible HP (rouge)', color: '#dc2626' },
  yellow: { node: 'hYellow', label: 'Flexible de charge (jaune)', color: '#eab308' },
  black: { node: 'hBlack', label: 'Flexible vide 3/8 (noir)', color: '#1f2937' },
  vg: { node: 'hVg', label: 'Raccord vacuomètre', color: '#6b7280', fixedA: true },
}

/** Raccords. `node` peut dépendre de l'état (voie de service isolée en cale arrière). */
export const PORTS: Record<PortId, { valve?: ValveId; liquid?: boolean; label: string; group: string }> = {
  manLP: { label: 'Manifold · port BP (LOW)', group: 'Manifold' },
  manHP: { label: 'Manifold · port HP (HIGH)', group: 'Manifold' },
  manREF: { label: 'Manifold · port central (charge / service)', group: 'Manifold' },
  manVAC: { label: 'Manifold · port vide 3/8', group: 'Manifold' },
  svBP: { label: 'Vanne de service BP (aspiration) · voie manomètre', group: 'Groupe froid' },
  svHP: { label: 'Vanne de service HP (réservoir) · voie manomètre', group: 'Groupe froid', liquid: true },
  pumpIn: { valve: 'pumpValve', label: 'Pompe à vide · aspiration', group: 'Pompe à vide' },
  refCylOut: { valve: 'refCylValve', label: 'Bouteille de fluide · robinet', group: 'Bouteille fluide' },
  recCylLiq: { valve: 'recCylLiqValve', liquid: true, label: 'Bouteille de transfert · robinet ROUGE (liquide)', group: 'Bouteille de transfert' },
  recCylVap: { valve: 'recCylVapValve', label: 'Bouteille de transfert · robinet BLEU (vapeur)', group: 'Bouteille de transfert' },
  recIn: { label: 'Groupe de récupération · ENTRÉE (IN)', group: 'Récupérateur' },
  recOut: { valve: 'recOutValve', label: 'Groupe de récupération · SORTIE (OUT)', group: 'Récupérateur' },
  n2Out: { valve: 'n2Valve', label: 'Détendeur azote · sortie', group: 'Azote' },
  vgPort: { label: 'Vacuomètre · raccord', group: 'Vacuomètre' },
}
const STATIC_NODE: Partial<Record<PortId, NodeId>> = { manLP: 'manLo', manHP: 'manHi', manREF: 'manMid', manVAC: 'manMid', pumpIn: 'pump', refCylOut: 'refCyl', recCylLiq: 'recCyl', recCylVap: 'recCyl', recIn: 'recIn', recOut: 'recOut', n2Out: 'n2reg', vgPort: 'vg' }
/** Nœud derrière un raccord ; null si la voie est isolée (vanne de service en cale arrière). */
export function portNode(s: SimState, p: PortId): NodeId | null {
  if (p === 'svBP') return s.sv.bp.seat === 'back' ? null : 'suct'
  if (p === 'svHP') return s.sv.hp.seat === 'back' ? null : 'circHi'
  return STATIC_NODE[p]!
}

export const VALVES: Record<ValveId, string> = {
  manLo: 'Vanne manifold BP', manHi: 'Vanne manifold HP', pumpValve: "Vanne d'isolement pompe", refCylValve: 'Robinet bouteille de fluide',
  recCylLiqValve: 'Robinet ROUGE (liquide) bouteille de transfert', recCylVapValve: 'Robinet BLEU (vapeur) bouteille de transfert', recOutValve: 'Vanne OUT récupérateur',
  n2Valve: 'Robinet de sortie détendeur', n2CylValve: 'Robinet bouteille azote',
}
export const SEAT_LABEL: Record<Seat, string> = { back: 'cale arrière', read: 'cale de lecture', front: 'cale avant' }

/** Raccords contrôlables (recherche de fuite). `hi` : côté HP du circuit. `drier` : brasures du déshydrateur remplacé. */
export const JOINTS: { label: string; hi: boolean; drier?: boolean; coldRoom?: boolean }[] = [
  { label: 'Brasure entrée déshydrateur', hi: true, drier: true }, { label: 'Brasure sortie déshydrateur', hi: true, drier: true },
  { label: 'Raccord flare voyant de liquide', hi: true }, { label: 'Raccord vanne de service HP (réservoir)', hi: true },
  { label: 'Raccord vanne de service BP (aspiration)', hi: false }, { label: 'Raccord pressostat HP', hi: true }, { label: 'Raccord pressostat BP', hi: false },
  { label: 'Raccord flare électrovanne', hi: true }, { label: 'Raccord détendeur (chambre froide)', hi: true, coldRoom: true }, { label: 'Raccord sortie évaporateur (chambre froide)', hi: false, coldRoom: true },
]

export type FaultCode = 'openEnd' | 'ppe' | 'release' | 'overpressure' | 'gauge' | 'contamination' | 'wrongRef' | 'vapourBlend' | 'slug' | 'compVacuum' | 'pumpRef' | 'pumpOff' | 'hoseOpen' | 'recOverfill' | 'recAir' | 'recTrip' | 'recOverload' | 'noScale' | 'replaceUnderPressure' | 'doc' | 'target'
  | 'capUnderPressure' | 'glandTight' | 'hoseAir' | 'manifoldLeftOpen' | 'lpSwitchOver' | 'wetN2' | 'residueVented' | 'soapOrder' | 'untidy' | 'liquidToSuction'

export interface SimState {
  t: number; wall: number; speed: number; paused: boolean
  mode: Mode; exerciseId: ExerciseId | null; refrigerant: Refrigerant; profileId: ProfileId
  nodes: Record<NodeId, Node>; hoses: Record<HoseId, Hose>; valves: Record<ValveId, number>
  hoseValve: Record<HoseId, { a: boolean; b: boolean }> // robinets obturateurs d'extrémité
  sv: { bp: ServiceValve; hp: ServiceValve }
  flows: Partial<Record<HoseId, number>>
  manScale: Refrigerant; ppe: { gloves: boolean; glasses: boolean }
  pumpOn: boolean
  elec: { power: boolean; regMode: 'pumpdown' | 'thermostat'; forceLP: boolean; coil: boolean; magnet: boolean; coverOn: boolean }
  switches: { lp: boolean; hp: boolean }
  rec: { power: boolean; mode: 'recover' | 'purge'; in: 'closed' | 'liquid' | 'open'; tripped: boolean; done: boolean }
  n2Set: number; n2Type: 'U' | 'industriel'
  refCyl: { type: Refrigerant; inverted: boolean; tare: number; initial: number }
  recCyl: { tare: number; wc: number; initial: number }
  scale: { item: 'refCyl' | 'recCyl' | null; tare: number }
  vacUnit: 'mbar' | 'micron'
  circuit: { leakJoint: number | null; leakC: number; moisture: number; maxTest: number; lpSwitchMax: number; nominal: number; faulty: boolean; replaced: boolean }
  inspections: Record<number, { t: number; result: 'bulles' | 'aucune' | 'fuite' | 'rien' }>; inspectOrder: number[]
  detector: { on: boolean; sensitivity: 'max' | 'normal'; ref: string }
  damaged: { lp: boolean; hp: boolean; vg: boolean }
  events: Ev[]; cooldown: Partial<Record<string, number>>
  stepsDone: boolean[]
  vacHold: { start: number; p0: number } | null
  n2Hold: { start: number; p0: number } | null
  finished: boolean; startedWall: number
  cerfa: Record<string, string> | null
  history: { t: number; BP: number; HP: number; vide: number }[]
  xferMark: { charged: number; recovered: number }
  acc: { release: number; pumpRef: number }
}

export const profile = (s: SimState): Profile => PROFILES[s.profileId]

// ---------- Helpers thermo ----------
export function pAir(n: Node) { return (n.air * R * K(n.T)) / n.V }
export function pH2o(n: Node) { return Math.min((n.h2o * R * K(n.T)) / n.V, satPWater(n.T)) }
export function vapCap(n: Node) { if (!n.refType) return 0; return (satP(n.refType, 'bubble', n.T) * PROPS[n.refType].M) / (R * K(n.T)) / 1000 * n.V }
export function pRef(n: Node) {
  if (!n.refType || n.ref <= 0) return 0
  if (n.ref >= vapCap(n)) return satP(n.refType, 'bubble', n.T)
  return ((n.ref * 1000) / PROPS[n.refType].M) * R * K(n.T) / n.V
}
export function pressure(n: Node) { return pAir(n) + pH2o(n) + pRef(n) }
export function liquid(n: Node) { return Math.max(0, n.ref - vapCap(n)) }
export const gauge = (pAbs: number) => pAbs - P_ATM

function mkNode(id: NodeId, V: number, transit = false, air = true): Node {
  return { id, V, T: T_AMB, air: air ? (P_ATM * V) / (R * K(T_AMB)) : 0, h2o: 0, ref: 0, refType: null, contaminated: false, transit }
}
const sv = (): ServiceValve => ({ seat: 'back', gland: 'tight', stemCap: true, portCap: true })

export function initialState(mode: Mode = 'sandbox', profileId: ProfileId = 'lycee', refrigerant?: Refrigerant): SimState {
  const pr = PROFILES[profileId]
  const fluid = refrigerant ?? pr.refrigerant
  const nodes = {} as Record<NodeId, Node>
  const defs: [NodeId, number, boolean?][] = [
    ['circLo', 3], ['suct', 0.3, true], ['circHi', 3], ['manLo', 0.02, true], ['manHi', 0.02, true], ['manMid', 0.03, true], ['pump', 0.1],
    ['refCyl', 12.3], ['recCyl', 12.3], ['recIn', 0.3, true], ['recOut', 0.2, true], ['n2reg', 0.05], ['vg', 0.01],
    ['hBlue', 0.03, true], ['hRed', 0.03, true], ['hYellow', 0.03, true], ['hBlack', 0.05, true], ['hVg', 0.01, true], ['atm', 1e12],
  ]
  for (const [id, V, tr] of defs) nodes[id] = mkNode(id, V, tr)
  nodes.refCyl.air = 0; nodes.refCyl.ref = 8; nodes.refCyl.refType = fluid
  for (const id of ['circLo', 'suct', 'circHi'] as const) { nodes[id].air = 0; nodes[id].refType = fluid }
  nodes.circLo.ref = pr.nominal * 0.3; nodes.suct.ref = 0.01; nodes.circHi.ref = pr.nominal * 0.7 - 0.01
  return {
    t: 0, wall: 0, speed: 1, paused: false, mode, exerciseId: null, refrigerant: fluid, profileId, nodes,
    hoses: { blue: { id: 'blue', a: null, b: null }, red: { id: 'red', a: null, b: null }, yellow: { id: 'yellow', a: null, b: null }, black: { id: 'black', a: null, b: null }, vg: { id: 'vg', a: 'vgPort', b: null } },
    valves: { manLo: 0, manHi: 0, pumpValve: 1, refCylValve: 0, recCylLiqValve: 0, recCylVapValve: 0, recOutValve: 0, n2Valve: 0, n2CylValve: 0 },
    hoseValve: { blue: { a: true, b: true }, red: { a: true, b: true }, yellow: { a: true, b: true }, black: { a: true, b: true }, vg: { a: true, b: true } },
    sv: { bp: sv(), hp: sv() },
    flows: {}, manScale: fluid, ppe: { gloves: false, glasses: false }, pumpOn: false,
    elec: { power: false, regMode: 'pumpdown', forceLP: false, coil: true, magnet: false, coverOn: true }, switches: { lp: false, hp: false },
    rec: { power: false, mode: 'recover', in: 'closed', tripped: false, done: false }, n2Set: 0, n2Type: 'U',
    refCyl: { type: fluid, inverted: false, tare: 12, initial: 8 }, recCyl: { tare: pr.recTare, wc: 12.3, initial: 0 },
    scale: { item: null, tare: 0 }, vacUnit: pr.vacuum.unit,
    circuit: { leakJoint: null, leakC: 0.0002, moisture: 0, maxTest: pr.n2.maxTest, lpSwitchMax: pr.n2.maxLP, nominal: pr.nominal, faulty: false, replaced: false },
    inspections: {}, inspectOrder: [], detector: { on: false, sensitivity: 'normal', ref: '' }, damaged: { lp: false, hp: false, vg: false }, events: [], cooldown: {}, stepsDone: [], vacHold: null, n2Hold: null,
    finished: false, startedWall: 0, cerfa: null, history: [], xferMark: { charged: 0, recovered: 0 }, acc: { release: 0, pumpRef: 0 },
  }
}

// ---------- Lecture instruments ----------
export function readings(s: SimState) {
  const n = s.nodes
  const lp = s.damaged.lp ? NaN : gauge(pressure(n.manLo))
  const hp = s.damaged.hp ? NaN : gauge(pressure(n.manHi))
  const vgAbs = s.damaged.vg ? NaN : pressure(n.vg)
  const scaleItem = s.scale.item
  const gross = scaleItem === 'refCyl' ? s.refCyl.tare + n.refCyl.ref : scaleItem === 'recCyl' ? s.recCyl.tare + n.recCyl.ref : 0
  const recType = n.recCyl.refType ?? s.refrigerant
  return {
    lp, hp, vgMbar: vgAbs * 1000, vgMicron: vgAbs * 1000 * MICRON_PER_MBAR,
    scaleGross: gross, scaleNet: gross - s.scale.tare,
    n2Out: gauge(pressure(n.n2reg)), n2Cyl: 100,
    circLo: pressure(n.circLo), circHi: pressure(n.circHi), suct: pressure(n.suct),
    recIn: gauge(pressure(n.recIn)), recOut: gauge(pressure(n.recOut)), residue: n.recIn.ref + n.recOut.ref,
    charged: s.refCyl.initial - n.refCyl.ref, recovered: n.recCyl.ref - s.recCyl.initial, released: n.atm.ref,
    recMax: Math.min(profile(s).recMax[recType] ?? 10, 0.8 * s.recCyl.wc * PROPS[recType].rhoLiq), recFill: n.recCyl.ref / Math.min(profile(s).recMax[recType] ?? 10, 0.8 * s.recCyl.wc * PROPS[recType].rhoLiq),
  }
}

// ---------- Graphe des connexions ----------
interface Edge { a: NodeId; b: NodeId; C: number; liqA?: boolean; liqB?: boolean; hose?: HoseId; dir?: 1 | -1; vent?: boolean }
export function portOpen(s: SimState, p: PortId) { if (p === 'recIn') return s.rec.in === 'closed' ? 0 : s.rec.in === 'liquid' ? 0.35 : 1; const v = PORTS[p].valve; return v ? s.valves[v] : 1 }
function portLiquid(s: SimState, p: PortId) { return p === 'refCylOut' ? s.refCyl.inverted : !!PORTS[p].liquid }
export const evrOpen = (s: SimState) => s.elec.magnet || (s.elec.power && s.elec.coil)
export const compRunning = (s: SimState) => s.elec.power && !s.switches.hp && (!s.switches.lp || s.elec.forceLP)
export const hpCutout = (r: Refrigerant) => Math.round(gauge(satP(r, 'bubble', 62)))

export function edges(s: SimState): Edge[] {
  const E: Edge[] = []
  const used = new Set<PortId>()
  for (const h of Object.values(s.hoses)) {
    const hn = HOSES[h.id].node
    for (const [end, p] of [['a', h.a], ['b', h.b]] as const) {
      const shut = !s.hoseValve[h.id][end]
      if (p) {
        used.add(p)
        const node = portNode(s, p); const o = portOpen(s, p)
        if (node && o > 0 && !shut) E.push({ a: node, b: hn, C: C_HOSE * o, liqA: portLiquid(s, p), liqB: true, hose: h.id, dir: end === 'a' ? 1 : -1 })
      } else if (!(h.id === 'vg' && end === 'a') && !shut) E.push({ a: hn, b: 'atm', C: C_VENT, liqA: true, hose: h.id, dir: end === 'a' ? -1 : 1, vent: true })
    }
  }
  for (const p of Object.keys(PORTS) as PortId[]) {
    if (used.has(p)) continue
    const node = portNode(s, p)
    if (!node) continue
    if (PORTS[p].valve && s.valves[PORTS[p].valve!] > 0) E.push({ a: node, b: 'atm', C: C_VENT * s.valves[PORTS[p].valve!], liqA: portLiquid(s, p) })
    if ((p === 'svBP' && !s.sv.bp.portCap) || (p === 'svHP' && !s.sv.hp.portCap)) E.push({ a: node, b: 'atm', C: C_VENT, liqA: portLiquid(s, p) })
  }
  if (s.valves.manLo > 0) E.push({ a: 'manLo', b: 'manMid', C: C_MAN * s.valves.manLo, liqA: true, liqB: true })
  if (s.valves.manHi > 0) E.push({ a: 'manHi', b: 'manMid', C: C_MAN * s.valves.manHi, liqA: true, liqB: true })
  // circuit : ligne liquide (détendeur) fermée par l'électrovanne ou la cale avant de la vanne HP ; ligne d'aspiration fermée par la cale avant de la vanne BP
  if (evrOpen(s) && s.sv.hp.seat !== 'front') E.push({ a: 'circHi', b: 'circLo', C: C_TXV, liqA: true })
  if (s.sv.bp.seat !== 'front') E.push({ a: 'circLo', b: 'suct', C: C_LINE, liqA: true })
  if (!s.pumpOn) E.push({ a: 'pump', b: 'atm', C: C_PUMP_OFF })
  if (s.circuit.leakJoint !== null) E.push({ a: JOINTS[s.circuit.leakJoint].hi ? 'circHi' : 'circLo', b: 'atm', C: s.circuit.leakC })
  for (const k of ['bp', 'hp'] as const) if (s.sv[k].gland === 'loose' && s.sv[k].seat !== 'back') E.push({ a: k === 'bp' ? 'suct' : 'circHi', b: 'atm', C: 0.0003 }) // presse-étoupe desserré : léger suintement
  return E
}

export function reachable(s: SimState, from: NodeId): Set<NodeId> {
  const adj = new Map<NodeId, NodeId[]>()
  for (const e of edges(s)) { if (e.b === 'atm' || e.a === 'atm') continue; adj.set(e.a, [...(adj.get(e.a) ?? []), e.b]); adj.set(e.b, [...(adj.get(e.b) ?? []), e.a]) }
  const seen = new Set<NodeId>([from]); const q = [from]
  while (q.length) { const n = q.pop()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); q.push(m) } }
  return seen
}

// ---------- Transferts ----------
function transferRef(s: SimState, a: Node, b: Node, m: number) {
  if (m <= 0) return
  m = Math.min(m, a.ref); a.ref -= m
  if (b.ref > 1e-6 && b.refType && a.refType && b.refType !== a.refType) b.contaminated = true
  if (!b.refType || b.ref <= 1e-6) b.refType = a.refType
  b.ref += m
  if (a.ref <= 1e-9) a.ref = 0
}
function moveGas(s: SimState, a: Node, b: Node, q: number) {
  const pa = pressure(a); if (pa <= 0 || q <= 0) return
  const nTot = q / (R * K(a.T))
  const dAir = Math.min(a.air, nTot * (pAir(a) / pa)); a.air -= dAir; b.air += dAir
  const dH2o = Math.min(a.h2o, nTot * (pH2o(a) / pa)); a.h2o -= dH2o; b.h2o += dH2o
  if (a.refType) transferRef(s, a, b, (nTot * (pRef(a) / pa) * PROPS[a.refType].M) / 1000)
}
function flow(s: SimState, e: Edge, dt: number): number {
  const A = s.nodes[e.a], B = s.nodes[e.b]
  const dp = pressure(A) - pressure(B)
  if (Math.abs(dp) < 1e-9) return 0
  const src = dp > 0 ? A : B, dst = dp > 0 ? B : A
  const Veff = (A.V * B.V) / (A.V + B.V)
  const q = Math.min(e.C * Math.abs(dp) * dt, Math.abs(dp) * Veff) // égalisation exacte par paire : stable
  moveGas(s, src, dst, q)
  const liqOk = dp > 0 ? e.liqA : e.liqB
  if (liqOk && liquid(src) > 0) {
    const txv = e.a === 'circHi' && e.b === 'circLo'
    const cliq = txv ? C_LIQ_TXV : C_LIQ * Math.min(1, e.C / C_HOSE)
    const full = dst.refType ? PROPS[dst.refType].rhoLiq * dst.V * 0.95 : Infinity
    transferRef(s, src, dst, Math.min(cliq * Math.abs(dp) * dt, liquid(src), Math.max(0, full - dst.ref)))
  }
  return dp > 0 ? q / dt : -q / dt
}

// ---------- Catalogue des fautes (cause, à vérifier, bon geste) ----------
export interface Fault { label: string; cat: 'release' | 'ppe' | 'pressure' | 'connection' | 'procedure' | 'doc'; penalty: number; cause: string; check: string; fix: string; video?: string }
export const FAULTS: Record<FaultCode, Fault> = {
  openEnd: { label: 'Extrémité de flexible ouverte à l\'air', cat: 'connection', penalty: 1, cause: 'Un flexible raccordé d\'un seul côté, robinet obturateur ouvert, laisse entrer l\'air (ou sortir le fluide).', check: 'Robinets obturateurs des flexibles non raccordés.', fix: 'Fermer le robinet obturateur de toute extrémité libre, ou raccorder les deux extrémités.', video: '09:20' },
  ppe: { label: 'Équipement de protection manquant', cat: 'ppe', penalty: 3, cause: 'Mise en route d\'un équipement sans gants ni lunettes (côté HP brûlant, côté BP glacé).', check: 'Gants et lunettes avant toute action.', fix: 'Mettre les gants et les lunettes, puis recommencer l\'action.', video: '08:40' },
  release: { label: 'Rejet de fluide à l\'atmosphère', cat: 'release', penalty: 2, cause: 'Du fluide frigorigène est sorti : raccord ouvert, flexible débranché sous pression, bouchon retiré sous pression ou pompe à vide sur un circuit chargé.', check: 'Vannes de service en cale arrière et robinets obturateurs fermés avant toute déconnexion.', fix: 'Isoler (cale arrière, robinets fermés), tirer les flexibles au vide ou les vider vers l\'aspiration, puis déconnecter.', video: '15:24' },
  overpressure: { label: 'Pression > limite admissible', cat: 'pressure', penalty: 3, cause: 'Pression d\'essai supérieure à la limite du composant le plus faible (pressostat BP, cadran BP, PS plaque).', check: 'Consigne du détendeur et manomètres pendant la montée.', fix: 'Régler le détendeur sous la limite (≈ 10 bar sur ce groupe) et monter par paliers en lisant les manos.', video: '36:30' },
  gauge: { label: 'Instrument détruit par surpression', cat: 'pressure', penalty: 2, cause: 'Le manomètre ou le vacuomètre a reçu une pression hors de sa plage.', check: 'Vacuomètre déconnecté et vanne BP isolée avant la mise en pression.', fix: 'Déconnecter le vacuomètre et fermer la vanne BP du manifold avant toute montée en pression.', video: '36:30' },
  contamination: { label: 'Air / azote mélangé au fluide', cat: 'procedure', penalty: 2, cause: 'Du fluide a été introduit dans un circuit non tiré au vide, ou de l\'azote dans un circuit chargé.', check: 'Vide atteint avant la charge ; circuit récupéré avant l\'azote.', fix: 'Récupérer, tester à l\'azote, tirer au vide, puis seulement charger.', video: '41:32' },
  wrongRef: { label: 'Fluide frigorigène incorrect', cat: 'procedure', penalty: 3, cause: 'La bouteille raccordée ne correspond pas à la plaque signalétique.', check: 'Désignation du fluide sur la plaque et sur la bouteille.', fix: 'Lire la plaque signalétique et choisir la bouteille du même fluide.', video: '46:40' },
  vapourBlend: { label: 'Mélange chargé en phase vapeur', cat: 'procedure', penalty: 2, cause: 'Un mélange zéotrope chargé en vapeur fractionne : la composition change.', check: 'Phase de charge (bouteille retournée / robinet liquide).', fix: 'Charger en liquide : migration naturelle côté HP, puis complément laminé.', video: '46:40' },
  slug: { label: 'Coup de liquide au compresseur', cat: 'procedure', penalty: 2, cause: 'Du liquide arrive à l\'aspiration compresseur en marche.', check: 'Voyant du manifold : seul du gaz doit passer.', fix: 'Laminer avec la vanne BP du manifold (≈ 25 %) et surveiller le voyant.', video: '49:30' },
  compVacuum: { label: 'Compresseur démarré sans charge', cat: 'procedure', penalty: 1, cause: 'Mise sous tension avec une BP sous le seuil du pressostat KP1.', check: 'Pression BP avant la mise sous tension.', fix: 'Charger d\'abord (migration naturelle), puis mettre sous tension.', video: '49:00' },
  pumpRef: { label: 'Tirage au vide d\'un circuit contenant du fluide', cat: 'procedure', penalty: 2, cause: 'La pompe à vide rejette le fluide à l\'atmosphère.', check: 'Pression du circuit avant de démarrer la pompe.', fix: 'Récupérer jusqu\'à 0 bar avant tout tirage au vide.', video: '18:40' },
  pumpOff: { label: 'Pompe arrêtée sans isolement', cat: 'procedure', penalty: 1, cause: 'L\'air remonte par la pompe arrêtée vers le circuit : le vide est perdu.', check: 'Robinet obturateur du flexible de pompe fermé avant l\'arrêt.', fix: 'Fermer le robinet obturateur (ou la vanne d\'isolement) PUIS arrêter la pompe.', video: '12:50' },
  hoseOpen: { label: 'Flexible débranché sous pression', cat: 'connection', penalty: 1, cause: 'Le flexible contenait du fluide sous pression, robinet obturateur ouvert.', check: 'Robinet obturateur fermé avant de dévisser.', fix: 'Fermer le robinet obturateur de l\'extrémité, puis déconnecter.', video: '17:40' },
  recOverfill: { label: 'Bouteille de transfert au-delà du remplissage maximal', cat: 'procedure', penalty: 3, cause: 'La masse dépasse le maximum gravé pour ce fluide : risque d\'éclatement hydraulique.', check: 'Tare et masse max gravées, lecture de la balance.', fix: 'Noter tare + max gravés avant de commencer et surveiller la balance.', video: '24:00' },
  recAir: { label: 'Récupération dans une bouteille non tirée au vide', cat: 'procedure', penalty: 2, cause: 'La bouteille contenait de l\'air : fluide récupéré contaminé.', check: 'Vide de la bouteille de transfert avant usage.', fix: 'Tirer au vide la bouteille (robinet bleu) avant de récupérer.', video: '20:00' },
  recTrip: { label: 'Déclenchement sécurité HP du récupérateur', cat: 'procedure', penalty: 1, cause: 'Refoulement fermé (vanne OUT ou robinet bouteille) pendant la récupération.', check: 'OUT sur OPEN et robinet rouge ouvert avant la mise en marche.', fix: 'Ouvrir le robinet rouge de la bouteille et la vanne OUT, réarmer, redémarrer.', video: '28:20' },
  recOverload: { label: 'Récupérateur alimenté en liquide avec IN sur OPEN', cat: 'procedure', penalty: 1, cause: 'Trop de liquide arrive au groupe : surcharge du compresseur du récupérateur.', check: 'Position de la vanne IN tant que du liquide arrive.', fix: 'Commencer IN sur LIQUID, passer sur OPEN quand il ne vient plus que de la vapeur.', video: '28:00' },
  noScale: { label: 'Transfert sans bouteille sur la balance', cat: 'procedure', penalty: 1, cause: 'Impossible de contrôler la masse transférée.', check: 'Bouteille posée et balance tarée avant d\'ouvrir.', fix: 'Poser la bouteille, tarer, noter la masse de départ, puis ouvrir.', video: '24:30' },
  replaceUnderPressure: { label: 'Ouverture du circuit sous pression', cat: 'release', penalty: 4, cause: 'Le composant a été déposé avant la récupération complète.', check: 'Manomètres à 0 bar avant d\'ouvrir le circuit.', fix: 'Récupérer jusqu\'à 0 bar (purge comprise) avant de dessouder.', video: '33:00' },
  target: { label: 'Objectif non atteint', cat: 'procedure', penalty: 6, cause: 'Les critères de réussite ne sont pas remplis.', check: 'Étapes et seuils de l\'exercice.', fix: 'Reprendre la séquence depuis l\'étape manquante.' },
  doc: { label: 'Erreur de fiche', cat: 'doc', penalty: 1, cause: 'Une valeur saisie ne correspond pas aux relevés.', check: 'Masses et résultats réellement mesurés.', fix: 'Reporter les valeurs lues sur la balance et les manomètres.', video: '59:00' },
  capUnderPressure: { label: 'Bouchon de voie retiré hors cale arrière', cat: 'release', penalty: 3, cause: 'La voie manomètre n\'était pas isolée : le fluide s\'échappe dès que le bouchon est dévissé.', check: 'Position de la vanne de service avant de toucher au bouchon.', fix: 'Vérifier la cale arrière (butée anti-horaire) AVANT de retirer le bouchon de voie.', video: '09:40' },
  glandTight: { label: 'Tige manœuvrée presse-étoupe serré', cat: 'procedure', penalty: 1, cause: 'Le presse-étoupe bloque et abîme la tige si l\'on force.', check: 'Presse-étoupe desserré (clé plate de 11) avant de tourner.', fix: 'Desserrer le presse-étoupe, tourner la tige, puis le resserrer.', video: '06:30' },
  hoseAir: { label: 'Air des flexibles poussé dans le circuit', cat: 'procedure', penalty: 2, cause: 'Les flexibles n\'ont pas été tirés au vide avant d\'ouvrir les vannes de service : incondensables dans le circuit.', check: 'Manomètres à −1 bar (flexibles sous vide) avant la cale de lecture.', fix: 'Raccorder la pompe au port central, tirer les flexibles à −1 bar, fermer le robinet obturateur, puis ouvrir les vannes.', video: '11:30' },
  manifoldLeftOpen: { label: 'Vannes du manifold laissées ouvertes', cat: 'procedure', penalty: 2, cause: 'HP et BP communiquent par le manifold : le liquide HP file vers l\'aspiration du compresseur.', check: 'Vannes HP et BP du manifold fermées avant d\'ouvrir les vannes de service.', fix: 'Après le tirage au vide des flexibles, fermer HP et BP du manifold, puis ouvrir BP puis HP de service.', video: '13:20' },
  lpSwitchOver: { label: 'Pressostat BP au-delà de sa pression maximale', cat: 'pressure', penalty: 3, cause: 'La pression d\'essai dépasse la pression maximale de service du pressostat BP (17 bar).', check: 'Plaque du pressostat et manomètre BP pendant la montée.', fix: 'Limiter l\'essai côté BP à la pression max du pressostat ; régler le détendeur en conséquence.', video: '37:30' },
  wetN2: { label: 'Azote non sec utilisé', cat: 'procedure', penalty: 2, cause: 'L\'azote industriel apporte de l\'humidité dans un circuit au déshydrateur neuf.', check: 'Marquage de la bouteille : azote sec (type U).', fix: 'Utiliser une bouteille d\'azote sec type U.', video: '36:00' },
  residueVented: { label: 'Résidu du récupérateur rejeté', cat: 'release', penalty: 3, cause: 'Le fluide restant dans le groupe de récupération a été envoyé à l\'atmosphère.', check: 'Le résidu se réinjecte dans le circuit en fin d\'intervention.', fix: 'Raccorder le groupe au port central, vanne HP en cale arrière, et aspirer le résidu avec le compresseur.', video: '51:20' },
  soapOrder: { label: 'Recherche de fuite incomplète ou désordonnée', cat: 'procedure', penalty: 1, cause: 'Le composant remplacé doit être contrôlé en premier, puis tous les raccords méthodiquement, chambre froide comprise.', check: 'Ordre et exhaustivité du contrôle.', fix: 'Commencer par les brasures du déshydrateur, puis suivre le circuit raccord par raccord.', video: '38:30' },
  untidy: { label: 'Poste non remis en état', cat: 'procedure', penalty: 1, cause: 'Bouchons, presse-étoupe, flexibles, alimentation ou capot du pressostat non remis en place.', check: 'Liste « état du poste » en fin d\'intervention.', fix: 'Bouchons de tige et de voie remis, presse-étoupes serrés, flexibles rangés, courant coupé, capot remis.', video: '54:30' },
  liquidToSuction: { label: 'Liquide HP envoyé à l\'aspiration', cat: 'procedure', penalty: 2, cause: 'Les deux vannes du manifold ouvertes avec les deux voies de service en lecture : le liquide HP traverse le manifold vers le compresseur.', check: 'Une seule vanne du manifold ouverte à la fois en fonctionnement.', fix: 'Fermer la vanne HP du manifold avant d\'ouvrir la BP (et inversement).', video: '13:20' },
}

function fault(s: SimState, code: FaultCode, detail = '', cooldownS = 30) {
  const last = s.cooldown[code]
  if (last !== undefined && s.t - last < cooldownS) return false
  s.cooldown[code] = s.t
  s.events.push({ t: s.t, wall: s.wall, kind: 'fault', code, msg: FAULTS[code].label + (detail ? ' — ' + detail : '') })
  return true
}
export function log(s: SimState, msg: string, kind: Ev['kind'] = 'action') { s.events.push({ t: s.t, wall: s.wall, kind, msg }) }

// ---------- Pas de simulation ----------
export function step(s: SimState, dt: number) {
  const n = s.nodes
  const releasedBefore = n.atm.ref
  const run = compRunning(s)
  for (const [id, target, tau] of [['circLo', run ? T_AMB - 30 : T_AMB, run ? 40 : 120], ['suct', run ? T_AMB - 25 : T_AMB, run ? 40 : 120], ['circHi', run ? T_AMB + 25 : T_AMB, run ? 40 : 120]] as const) n[id].T += ((target - n[id].T) * dt) / tau
  // Détendeur azote : source régulée (bouteille ≈ 100 bar)
  if (s.valves.n2CylValve > 0) {
    const p = pressure(n.n2reg), set = Math.min(s.n2Set, 100) + P_ATM
    if (p < set) { n.n2reg.air += Math.min(C_REG * (set - p) * dt, (set - p) * n.n2reg.V) / (R * K(n.n2reg.T)); if (s.n2Type === 'industriel') n.n2reg.h2o += 0.00002 * dt }
  }
  const flows: Partial<Record<HoseId, number>> = {}
  for (const e of edges(s)) {
    const f = flow(s, e, dt)
    if (e.hose) flows[e.hose] = (flows[e.hose] ?? 0) + f * (e.dir ?? 1)
    if (e.vent && Math.abs(f) > 0.01 && (s.hoses[e.hose!].a || s.hoses[e.hose!].b)) fault(s, 'openEnd', HOSES[e.hose!].label, 60)
  }
  s.flows = flows
  // Pompe à vide
  if (s.pumpOn) {
    const p = pressure(n.pump)
    if (p > P_ULT) { const q = Math.min(S_PUMP * (p - P_ULT) * dt, 0.5 * (p - P_ULT) * n.pump.V); const before = n.atm.ref; moveGas(s, n.pump, n.atm, q); s.acc.pumpRef += n.atm.ref - before; if (s.acc.pumpRef > 0.0005 && fault(s, 'pumpRef', `${(s.acc.pumpRef * 1000).toFixed(1)} g par la pompe`, 60)) s.acc.pumpRef = 0 }
  }
  // Pressostats KP (BP pump-down / sécurité HP) et compresseur
  const pSuctG = gauge(pressure(n.suct)), pHiG = gauge(pressure(n.circHi))
  if (!s.switches.lp && pSuctG < 0.2) { s.switches.lp = true; if (s.elec.power && !s.elec.forceLP) log(s, 'Pressostat BP KP1 : coupure compresseur (BP < 0,2 bar)', 'info') }
  if (s.switches.lp && pSuctG > 1.5) { s.switches.lp = false; if (s.elec.power) log(s, 'Pressostat BP KP1 : réenclenchement', 'info') }
  if (!s.switches.hp && pHiG > hpCutout(s.refrigerant)) { s.switches.hp = true; log(s, 'Pressostat HP KP5 : coupure sécurité', 'info') }
  if (run) {
    const q = S_COMP * pressure(n.suct) * dt
    moveGas(s, n.suct, n.circHi, Math.min(q, 0.5 * pressure(n.suct) * n.suct.V))
    if (liquid(n.suct) > 0.015) fault(s, 'slug', '', 30)
    if (s.valves.manLo > 0 && s.valves.manHi > 0 && s.sv.bp.seat !== 'back' && s.sv.hp.seat !== 'back' && s.hoses.blue.b && s.hoses.red.b && liquid(n.circHi) > 0) fault(s, 'liquidToSuction', '', 60)
  }
  // Groupe de récupération : refoule vers la bouteille raccordée en sortie (chemin ouvert), sinon montée en pression → sécurité HP
  if (s.rec.power && !s.rec.tripped) {
    if (pressure(n.recOut) > P_REC_TRIP) { s.rec.tripped = true; fault(s, 'recTrip') }
    else {
      const dest = [...reachable(s, 'recOut')].filter((id) => id !== 'recOut' && !n[id].transit)
      const out = n[dest.includes('recCyl') ? 'recCyl' : dest[0] ?? 'recOut']
      const p = pressure(n.recIn)
      const pump = (pMin: number) => { if (p > pMin) { moveGas(s, n.recIn, out, Math.min(S_REC * p * dt, p * n.recIn.V)); if (liquid(n.recIn) > 0) transferRef(s, n.recIn, out, Math.min(0.005 * dt, liquid(n.recIn))); return true } return false }
      if (s.rec.mode === 'recover') s.rec.done = !pump(P_REC_DONE); else pump(0.3)
      // IN grand ouvert alors qu'il arrive encore du liquide (réservoir non vidé, côté HP raccordé) : surcharge du groupe
      if (s.rec.in === 'open' && s.rec.mode === 'recover' && liquid(n.circHi) > 0.05 && reachable(s, 'recIn').has('circHi')) fault(s, 'recOverload', '', 60)
    }
  }
  // Humidité : dégazage sous ≈ 100 mbar, plafonné à la pression de vapeur saturante
  if (s.circuit.moisture > 0 && pH2o(n.circLo) < satPWater(n.circLo.T) * 0.999) { const k = Math.max(0, Math.min(1, (0.1 - pressure(n.circLo)) / 0.1)); const d = Math.min(s.circuit.moisture, H2O_RATE * k * dt); s.circuit.moisture -= d; n.circLo.h2o += d }
  if (n.circHi.h2o > 0.0005 && s.n2Type === 'industriel') fault(s, 'wetN2', '', 600)
  // Dommages instruments, surpressions
  if (pressure(n.manLo) > LIMITS.lp && !s.damaged.lp) { s.damaged.lp = true; fault(s, 'gauge', 'manomètre BP', 0) }
  if (pressure(n.manHi) > LIMITS.hp && !s.damaged.hp) { s.damaged.hp = true; fault(s, 'gauge', 'manomètre HP', 0) }
  if (pressure(n.vg) > LIMITS.vg && !s.damaged.vg) { s.damaged.vg = true; fault(s, 'gauge', 'vacuomètre', 0) }
  const pc = Math.max(pressure(n.circLo), pressure(n.circHi))
  if (pc > s.circuit.maxTest + P_ATM) fault(s, 'overpressure', `${gauge(pc).toFixed(1)} bar > ${s.circuit.maxTest} bar`, 60)
  if (gauge(pressure(n.circLo)) > s.circuit.lpSwitchMax) fault(s, 'lpSwitchOver', `${gauge(pressure(n.circLo)).toFixed(1)} bar > ${s.circuit.lpSwitchMax} bar`, 60)
  // Contaminations
  const refC = n.circLo.ref + n.circHi.ref + n.suct.ref
  if (refC > 0.02 && (pAir(n.circLo) > 0.1 || pAir(n.circHi) > 0.1)) fault(s, 'contamination', '', 120)
  if (n.circLo.contaminated || n.circHi.contaminated || (refC > 0.01 && n.circHi.refType && n.circHi.refType !== s.refrigerant)) fault(s, 'wrongRef', `${n.circHi.refType} dans un circuit ${s.refrigerant}`, 120)
  if (n.recCyl.ref > s.recCyl.initial + 0.01 && pAir(n.recCyl) > 0.05) fault(s, 'recAir', '', 600)
  const rd = readings(s)
  if (rd.recFill > 1) fault(s, 'recOverfill', `${n.recCyl.ref.toFixed(2)} kg > ${rd.recMax.toFixed(1)} kg`, 60)
  if (!profile(s).blendVapourTopUp && PROPS[s.refCyl.type].blend && !s.refCyl.inverted && s.valves.refCylValve > 0 && (flows.yellow ?? 0) !== 0 && (s.hoses.yellow.b === 'refCylOut' || s.hoses.yellow.a === 'refCylOut') && n.refCyl.ref < s.refCyl.initial - 0.005) fault(s, 'vapourBlend', '', 120)
  if (s.scale.item !== 'refCyl' && Math.abs(n.refCyl.ref - s.refCyl.initial) > 0.02) fault(s, 'noScale', 'bouteille de fluide', 300)
  if (s.scale.item !== 'recCyl' && n.recCyl.ref - s.recCyl.initial > 0.02) fault(s, 'noScale', 'bouteille de transfert', 300)
  // Rejets (accumulés)
  s.acc.release += n.atm.ref - releasedBefore
  if (s.acc.release > 0.0005 && fault(s, 'release', `${(s.acc.release * 1000).toFixed(1)} g`, 15)) s.acc.release = 0
  // Suivi tenue au vide / tenue en pression
  const reach = reachable(s, 'circLo')
  const pumpOnCircuit = s.pumpOn && reach.has('pump')
  if (!pumpOnCircuit && pc < 0.1) { if (!s.vacHold) s.vacHold = { start: s.t, p0: pc } } else s.vacHold = null
  const n2OnCircuit = s.valves.n2CylValve > 0 && reach.has('n2reg')
  if (!n2OnCircuit && pc > 3) { if (!s.n2Hold) s.n2Hold = { start: s.t, p0: pc } } else s.n2Hold = null
  s.t += dt
}

// ---------- Actions ----------
export type Action =
  | { type: 'tick'; dt: number; wallDt: number; steps?: { done: (s: SimState) => boolean; text: string }[] }
  | { type: 'connect'; hose: HoseId; end: 'a' | 'b'; port: PortId | null }
  | { type: 'hoseValve'; hose: HoseId; end: 'a' | 'b'; open: boolean }
  | { type: 'valve'; id: ValveId; value: number }
  | { type: 'sv'; which: 'bp' | 'hp'; seat?: Seat; gland?: 'tight' | 'loose'; stemCap?: boolean; portCap?: boolean }
  | { type: 'ppe'; item: 'gloves' | 'glasses' }
  | { type: 'pump'; on: boolean }
  | { type: 'elec'; power?: boolean; regMode?: 'pumpdown' | 'thermostat'; forceLP?: boolean; coil?: boolean; magnet?: boolean; coverOn?: boolean }
  | { type: 'rec'; power?: boolean; mode?: 'recover' | 'purge'; in?: 'closed' | 'liquid' | 'open'; reset?: boolean }
  | { type: 'n2'; set?: number; n2Type?: 'U' | 'industriel' }
  | { type: 'refCyl'; refType?: Refrigerant; inverted?: boolean }
  | { type: 'scale'; item: 'refCyl' | 'recCyl' | null } | { type: 'tare' }
  | { type: 'manScale'; r: Refrigerant } | { type: 'vacUnit'; u: 'mbar' | 'micron' }
  | { type: 'inspect'; joint: number; tool: 'bulles' | 'detecteur' } | { type: 'repair'; joint: number } | { type: 'replace' }
  | { type: 'detector'; on?: boolean; sensitivity?: 'max' | 'normal'; ref?: string }
  | { type: 'speed'; speed: number } | { type: 'pause'; paused: boolean }
  | { type: 'finish' } | { type: 'cerfa'; data: Record<string, string> }
  | { type: 'load'; state: SimState }

const needsPpe = (s: SimState) => s.ppe.gloves && s.ppe.glasses
function ppeGate(s: SimState, what: string) {
  if (needsPpe(s)) return true
  fault(s, 'ppe', what, 0); log(s, `Action bloquée (EPI manquants) : ${what}`, 'info'); return false
}
/** Masse d'air (bar partiel) dans le flexible raccordé à une voie de service. */
function hoseOnPort(s: SimState, p: PortId) { for (const h of Object.values(s.hoses)) if (h.a === p || h.b === p) return h; return null }

export function reducer(s: SimState, a: Action): SimState {
  if (a.type === 'load') return a.state
  s = structuredClone(s)
  const n = s.nodes
  switch (a.type) {
    case 'tick': {
      if (s.paused || s.finished) return s
      s.wall += a.wallDt
      const sub = Math.ceil(a.dt / 0.01) // ponytail: Euler explicite, pas 10 ms pour les petits volumes (flexibles)
      for (let i = 0; i < sub; i++) step(s, a.dt / sub)
      if (a.steps) { // validation séquentielle : une étape ne se valide que si toutes les précédentes le sont (le « bravo » suit toujours le geste de l'élève)
        let prevOk = true
        s.stepsDone = a.steps.map((st, i) => { const d = s.stepsDone[i] || (prevOk && st.done(s)); if (d && !s.stepsDone[i] && s.t > 0.5) s.events.push({ t: s.t, wall: s.wall, kind: 'step', msg: st.text }); prevOk = prevOk && d; return d })
      }
      { const r = readings(s)
        for (const k of ['charged', 'recovered'] as const) { const m = Math.floor(Math.max(0, r[k]) / 0.1); if (m > s.xferMark[k]) { s.events.push({ t: s.t, wall: s.wall, kind: 'xfer', msg: `${k === 'charged' ? 'chargé' : 'récupéré'} ${(m * 0.1).toFixed(1).replace('.', ',')} kg` }); s.xferMark[k] = m } } }
      const last = s.history[s.history.length - 1]
      if (!last || s.t - last.t >= 1) { const r = readings(s); s.history.push({ t: Math.round(s.t), BP: r.lp, HP: r.hp, vide: Math.max(1, r.vgMicron) }); if (s.history.length > 1800) s.history.shift() }
      return s
    }
    case 'connect': {
      const h = s.hoses[a.hose]
      if (a.hose === 'vg' && a.end === 'a') return s
      if (h[a.end] === a.port) return s
      const other = a.end === 'a' ? h.b : h.a
      if (a.port && (other === a.port || Object.values(s.hoses).some((x) => x.a === a.port || x.b === a.port))) return s
      const hn = n[HOSES[a.hose].node]
      if (h[a.end] && s.hoseValve[a.hose][a.end] && pressure(hn) > 2 && hn.ref > 0) fault(s, 'hoseOpen', HOSES[a.hose].label, 0)
      // raccordement sur une voie de service : le bouchon de voie doit être retiré (retrait automatique, avec ses conséquences)
      if (a.port === 'svBP' || a.port === 'svHP') { const k = a.port === 'svBP' ? 'bp' : 'hp'; if (s.sv[k].portCap) removePortCap(s, k) }
      h[a.end] = a.port
      log(s, a.port ? `${HOSES[a.hose].label} raccordé → ${PORTS[a.port].label}` : `${HOSES[a.hose].label} déconnecté`)
      return s
    }
    case 'hoseValve': s.hoseValve[a.hose][a.end] = a.open; log(s, `${HOSES[a.hose].label} · robinet obturateur ${a.end === 'a' ? '1' : '2'} ${a.open ? 'ouvert' : 'fermé'}`); return s
    case 'valve': {
      const v = Math.max(0, Math.min(1, a.value))
      if (v > 0 && s.valves[a.id] === 0 && ['n2CylValve', 'refCylValve', 'recCylLiqValve', 'recCylVapValve'].includes(a.id) && !ppeGate(s, VALVES[a.id])) return s
      s.valves[a.id] = v
      log(s, `${VALVES[a.id]} : ${v === 0 ? 'fermée' : v === 1 ? 'ouverte' : Math.round(v * 100) + ' %'}`)
      return s
    }
    case 'sv': {
      const v = s.sv[a.which], name = a.which === 'bp' ? 'Vanne de service BP' : 'Vanne de service HP'
      if (a.gland !== undefined) { v.gland = a.gland; log(s, `${name} · presse-étoupe ${a.gland === 'loose' ? 'desserré' : 'resserré'}`) }
      if (a.stemCap !== undefined) { if (!a.stemCap && !ppeGate(s, name)) return s; v.stemCap = a.stemCap; log(s, `${name} · bouchon de tige ${a.stemCap ? 'remis' : 'retiré'}`) }
      if (a.portCap !== undefined) { if (a.portCap) { if (hoseOnPort(s, a.which === 'bp' ? 'svBP' : 'svHP')) { log(s, `${name} : déconnecter le flexible avant de remettre le bouchon de voie`, 'info'); return s } v.portCap = true; log(s, `${name} · bouchon de voie remis`) } else removePortCap(s, a.which) }
      if (a.seat !== undefined && a.seat !== v.seat) {
        if (v.stemCap) { log(s, `${name} : retirer le bouchon de tige avant de manœuvrer`, 'info'); return s }
        if (v.gland === 'tight') { fault(s, 'glandTight', name, 0); log(s, `${name} : manœuvre refusée, presse-étoupe serré`, 'info'); return s }
        const opening = v.seat === 'back' && a.seat !== 'back'
        if (opening) {
          const port: PortId = a.which === 'bp' ? 'svBP' : 'svHP'
          const h = hoseOnPort(s, port)
          if (h && s.hoseValve[h.id][h.a === port ? 'a' : 'b'] && pAir(n[HOSES[h.id].node]) > 0.3) fault(s, 'hoseAir', `${HOSES[h.id].label} non tiré au vide (${(pAir(n[HOSES[h.id].node]) * 1000).toFixed(0)} mbar d'air)`, 0)
          const otherOpen = s.sv[a.which === 'bp' ? 'hp' : 'bp'].seat !== 'back'
          if (otherOpen && s.valves.manLo > 0 && s.valves.manHi > 0 && h) fault(s, 'manifoldLeftOpen', '', 0)
          if (!h && !v.portCap) fault(s, 'capUnderPressure', `${name} ouverte voie non bouchée`, 0)
        }
        v.seat = a.seat; log(s, `${name} : ${SEAT_LABEL[a.seat]}`)
      }
      return s
    }
    case 'ppe': s.ppe[a.item] = !s.ppe[a.item]; log(s, `${a.item === 'gloves' ? 'Gants' : 'Lunettes'} ${s.ppe[a.item] ? 'mis' : 'retirés'}`); return s
    case 'pump': {
      if (a.on && !ppeGate(s, 'pompe à vide')) return s
      if (!a.on && s.pumpOn && reachable(s, 'pump').size > 2 && pressure(n.pump) < 0.05) fault(s, 'pumpOff', '', 0)
      s.pumpOn = a.on; log(s, `Pompe à vide ${a.on ? 'démarrée' : 'arrêtée'}`); return s
    }
    case 'elec': {
      if (a.power === true && !ppeGate(s, 'sectionneur')) return s
      if (a.power !== undefined) { s.elec.power = a.power; if (a.power && gauge(pressure(n.suct)) < 0.2 && !s.elec.forceLP) fault(s, 'compVacuum', '', 0); if (a.power) s.switches.hp = false; if (!a.power) s.elec.forceLP = false; log(s, `Sectionneur ${a.power ? '1 (sous tension)' : '0 (hors tension)'}`) }
      if (a.regMode) { s.elec.regMode = a.regMode; log(s, `Régulation : ${a.regMode === 'pumpdown' ? 'pump-down' : 'thermostatique'}`) }
      if (a.forceLP !== undefined) { s.elec.forceLP = a.forceLP; log(s, a.forceLP ? 'Pressostat BP forcé (contact 3 maintenu)' : 'Pressostat BP relâché') }
      if (a.coil !== undefined) { s.elec.coil = a.coil; log(s, `Bobine d'électrovanne ${a.coil ? 'remise' : 'retirée'}`) }
      if (a.magnet !== undefined) { s.elec.magnet = a.magnet; log(s, `Aimant permanent ${a.magnet ? 'posé sur l\'électrovanne' : 'retiré'}`) }
      if (a.coverOn !== undefined) { s.elec.coverOn = a.coverOn; log(s, `Capot du pressostat ${a.coverOn ? 'remis' : 'retiré'}`) }
      return s
    }
    case 'rec': {
      if (a.power && !ppeGate(s, 'groupe de récupération')) return s
      if (a.power !== undefined) { s.rec.power = a.power; s.rec.done = false; log(s, `Récupérateur ${a.power ? 'en marche' : 'arrêté'}`) }
      if (a.mode) { s.rec.mode = a.mode; log(s, `Récupérateur mode ${a.mode === 'recover' ? 'RECOVER' : 'PURGE'}`) }
      if (a.in) { s.rec.in = a.in; log(s, `Récupérateur vanne IN : ${a.in.toUpperCase()}`) }
      if (a.reset) { s.rec.tripped = false; log(s, 'Réarmement sécurité HP récupérateur') }
      return s
    }
    case 'n2': { if (a.set !== undefined) { s.n2Set = Math.max(0, Math.min(40, a.set)); log(s, `Détendeur azote réglé à ${s.n2Set} bar`) } if (a.n2Type) { s.n2Type = a.n2Type; log(s, `Bouteille d'azote ${a.n2Type === 'U' ? 'sec type U' : 'industriel'}`) } return s }
    case 'refCyl': {
      if (a.refType && a.refType !== s.refCyl.type) { s.refCyl.type = a.refType; n.refCyl.ref = 8; n.refCyl.refType = a.refType; n.refCyl.contaminated = false; s.refCyl.initial = 8; if (s.scale.item === 'refCyl') s.scale.tare = 0; log(s, `Bouteille de fluide sélectionnée : ${a.refType}`) }
      if (a.inverted !== undefined) { s.refCyl.inverted = a.inverted; log(s, `Bouteille de fluide ${a.inverted ? 'retournée (phase liquide)' : 'debout (phase vapeur)'}`) }
      return s
    }
    case 'scale': s.scale = { item: a.item, tare: 0 }; log(s, a.item ? `${a.item === 'refCyl' ? 'Bouteille de fluide' : 'Bouteille de transfert'} posée sur la balance` : 'Balance libérée'); return s
    case 'tare': s.scale.tare = readings(s).scaleGross; log(s, 'Balance mise à zéro (tare)'); return s
    case 'manScale': s.manScale = a.r; log(s, `Échelle manifold : ${a.r}`); return s
    case 'vacUnit': s.vacUnit = a.u; return s
    case 'inspect': {
      const pc = Math.max(pressure(n.circLo), pressure(n.circHi))
      const leaking = s.circuit.leakJoint === a.joint
      const refC = n.circLo.ref + n.circHi.ref
      const result = a.tool === 'bulles' ? (leaking && pc > 1.5 ? 'bulles' : 'aucune') : (leaking && pc > 1.5 && refC > 0.01 && s.detector.on && (s.detector.sensitivity === 'max' || Math.random() < 0.5) ? 'fuite' : 'rien')
      s.inspections[a.joint] = { t: s.t, result }
      if (!s.inspectOrder.includes(a.joint)) s.inspectOrder.push(a.joint)
      if (a.tool === 'bulles' && s.circuit.replaced && s.inspectOrder.length === 1 && !JOINTS[a.joint].drier) fault(s, 'soapOrder', 'commencer par le composant remplacé', 0)
      log(s, `Contrôle ${a.tool === 'bulles' ? 'moussant' : 'détecteur'} · ${JOINTS[a.joint].label} : ${result === 'bulles' || result === 'fuite' ? 'FUITE' : 'rien'}`)
      return s
    }
    case 'repair': if (s.circuit.leakJoint === a.joint) { s.circuit.leakJoint = null; log(s, `${JOINTS[a.joint].label} resserré / rebrasé : fuite supprimée`) } else log(s, `${JOINTS[a.joint].label} resserré (pas de fuite ici)`); return s
    case 'replace': {
      if (!s.circuit.faulty || s.circuit.replaced) return s
      const pc = Math.max(pressure(n.circLo), pressure(n.circHi))
      if (pc > 1.5) fault(s, 'replaceUnderPressure', '', 0)
      for (const id of ['circLo', 'suct', 'circHi'] as const) { transferRef(s, n[id], n.atm, n[id].ref); Object.assign(n[id], { air: (P_ATM * n[id].V) / (R * K(n[id].T)), h2o: 0, refType: null, contaminated: false }) }
      s.circuit.replaced = true; s.circuit.moisture = 0.008; s.circuit.leakJoint = Math.random() < 0.7 ? (Math.random() < 0.5 ? 0 : 1) : 2 + Math.floor(Math.random() * 8); s.inspectOrder = []; s.inspections = {}; s.vacHold = null
      log(s, 'Filtre déshydrateur remplacé et brasé : circuit ouvert à l\'air')
      return s
    }
    case 'detector': { if (a.on !== undefined) { s.detector.on = a.on; log(s, `Détecteur électronique ${a.on ? 'allumé' : 'éteint'}`) } if (a.sensitivity) { s.detector.sensitivity = a.sensitivity; log(s, `Détecteur : sensibilité ${a.sensitivity === 'max' ? 'maximale' : 'normale'}`) } if (a.ref !== undefined) s.detector.ref = a.ref; return s }
    case 'speed': s.speed = a.speed; return s
    case 'pause': s.paused = a.paused; return s
    case 'finish': s.finished = true; log(s, 'Exercice terminé', 'info'); return s
    case 'cerfa': s.cerfa = a.data; return s
  }
  return s
}

function removePortCap(s: SimState, k: 'bp' | 'hp') {
  const v = s.sv[k], name = k === 'bp' ? 'Vanne de service BP' : 'Vanne de service HP'
  v.portCap = false
  log(s, `${name} · bouchon de voie retiré${v.seat === 'back' ? ' (cale arrière vérifiée)' : ''}`)
  if (v.seat !== 'back') fault(s, 'capUnderPressure', name, 0)
}

/** État du poste en fin d'intervention (rangement) : liste des manquements. */
export function tidyIssues(s: SimState) {
  const out: string[] = []
  for (const k of ['bp', 'hp'] as const) { const v = s.sv[k], nm = k === 'bp' ? 'BP' : 'HP'; if (v.seat !== 'back') out.push(`vanne ${nm} pas en cale arrière`); if (v.gland !== 'tight') out.push(`presse-étoupe ${nm} desserré`); if (!v.stemCap) out.push(`bouchon de tige ${nm} absent`); if (!v.portCap) out.push(`bouchon de voie ${nm} absent`) }
  if (Object.values(s.hoses).some((h) => h.a === 'svBP' || h.b === 'svBP' || h.a === 'svHP' || h.b === 'svHP')) out.push('flexibles encore raccordés au groupe')
  if (s.elec.power) out.push('installation encore sous tension')
  if (!s.elec.coverOn) out.push('capot du pressostat non remis')
  if (!s.elec.coil || s.elec.magnet) out.push('bobine d\'électrovanne non remise / aimant en place')
  if (s.valves.refCylValve > 0 || s.valves.recCylLiqValve > 0 || s.valves.recCylVapValve > 0 || s.valves.n2CylValve > 0) out.push('robinets de bouteilles ouverts')
  return out
}

export { REFRIGERANTS }
