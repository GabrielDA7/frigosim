'use client'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EXERCISES, EXERCISE_IDS, acc, applyExercise, checkDoc, expectedDoc, livePenalty, score } from '@/lib/exercises'
import { PROFILES, PROFILE_IDS, ProfileId } from '@/lib/profiles'
import { PROPS, REFRIGERANTS, Refrigerant } from '@/lib/refrigerants'
import { Action, Ev, FAULTS, HOSES, HoseId, JOINTS, MICRON_PER_MBAR, Mode, PORTS, PortId, P_ATM, SEAT_LABEL, Seat, SimState, VALVES, ValveId, evrOpen, hpCutout, initialState, pAir, pressure, profile, readings, reducer, tidyIssues } from '@/lib/sim'
import { DEFAULT_POS, HOSE_LEN, hoseReaches, type EndRef, type Equip, type Positions, type V3 } from './Scene'
import Cerfa from './Cerfa'
import Tour from './Tour'

const Scene = dynamic(() => import('./Scene'), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-slate-500">Chargement de l&apos;atelier 3D…</div> })

const MODES: [Mode, string][] = [['sandbox', 'Bac à sable'], ['guided', 'Pratique guidée'], ['assessment', 'Examen blanc']]
const fmt = (v: number, d = 2) => (Number.isNaN(v) ? 'HS' : v.toFixed(d).replace('.', ','))
const mmss = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`
const EQUIP_LABEL: Record<Equip, string> = { manifold: 'Manifold', groupe: 'Groupe de condensation', svBP: 'Vanne de service BP (aspiration)', svHP: 'Vanne de service HP (réservoir)', evr: 'Électrovanne', kp: 'Pressostats KP', pump: 'Pompe à vide', vg: 'Vacuomètre', refCyl: 'Bouteille de fluide', recCyl: 'Bouteille de transfert', rec: 'Groupe de récupération', n2: 'Azote + détendeur', scale: 'Balance' }

export default function Simulator() {
  const [s, dispatch] = useReducer(reducer, undefined, () => initialState())
  const [zoom, setZoom] = useState(140)
  const [selectedEnd, setSelectedEnd] = useState<EndRef | null>(null)
  const [equip, setEquip] = useState<Equip | null>(null)
  const [hint, setHint] = useState(false)
  const [view, setView] = useState<null | 'debrief' | 'doc' | 'score'>(null)
  const [docErrors, setDocErrors] = useState<string[]>([])
  const [chart, setChart] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [pendingEx, setPendingEx] = useState<SimState['exerciseId']>('manifold')
  const [tour, setTour] = useState(() => { try { return !localStorage.getItem('frigosim-tour') } catch { return false } })
  const [positions, setPositions] = useState<Positions>(DEFAULT_POS)
  const [notice, setNotice] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(-1)
  const checkpoints = useRef<{ wall: number; state: SimState }[]>([])
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(id) }, [notice])
  const closeTour = () => { setTour(false); try { localStorage.setItem('frigosim-tour', '1') } catch {} }

  const ex = s.exerciseId ? EXERCISES[s.exerciseId] : null
  const assess = s.mode === 'assessment'
  const pr = profile(s)
  const stepsFns = useMemo(() => ex?.steps.map((st) => ({ done: st.done, text: st.text })), [ex])
  useEffect(() => { const id = setInterval(() => dispatch({ type: 'tick', dt: 0.1 * s.speed, wallDt: 0.1, steps: stepsFns }), 100); return () => clearInterval(id) }, [s.speed, stepsFns])
  // points de reprise : un instantané à chaque étape validée (pour « revenir avant l'erreur »)
  const stepCount = s.events.filter((e) => e.kind === 'step').length
  useEffect(() => { const last = checkpoints.current[checkpoints.current.length - 1]; if (!last || stepCount > (last.state.events.filter((e) => e.kind === 'step').length)) checkpoints.current.push({ wall: s.wall, state: s }) }, [stepCount]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = (mode: Mode, exId: SimState['exerciseId'], profileId: ProfileId = s.profileId, refrigerant?: Refrigerant) => {
    const st = initialState(mode, profileId, refrigerant)
    if (mode !== 'sandbox' && exId) applyExercise(st, exId)
    setView(null); setDocErrors([]); setSelectedEnd(null); setEquip(null); setHint(false); setDismissed(-1); checkpoints.current = [{ wall: 0, state: st }]
    dispatch({ type: 'load', state: st })
  }
  const rewind = (beforeWall: number) => {
    const cp = [...checkpoints.current].reverse().find((c) => c.wall < beforeWall) ?? checkpoints.current[0]
    if (!cp) return
    const restored: SimState = { ...structuredClone(cp.state), wall: s.wall, history: s.history, events: [...s.events, { t: s.t, wall: s.wall, kind: 'info', msg: `⟲ Retour avant l'erreur (état de ${mmss(cp.state.t)})` }], cooldown: {} }
    dispatch({ type: 'load', state: restored }); setDismissed(-1); setSelectedEnd(null); setEquip(null)
  }
  const r = readings(s)
  const lastFault = s.events.findLast((e) => e.kind === 'fault')
  const lastStep = s.events.findLast((e) => e.kind === 'step')
  const showFault = !assess && lastFault && s.wall - lastFault.wall < 12 && dismissed !== lastFault.wall ? lastFault : null
  const showStep = !assess && lastStep && s.wall - lastStep.wall < 2.5 ? lastStep : null
  const xfers = s.events.filter((e) => e.kind === 'xfer' && s.wall - e.wall < 1.6)
  const liveScore = 20 - livePenalty(s)
  const doc = ex ? expectedDoc(s, ex) : null
  const result = ex ? score(s, ex, docErrors) : null
  const stepIdx = s.stepsDone.findIndex((d) => !d)
  const d = dispatch

  // ---------- fenêtres de commandes ancrées sur les éléments ----------
  const connectKeyboard = (h: HoseId, end: 'a' | 'b', port: PortId | null) => { if (port && !hoseReaches(s, positions, h, end, port)) { setNotice(`${HOSES[h].label} trop court (${HOSE_LEN[h]} m) : rapprocher l'équipement.`); return } d({ type: 'connect', hose: h, end, port }) }
  const renderEndPopover = (e: EndRef) => {
    const h = s.hoses[e.hose]; const port = h[e.end]; const open = s.hoseValve[e.hose][e.end]
    return (
      <>
        <div className="text-xs text-slate-600">{port ? <>Raccordé à <b>{PORTS[port].label}</b></> : 'Extrémité libre : toucher un raccord pour brancher (ou glisser l\'embout).'}</div>
        {e.hose !== 'vg' && <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="flex items-center justify-between"><span className="font-semibold">Robinet obturateur</span><span className={`chip ${open ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{open ? 'OUVERT' : 'FERMÉ'}</span></div><Toggle on={open} onLabel="Ouvrir" offLabel="Fermer" set={(b) => d({ type: 'hoseValve', hose: e.hose, end: e.end, open: b })} /></div>}
        {port && <button className="btn w-full" onClick={() => { d({ type: 'connect', hose: e.hose, end: e.end, port: null }); setSelectedEnd(null) }}>Débrancher</button>}
      </>
    )
  }
  const renderPopover = (e: Equip): { title: string; body: React.ReactNode } | null => {
    const sv = (k: 'bp' | 'hp') => {
      const v = s.sv[k]; const node = k === 'bp' ? s.nodes.suct : s.nodes.circHi
      return (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900 p-2 font-mono text-xs text-white"><div><div className="text-[10px] text-slate-400">côté circuit</div>{fmt(pressure(node) - P_ATM, 2)} bar</div><div><div className="text-[10px] text-slate-400">position</div>{SEAT_LABEL[v.seat]}</div></div>
          <Row label="Bouchon de tige" state={v.stemCap ? 'en place' : 'retiré'}><Toggle on={!v.stemCap} onLabel="Retirer" offLabel="Remettre" set={(b) => d({ type: 'sv', which: k, stemCap: !b })} /></Row>
          <Row label="Presse-étoupe (clé de 11)" state={v.gland === 'loose' ? 'desserré' : 'serré'}><Toggle on={v.gland === 'loose'} onLabel="Desserrer" offLabel="Serrer" set={(b) => d({ type: 'sv', which: k, gland: b ? 'loose' : 'tight' })} /></Row>
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="mb-1 font-semibold">Tige (carré de manœuvre)</div>
            <div className="grid grid-cols-3 gap-1">{(['back', 'read', 'front'] as Seat[]).map((st) => <button key={st} className={`btn px-1 text-xs ${v.seat === st ? (st === 'back' ? 'btn-on' : st === 'read' ? 'btn-primary' : 'btn-danger') : ''}`} onClick={() => d({ type: 'sv', which: k, seat: st })}>{st === 'back' ? '⟲ Cale arrière' : st === 'read' ? 'Lecture' : 'Cale avant ⟳'}</button>)}</div>
            {(v.stemCap || v.gland === 'tight') && <p className="mt-1 text-[11px] text-amber-700">{v.stemCap ? 'Retirer le bouchon de tige d\'abord.' : 'Desserrer le presse-étoupe avant de tourner.'}</p>}</div>
          <Row label="Bouchon de voie manomètre" state={v.portCap ? 'en place' : 'retiré'}><Toggle on={!v.portCap} onLabel="Retirer" offLabel="Remettre" set={(b) => d({ type: 'sv', which: k, portCap: !b })} /></Row>
        </>
      )
    }
    switch (e) {
      case 'svBP': return { title: 'Vanne de service BP · aspiration', body: sv('bp') }
      case 'svHP': return { title: 'Vanne de service HP · réservoir', body: sv('hp') }
      case 'evr': return { title: 'Électrovanne de ligne liquide', body: <>
        <div className={`rounded-lg p-2 text-xs ${evrOpen(s) ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>Ligne liquide : <b>{evrOpen(s) ? 'ouverte' : 'fermée'}</b>{!s.elec.power && !s.elec.magnet ? ' (hors tension → fermée ; retirer la bobine et poser l\'aimant)' : ''}</div>
        <Row label="Bobine" state={s.elec.coil ? 'en place' : 'retirée'}><Toggle on={!s.elec.coil} onLabel="Retirer" offLabel="Remettre" set={(b) => d({ type: 'elec', coil: !b })} /></Row>
        <Row label="Aimant permanent" state={s.elec.magnet ? 'posé' : 'absent'}><Toggle on={s.elec.magnet} onLabel="Poser" offLabel="Retirer" set={(b) => d({ type: 'elec', magnet: b })} /></Row></> }
      case 'kp': return { title: 'Pressostats KP BP / HP', body: <>
        <div className="grid grid-cols-2 gap-2 text-xs"><div className={`rounded-lg p-2 ${s.switches.lp && !s.elec.forceLP ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}><b>KP1 BP</b><br />0,2 / 1,5 bar · max {s.circuit.lpSwitchMax} bar<br />{s.switches.lp ? (s.elec.forceLP ? 'coupé · FORCÉ' : 'coupé') : 'enclenché'}</div><div className={`rounded-lg p-2 ${s.switches.hp ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}><b>KP5 HP</b><br />coupure {hpCutout(s.refrigerant)} bar<br />{s.switches.hp ? 'déclenché' : 'enclenché'}</div></div>
        <Row label="Forcer le contact 3 (BP)" state={s.elec.forceLP ? 'maintenu' : 'libre'}><Toggle on={s.elec.forceLP} onLabel="Forcer" offLabel="Relâcher" set={(b) => d({ type: 'elec', forceLP: b })} /></Row>
        <Row label="Capot du pressostat" state={s.elec.coverOn ? 'remis' : 'retiré'}><Toggle on={!s.elec.coverOn} onLabel="Retirer" offLabel="Remettre" set={(b) => d({ type: 'elec', coverOn: !b })} /></Row></> }
      case 'groupe': return { title: 'Groupe de condensation · chambre froide', body: <>
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs"><b>Plaque signalétique</b> — Fluide <b>{s.refrigerant}</b> (PRG {PROPS[s.refrigerant].gwp}) · Charge <b>{fmt(s.circuit.nominal)} kg</b> · PS HP {s.circuit.maxTest} bar · Pressostat BP max {s.circuit.lpSwitchMax} bar · Voyant : {s.circuit.faulty && !s.circuit.replaced ? '🟡 jaune' : '🟢 vert'}</div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-900 p-2 font-mono text-xs text-white"><div><div className="text-[10px] text-slate-400">BP</div>{fmt(pressure(s.nodes.suct) - P_ATM, 1)} bar</div><div><div className="text-[10px] text-slate-400">HP</div>{fmt(pressure(s.nodes.circHi) - P_ATM, 1)} bar</div><div><div className="text-[10px] text-slate-400">fluide</div>{fmt(s.nodes.circLo.ref + s.nodes.circHi.ref + s.nodes.suct.ref, 2)} kg</div></div>
        <Row label="Sectionneur" state={s.elec.power ? '1 · sous tension' : '0 · hors tension'}><Toggle on={s.elec.power} onLabel="1 · Marche" offLabel="0 · Arrêt" set={(b) => d({ type: 'elec', power: b })} /></Row>
        <Row label="Régulation" state={s.elec.regMode === 'pumpdown' ? 'pump-down' : 'thermostatique'}><Toggle on={s.elec.regMode === 'pumpdown'} onLabel="Pump-down" offLabel="Thermostat" set={(b) => d({ type: 'elec', regMode: b ? 'pumpdown' : 'thermostat' })} /></Row>
        {s.circuit.faulty && !s.circuit.replaced && <button className="btn btn-primary w-full" onClick={() => d({ type: 'replace' })}>🔧 Remplacer le filtre déshydrateur</button>}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="mb-1 font-semibold">Recherche de fuite</div>
          <div className="mb-1 flex gap-1"><button className={`btn min-h-8 flex-1 px-2 py-0 text-xs ${s.detector.on ? 'btn-on' : ''}`} onClick={() => d({ type: 'detector', on: !s.detector.on })}>Détecteur {s.detector.on ? 'ON' : 'OFF'}</button><button className={`btn min-h-8 flex-1 px-2 py-0 text-xs ${s.detector.sensitivity === 'max' ? 'btn-primary' : ''}`} onClick={() => d({ type: 'detector', sensitivity: s.detector.sensitivity === 'max' ? 'normal' : 'max' })}>Sensibilité {s.detector.sensitivity === 'max' ? 'MAX' : 'normale'}</button></div>
          <input type="text" placeholder="Référence du détecteur (pour la fiche)" value={s.detector.ref} onChange={(ev) => d({ type: 'detector', ref: ev.target.value })} className="mb-1 w-full text-xs" />
          <div className="max-h-44 space-y-1 overflow-y-auto">{JOINTS.map((j, i) => <div key={i} className="flex items-center gap-1 text-[11px]"><span className="flex-1 leading-tight">{j.label}{s.inspections[i] && <span className={`ml-1 chip ${s.inspections[i].result === 'bulles' || s.inspections[i].result === 'fuite' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{s.inspections[i].result === 'bulles' ? 'bulles !' : s.inspections[i].result === 'fuite' ? 'fuite !' : 'RAS'}</span>}</span><button className="btn min-h-7 px-1.5 py-0 text-[11px]" onClick={() => d({ type: 'inspect', joint: i, tool: 'bulles' })}>Moussant</button><button className="btn min-h-7 px-1.5 py-0 text-[11px]" onClick={() => d({ type: 'inspect', joint: i, tool: 'detecteur' })}>Détect.</button><button className="btn min-h-7 px-1.5 py-0 text-[11px]" onClick={() => d({ type: 'repair', joint: i })}>Réparer</button></div>)}</div></div></> }
      case 'manifold': return { title: 'Manifold numérique', body: <>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900 p-2 font-mono text-white"><div><div className="text-[10px] text-blue-300">LOW</div><div className="text-lg">{fmt(r.lp)} bar</div></div><div><div className="text-[10px] text-red-300">HIGH</div><div className="text-lg">{fmt(r.hp)} bar</div></div></div>
        <Valve id="manLo" s={s} d={d} throttle /><Valve id="manHi" s={s} d={d} throttle />
        <label className="flex items-center justify-between text-xs">Échelle fluide<select value={s.manScale} onChange={(ev) => d({ type: 'manScale', r: ev.target.value as Refrigerant })}>{REFRIGERANTS.map((x) => <option key={x}>{x}</option>)}</select></label></> }
      case 'pump': return { title: 'Pompe à vide', body: <><Toggle on={s.pumpOn} onLabel="Marche" offLabel="Arrêt" set={(b) => d({ type: 'pump', on: b })} /><Valve id="pumpValve" s={s} d={d} /></> }
      case 'vg': return { title: 'Vacuomètre', body: <>
        <div className="rounded-lg bg-slate-900 p-2 font-mono text-white">{s.damaged.vg ? 'HS — surpression' : r.vgMbar > 1000 ? `${fmt(r.vgMbar / 1000)} bar abs` : s.vacUnit === 'mbar' ? `${fmt(r.vgMbar, 2)} mbar abs` : `${Math.round(r.vgMicron)} microns`}<div className="text-[10px] text-slate-400">index rouge (cible) : {acc(s).vac.target} {acc(s).vac.unit === 'mbar' ? 'mbar' : 'µ'} · 1 mbar = 750 µ</div></div>
        <div className="flex gap-1"><button className={`btn flex-1 ${s.vacUnit === 'mbar' ? 'btn-primary' : ''}`} onClick={() => d({ type: 'vacUnit', u: 'mbar' })}>mbar abs</button><button className={`btn flex-1 ${s.vacUnit === 'micron' ? 'btn-primary' : ''}`} onClick={() => d({ type: 'vacUnit', u: 'micron' })}>microns</button></div>
</> }
      case 'refCyl': return { title: 'Bouteille de fluide', body: <>
        <label className="flex items-center justify-between text-xs">Fluide<select value={s.refCyl.type} onChange={(ev) => d({ type: 'refCyl', refType: ev.target.value as Refrigerant })}>{REFRIGERANTS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <div className="text-xs text-slate-600">{fmt(pressure(s.nodes.refCyl) - P_ATM, 1)} bar · {PROPS[s.refCyl.type].blend ? 'mélange : charger en liquide' : 'fluide pur'}</div>
        <Toggle on={s.refCyl.inverted} onLabel="Retournée · liquide" offLabel="Debout · vapeur" set={(b) => d({ type: 'refCyl', inverted: b })} /><Valve id="refCylValve" s={s} d={d} throttle /></> }
      case 'recCyl': return { title: 'Bouteille de transfert', body: <><div className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs"><b>Gravé sur la bouteille</b> : tare <b>{s.recCyl.tare} kg</b> · max pour {s.nodes.recCyl.refType ?? s.refrigerant} <b>{fmt(r.recMax, 1)} kg</b> → brut max {fmt(s.recCyl.tare + r.recMax, 1)} kg. Contient {fmt(s.nodes.recCyl.ref, 2)} kg{pAir(s.nodes.recCyl) > 0.05 ? ' · ⚠ contient de l\'air (à tirer au vide)' : ' · tirée au vide'}.</div><Valve id="recCylLiqValve" s={s} d={d} /><Valve id="recCylVapValve" s={s} d={d} /></> }
      case 'rec': return { title: 'Groupe de récupération', body: <>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900 p-2 font-mono text-white"><div><div className="text-[10px] text-slate-400">IN</div>{fmt(r.recIn, 1)} bar</div><div><div className="text-[10px] text-slate-400">OUT</div>{fmt(r.recOut, 1)} bar</div></div>
        {s.rec.tripped && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-800">Sécurité HP : ouvrir le refoulement puis <button className="btn min-h-8 px-2 py-0 text-xs" onClick={() => d({ type: 'rec', reset: true })}>Réarmer</button></div>}
        {s.rec.done && <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">0 bar atteint : IN sur CLOSED, mode PURGE.</div>}
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="mb-1 font-semibold">Vanne IN</div><div className="grid grid-cols-3 gap-1">{(['closed', 'liquid', 'open'] as const).map((v) => <button key={v} className={`btn px-1 text-xs ${s.rec.in === v ? 'btn-primary' : ''}`} onClick={() => d({ type: 'rec', in: v })}>{v.toUpperCase()}</button>)}</div></div>
        <div className="flex gap-1"><button className={`btn flex-1 ${s.rec.mode === 'recover' ? 'btn-primary' : ''}`} onClick={() => d({ type: 'rec', mode: 'recover' })}>RECOVER</button><button className={`btn flex-1 ${s.rec.mode === 'purge' ? 'btn-primary' : ''}`} onClick={() => d({ type: 'rec', mode: 'purge' })}>PURGE</button></div>
        <Valve id="recOutValve" s={s} d={d} /><Toggle on={s.rec.power} onLabel="Marche" offLabel="Arrêt" set={(b) => d({ type: 'rec', power: b })} />
        <div className="text-xs text-slate-600">Résidu dans le groupe : {fmt(r.residue * 1000, 0)} g (à réinjecter, jamais rejeté)</div></> }
      case 'n2': return { title: 'Azote + détendeur', body: <>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-900 p-2 font-mono text-white"><div><div className="text-[10px] text-slate-400">Bouteille</div>100 bar</div><div><div className="text-[10px] text-slate-400">Sortie</div>{fmt(Math.max(0, r.n2Out), 1)} bar</div></div>
        <Row label="Bouteille" state={s.n2Type === 'U' ? 'azote sec type U' : 'azote industriel'}><Toggle on={s.n2Type === 'U'} onLabel="Sec · type U" offLabel="Industriel" set={(b) => d({ type: 'n2', n2Type: b ? 'U' : 'industriel' })} /></Row>
        <Valve id="n2CylValve" s={s} d={d} />
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="flex items-center justify-between"><span className="font-semibold">Consigne détendeur</span><span className="font-mono">{s.n2Set} bar</span></div><input type="range" aria-label="Consigne détendeur" min={0} max={40} step={0.5} value={s.n2Set} onChange={(ev) => d({ type: 'n2', set: +ev.target.value })} className="mt-2" /><div className="mt-1 flex gap-1">{[5, 10, 15, 30].map((v) => <button key={v} className="btn min-h-7 flex-1 px-1 py-0 text-xs" onClick={() => d({ type: 'n2', set: v })}>{v} bar</button>)}</div></div>
        <Valve id="n2Valve" s={s} d={d} /><div className="text-xs text-slate-600">Essai {acc(s).n2.target} bar · limite pressostat BP {s.circuit.lpSwitchMax} bar</div></> }
      case 'scale': return { title: 'Balance électronique', body: <><div className="rounded-lg bg-slate-900 p-2 font-mono text-white"><div className="text-[10px] text-slate-400">Net</div><div className="text-2xl">{s.scale.item ? fmt(r.scaleNet, 3) : '—'} kg</div><div className="text-[10px] text-slate-400">brut {s.scale.item ? fmt(r.scaleGross, 3) : '—'} kg · {s.scale.item === 'refCyl' ? 'bouteille de fluide' : s.scale.item === 'recCyl' ? 'bouteille de transfert' : 'vide'}</div></div><div className="grid grid-cols-2 gap-1"><button className="btn btn-primary" onClick={() => d({ type: 'tare' })} disabled={!s.scale.item}>Tare (zéro)</button><button className="btn" onClick={() => d({ type: 'scale', item: null })} disabled={!s.scale.item}>Retirer</button><button className="btn" onClick={() => d({ type: 'scale', item: 'refCyl' })}>Poser bouteille fluide</button><button className="btn" onClick={() => d({ type: 'scale', item: 'recCyl' })}>Poser bouteille transfert</button></div></> }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 flex flex-wrap items-center gap-2 border-b border-white/60 bg-white/80 px-3 py-2 backdrop-blur">
        <div data-tour="brand" className="flex items-center gap-2 pr-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1f1f1f] text-[#f5c400]">❄</span><b className="text-base">FrigoSim</b><span className="hidden text-[11px] text-slate-500 sm:inline">· préparation Cat. 1</span></div>
        <div data-tour="modes" className="flex rounded-xl bg-slate-100 p-1" role="tablist">{MODES.map(([m, l]) => <button key={m} role="tab" aria-selected={s.mode === m} onClick={() => start(m, m === 'sandbox' ? null : m === 'assessment' ? 'examen' : pendingEx)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${s.mode === m ? 'bg-white shadow text-blue-700' : 'text-slate-600'}`}>{l}</button>)}</div>
        {s.mode === 'guided' && <select aria-label="Exercice" value={s.exerciseId ?? ''} onChange={(e) => { setPendingEx(e.target.value as never); start(s.mode, e.target.value as never) }}>{EXERCISE_IDS.map((id) => <option key={id} value={id}>{EXERCISES[id].title}</option>)}</select>}
        <select aria-label="Profil d'examen" title={pr.description} value={s.profileId} onChange={(e) => start(s.mode, s.exerciseId, e.target.value as ProfileId)}>{PROFILE_IDS.map((id) => <option key={id} value={id}>{PROFILES[id].name}</option>)}</select>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs sm:flex">{[1, 5, 20].map((v) => <button key={v} onClick={() => d({ type: 'speed', speed: v })} className={`rounded-lg px-2 py-1 font-semibold ${s.speed === v ? 'bg-white shadow text-blue-700' : 'text-slate-600'}`}>×{v}</button>)}<button onClick={() => d({ type: 'pause', paused: !s.paused })} className="rounded-lg px-2 py-1 font-semibold text-slate-600">{s.paused ? '▶' : '❚❚'}</button></div>
          {!assess && <div key={liveScore} className={`anim-pop rounded-xl px-3 py-1.5 text-sm font-black ${liveScore >= 16 ? 'bg-emerald-100 text-emerald-800' : liveScore >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`} title="Score en direct">★ {liveScore}<span className="font-semibold opacity-60">/20</span></div>}
          <div className="rounded-xl bg-slate-900 px-3 py-1.5 font-mono text-sm text-white"><span className={assess ? 'text-amber-300' : ''}>{mmss(s.wall)}</span><span className="text-slate-400"> · sim {mmss(s.t)}</span></div>
          <div data-tour="ppe" className="flex gap-2"><button onClick={() => d({ type: 'ppe', item: 'gloves' })} className={`btn ${s.ppe.gloves ? 'btn-on' : ''}`} aria-pressed={s.ppe.gloves}>🧤 Gants</button><button onClick={() => d({ type: 'ppe', item: 'glasses' })} className={`btn ${s.ppe.glasses ? 'btn-on' : ''}`} aria-pressed={s.ppe.glasses}>🥽 Lunettes</button></div>
          <button onClick={() => setTour(true)} className="btn h-10 w-10 p-0" aria-label="Visite guidée" title="Visite guidée">?</button>
          <button onClick={() => setDrawer(!drawer)} className={`btn h-10 w-10 p-0 ${drawer ? 'btn-primary' : ''}`} aria-label="Commandes au clavier" title="Commandes au clavier (accessibilité)">⌨</button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <div data-tour="scene" className="absolute inset-0">
          <Scene state={s} zoom={zoom} highlight={!assess} selectedEnd={selectedEnd} onSelectEnd={setSelectedEnd} selectedEquip={equip} positions={positions}
            onConnect={(hose, end, port) => { d({ type: 'connect', hose, end, port }); setSelectedEnd(null) }} onSelectEquip={setEquip}
            onMove={(e, pos: V3) => setPositions((p) => ({ ...p, [e]: pos }))} onNotice={setNotice}
            onDropCylinder={(item, onScale) => { if (onScale && s.scale.item !== item) d({ type: 'scale', item }); if (!onScale && s.scale.item === item) d({ type: 'scale', item: null }) }}
            renderPopover={renderPopover} renderEndPopover={renderEndPopover} />
        </div>
        {notice && <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg" role="status">{notice}</div>}
        {xfers.map((e) => <div key={e.wall} className="anim-rise pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-sm font-black text-white shadow">+ {e.msg}</div>)}

        {/* zoom & outils */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          {[['+', () => setZoom((z) => Math.min(320, z * 1.2))], ['−', () => setZoom((z) => Math.max(60, z / 1.2))], ['⌂', () => setZoom(140)]].map(([l, f]) => <button key={l as string} onClick={f as () => void} className="btn h-10 w-10 p-0 text-lg" aria-label={`zoom ${l}`}>{l as string}</button>)}
          <button onClick={() => setPositions(DEFAULT_POS)} className="btn h-10 w-10 p-0" aria-label="Ranger l'atelier" title="Ranger l'atelier">⟲</button>
          <button onClick={() => setChart(!chart)} className={`btn h-10 w-10 p-0 ${chart ? 'btn-primary' : ''}`} aria-label="Courbe" title="Courbe des pressions">📈</button>
        </div>

        {/* tiroir clavier / accessibilité */}
        {drawer && (
          <aside data-tour="panel" className="absolute bottom-3 right-16 top-3 z-10 w-[20rem] max-w-[90vw] overflow-y-auto card p-3 text-sm">
            <b>Commandes au clavier</b><p className="text-xs text-slate-500">Chaque élément de l&apos;atelier s&apos;ouvre en cliquant dessus. Ici, l&apos;équivalent sans souris.</p>
            <label className="mt-2 flex flex-col gap-1 text-xs">Ouvrir les commandes de…<select value={equip ?? ''} onChange={(e) => setEquip((e.target.value || null) as Equip | null)}><option value="">—</option>{(Object.keys(EQUIP_LABEL) as Equip[]).map((k) => <option key={k} value={k}>{EQUIP_LABEL[k]}</option>)}</select></label>
            <div className="mt-3 font-semibold">Raccordements</div>
            {(Object.keys(HOSES) as HoseId[]).map((h) => <div key={h} className="mt-2 grid grid-cols-[auto_1fr_1fr] items-center gap-1 text-xs"><span className="h-3 w-3 rounded-full" style={{ background: HOSES[h].color }} aria-hidden /><span className="col-span-2 font-semibold">{HOSES[h].label}</span>{(['a', 'b'] as const).map((end) => <select key={end} aria-label={`${HOSES[h].label} extrémité ${end === 'a' ? '1' : '2'}`} className="min-h-9 text-xs" disabled={h === 'vg' && end === 'a'} value={s.hoses[h][end] ?? ''} onChange={(e) => connectKeyboard(h, end, (e.target.value || null) as PortId | null)}><option value="">— libre —</option>{(Object.keys(PORTS) as PortId[]).map((pt) => { const taken = Object.values(s.hoses).some((x) => (x.a === pt || x.b === pt) && s.hoses[h][end] !== pt); return <option key={pt} value={pt} disabled={taken}>{PORTS[pt].label}</option> })}</select>)}</div>)}
          </aside>
        )}

        {/* carte consigne */}
        <div data-tour="card" className="absolute bottom-3 left-3 z-10 w-[25rem] max-w-[calc(100vw-1.5rem)] card p-3">
          {ex ? (<>
            <div className="flex items-start justify-between gap-2"><div><div className="text-[11px] font-bold uppercase tracking-wide text-blue-700">{assess ? 'Examen blanc · chronométré' : `Étape ${Math.max(1, stepIdx + 1)} / ${ex.steps.length}`}</div><b className="text-sm">{ex.title}</b></div>{!assess && <button className="btn min-h-8 px-2 py-0 text-xs" onClick={() => setHint(!hint)} aria-pressed={hint}>💡 Indice</button>}</div>
            {!assess && stepIdx >= 0 && <div className="mt-2 rounded-xl bg-blue-50 p-2 text-sm font-semibold text-blue-900">▶ {ex.steps[stepIdx].text}{hint && <em className="mt-1 block text-xs font-normal text-amber-800">{ex.steps[stepIdx].hint}{ex.steps[stepIdx].video && <span className="ml-1 text-slate-500">· vidéo {ex.steps[stepIdx].video}</span>}</em>}</div>}
            {!assess && stepIdx < 0 && <div className="mt-2 rounded-xl bg-emerald-50 p-2 text-sm font-semibold text-emerald-900">✓ Toutes les étapes sont validées : terminer pour le bilan et la fiche.</div>}
            {!assess && <details className="mt-1 text-xs"><summary className="cursor-pointer text-slate-500">Toutes les étapes ({s.stepsDone.filter(Boolean).length}/{ex.steps.length})</summary><ol className="mt-1 max-h-36 space-y-0.5 overflow-y-auto">{ex.steps.map((st, i) => <li key={i} className={i === stepIdx ? 'font-semibold text-blue-900' : s.stepsDone[i] ? 'text-emerald-700' : 'text-slate-500'}>{s.stepsDone[i] ? '✓' : i === stepIdx ? '▶' : '○'} {st.text}</li>)}</ol></details>}
            {assess && <p className="mt-1 text-xs text-amber-800">{ex.objective} Sans indice ni correction. {s.stepsDone.filter(Boolean).length}/{s.stepsDone.length} gestes détectés.</p>}
            <div className="mt-2 flex gap-2"><button className="btn btn-primary flex-1" onClick={() => { d({ type: 'finish' }); setView(assess ? 'doc' : 'debrief') }} disabled={s.finished}>{assess ? 'Soumettre' : 'Terminer'}</button><button className="btn" onClick={() => start(s.mode, s.exerciseId)}>↻</button>{s.finished && <button className="btn" onClick={() => setView(assess ? (s.cerfa ? 'score' : 'doc') : 'debrief')}>Bilan</button>}</div>
          </>) : (<>
            <div className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Bac à sable · {pr.name}</div>
            <p className="mt-1 text-xs text-slate-600">Cliquez un élément pour ses commandes, glissez les embouts de flexibles sur les raccords, déplacez les équipements. Les conséquences s&apos;affichent au centre.</p>
            <div className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs">{s.events.slice(-6).reverse().map((e, i) => <EvLine key={i} e={e} />)}</div>
            <button className="btn mt-2" onClick={() => start('sandbox', null)}>↻ Réinitialiser</button>
          </>)}
        </div>

        {/* carte d'erreur au centre : quoi, pourquoi, le bon geste, revenir avant l'erreur */}
        {showFault && (<>
          <div key={'v' + showFault.wall} className="anim-vignette pointer-events-none absolute inset-0 z-20" style={{ boxShadow: 'inset 0 0 160px 40px rgba(220,38,38,.55)' }} />
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4" onClick={() => setDismissed(showFault.wall)} role="alertdialog" aria-live="assertive">
            <div key={'f' + showFault.wall} className="anim-shake w-full max-w-md rounded-3xl border-4 border-red-500 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-red-600 text-3xl text-white">⚠</div><div className="min-w-0 flex-1"><div className="text-[11px] font-black uppercase tracking-wider text-red-600">Erreur{showFault.code ? ` · −${FAULTS[showFault.code].penalty} pts` : ''}</div><h2 className="text-lg font-black leading-tight text-slate-900">{showFault.code ? FAULTS[showFault.code].label : showFault.msg}</h2>{showFault.msg.includes(' — ') && <div className="mt-0.5 text-sm font-semibold text-red-700">{showFault.msg.split(' — ')[1]}</div>}</div></div>
              {showFault.code && <div className="mt-3 space-y-2 text-sm"><div className="rounded-xl bg-red-50 p-3"><b className="text-red-800">Pourquoi ?</b> <span className="text-slate-700">{FAULTS[showFault.code].cause}</span></div><div className="rounded-xl bg-emerald-50 p-3"><b className="text-emerald-800">Le bon geste :</b> <span className="text-slate-700">{FAULTS[showFault.code].fix}</span>{FAULTS[showFault.code].video && <span className="ml-1 text-xs text-slate-500">(vidéo {FAULTS[showFault.code].video})</span>}</div></div>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{mmss(showFault.t)} · temps simulé</span><div className="flex gap-2"><button className="btn" onClick={() => rewind(showFault.wall)}>⟲ Revenir avant l&apos;erreur</button><button className="btn btn-danger" onClick={() => setDismissed(showFault.wall)}>Compris</button></div></div>
            </div>
          </div>
        </>)}
        {showStep && <div key={'s' + showStep.wall} className="anim-pop pointer-events-none absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-xl"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-emerald-700">✓</span> Étape validée · {showStep.msg}</div>}

        {chart && (
          <div className="absolute bottom-3 left-1/2 z-10 h-48 w-[28rem] max-w-[90vw] -translate-x-1/2 card p-2">
            <div className="flex items-center justify-between text-xs"><b>Courbe {s.exerciseId === 'vide' ? 'de tirage au vide (microns, log)' : 'des pressions manifold (bar relatif)'}</b><span className="text-slate-500">temps simulé (s)</span></div>
            <ResponsiveContainer width="100%" height="88%"><LineChart data={s.history} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" /><XAxis dataKey="t" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} scale={s.exerciseId === 'vide' ? 'log' : 'auto'} domain={s.exerciseId === 'vide' ? [1, 1000000] : ['auto', 'auto']} width={44} /><Tooltip />{s.exerciseId === 'vide' ? <Line type="monotone" dataKey="vide" stroke="#334155" dot={false} isAnimationActive={false} /> : <><Line type="monotone" dataKey="BP" stroke="#2563eb" dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="HP" stroke="#dc2626" dot={false} isAnimationActive={false} /></>}</LineChart></ResponsiveContainer>
          </div>
        )}
      </main>

      {tour && <Tour onClose={closeTour} />}

      {view && ex && result && doc && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
          <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            {view === 'debrief' && (<>
              <h2 className="text-lg font-bold">Bilan — {ex.title}</h2><p className="text-sm text-slate-600">Temps réel {mmss(s.wall)} · temps simulé {mmss(s.t)}</p>
              <Criteria ex={ex} s={s} /><Faults s={s} /><Measures s={s} />
              <div className="mt-4 flex flex-wrap justify-end gap-2"><button className="btn" onClick={() => setView(null)}>Fermer</button><button className="btn" onClick={() => start(s.mode, s.exerciseId)}>↻ Réessayer</button><button className="btn btn-primary" onClick={() => setView('doc')}>Remplir la {pr.paperwork === 'fiche' ? 'fiche de suivi' : 'fiche Cerfa'}</button></div>
            </>)}
            {view === 'doc' && (<><h2 className="text-lg font-bold">{pr.paperwork === 'fiche' ? 'Fiche de suivi de l\'installation' : 'Fiche d\'intervention — Cerfa 15497 (entraînement)'}</h2><Cerfa template={pr.paperwork} initial={s.cerfa ?? undefined} onSubmit={(data) => { d({ type: 'cerfa', data }); setDocErrors(checkDoc(data, doc, pr.paperwork)); setView('score') }} /></>)}
            {view === 'score' && (<>
              <h2 className="text-lg font-bold">{assess ? 'Résultat de l\'examen blanc' : 'Bilan complet'}</h2>
              <div className="my-3 flex items-center gap-4 rounded-2xl bg-slate-900 p-4 text-white"><div className="text-5xl font-black">{result.total}<span className="text-2xl text-slate-400">/20</span></div><div className="text-sm">{result.success ? '✅ Critères de réussite atteints' : '❌ Critères de réussite non atteints'}<br /><span className="text-slate-300">Temps réel {mmss(s.wall)} · {s.events.filter((e) => e.kind === 'action').length} actions · {s.events.filter((e) => e.kind === 'fault').length} fautes</span></div></div>
              <h3 className="font-bold">Détail du barème</h3>
              <table className="mt-1 w-full text-xs"><thead><tr className="text-left text-slate-500"><th>Faute</th><th>Occ.</th><th>Pén.</th><th>Pourquoi · le bon geste</th></tr></thead><tbody>{result.lines.length === 0 && <tr><td colSpan={4} className="py-2 text-emerald-700">Aucune faute.</td></tr>}{result.lines.map((l, i) => <tr key={i} className="border-t border-slate-100 align-top"><td className="py-1 pr-2 font-semibold">{l.label}</td><td>{l.count}</td><td className="text-red-700">−{l.penalty}</td><td className="text-slate-600">{l.cause}<br /><span className="text-emerald-800">→ {l.fix}</span></td></tr>)}</tbody></table>
              {docErrors.length > 0 && <div className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"><b>Fiche :</b><ul className="list-disc pl-4">{docErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              <Criteria ex={ex} s={s} /><Faults s={s} /><Measures s={s} />
              <details className="mt-3 text-xs"><summary className="cursor-pointer font-bold">Chronologie des actions ({s.events.length})</summary><div className="mt-1 max-h-60 space-y-0.5 overflow-y-auto">{s.events.map((e, i) => <EvLine key={i} e={e} />)}</div></details>
              <p className="mt-3 text-[11px] text-slate-500">Barème : 20 points moins les pénalités. Seuils, limites et barème du profil « {pr.name} » à faire valider par un formateur avant toute évaluation.</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2"><button className="btn" onClick={() => setView(null)}>Fermer</button><button className="btn btn-primary" onClick={() => start(s.mode, s.exerciseId)}>↻ Nouvel essai</button></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- sous-composants ----------
function EvLine({ e }: { e: Ev }) { return <div className={`rounded px-1 ${e.kind === 'fault' ? 'bg-red-50 text-red-800' : e.kind === 'info' ? 'text-amber-800' : e.kind === 'step' ? 'text-emerald-700' : 'text-slate-600'}`}><span className="font-mono text-slate-400">{mmss(e.t)}</span> {e.msg}</div> }
function Criteria({ ex, s }: { ex: (typeof EXERCISES)[keyof typeof EXERCISES]; s: SimState }) { return <ul className="mt-3 space-y-1 text-sm">{ex.criteria.map((c, i) => <li key={i} className={c.ok(s) ? 'text-emerald-700' : 'text-red-700'}>{c.ok(s) ? '✓' : '✗'} {c.text}</li>)}</ul> }
function Faults({ s }: { s: SimState }) {
  const faults = s.events.filter((e) => e.kind === 'fault')
  return <div className="mt-3"><h3 className="font-bold">Ce qui s&apos;est passé</h3>{faults.length === 0 ? <p className="text-sm text-emerald-700">Aucune faute : séquence propre.</p> : <ul className="space-y-1 text-xs">{faults.map((e, i) => <li key={i} className="rounded-lg bg-red-50 p-2"><b>{mmss(e.t)} — {e.msg}</b><div className="text-slate-700">Pourquoi : {e.code && FAULTS[e.code].cause}</div><div className="text-emerald-800">Le bon geste : {e.code && FAULTS[e.code].fix}</div></li>)}</ul>}</div>
}
function Measures({ s }: { s: SimState }) {
  const r = readings(s); const pc = Math.max(pressure(s.nodes.circLo), pressure(s.nodes.circHi)); const tidy = tidyIssues(s)
  const rows: [string, string][] = [['Fluide chargé (balance)', `${fmt(Math.max(0, r.charged), 3)} kg`], ['Fluide récupéré (balance)', `${fmt(Math.max(0, r.recovered), 3)} kg`], ['Résidu dans le récupérateur', `${fmt(r.residue * 1000, 0)} g`], ['Fluide rejeté à l\'atmosphère', `${fmt(r.released * 1000, 1)} g`], ['Pression circuit finale', pc < 0.1 ? `${fmt(pc * 1000, 1)} mbar abs (${Math.round(pc * 1000 * MICRON_PER_MBAR)} µ)` : `${fmt(pc - P_ATM)} bar relatif`], ['Tenue en pression (azote)', s.n2Hold ? `${mmss(s.t - s.n2Hold.start)} · chute ${fmt(s.n2Hold.p0 - pc)} bar` : '—'], ['Fuite résiduelle', s.circuit.leakJoint === null ? 'aucune' : JOINTS[s.circuit.leakJoint].label], ['Bouteille de transfert', `${fmt(s.nodes.recCyl.ref, 2)} / ${fmt(r.recMax, 1)} kg`], ['État du poste', tidy.length ? tidy.join(', ') : 'rangé']]
  return <div className="mt-3"><h3 className="font-bold">Mesures</h3><table className="w-full text-xs">{rows.map(([k, v]) => <tbody key={k}><tr className="border-t border-slate-100"><td className="py-1 text-slate-500">{k}</td><td className="text-right font-mono">{v}</td></tr></tbody>)}</table></div>
}
function Row({ label, state, children }: { label: string; state: string; children: React.ReactNode }) { return <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="mb-1 flex items-center justify-between"><span className="font-semibold">{label}</span><span className="chip bg-slate-100 text-slate-700">{state}</span></div>{children}</div> }
function Valve({ id, s, d, throttle }: { id: ValveId; s: SimState; d: React.Dispatch<Action>; throttle?: boolean }) {
  const v = s.valves[id]
  return <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200"><div className="flex items-center justify-between"><span className="font-semibold">{VALVES[id]}</span><span className={`chip ${v > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{v === 0 ? 'FERMÉE' : v === 1 ? 'OUVERTE' : `${Math.round(v * 100)} %`}</span></div><div className="mt-1 flex gap-1"><button className={`btn flex-1 ${v === 0 ? 'btn-danger' : ''}`} onClick={() => d({ type: 'valve', id, value: 0 })}>Fermer</button>{throttle && <button className={`btn flex-1 ${v > 0 && v < 1 ? 'btn-primary' : ''}`} onClick={() => d({ type: 'valve', id, value: 0.25 })}>Laminer</button>}<button className={`btn flex-1 ${v === 1 ? 'btn-on' : ''}`} onClick={() => d({ type: 'valve', id, value: 1 })}>Ouvrir</button></div></div>
}
function Toggle({ on, onLabel, offLabel, set }: { on: boolean; onLabel: string; offLabel: string; set: (b: boolean) => void }) { return <div className="flex gap-1"><button className={`btn flex-1 ${!on ? 'btn-danger' : ''}`} onClick={() => set(false)}>{offLabel}</button><button className={`btn flex-1 ${on ? 'btn-on' : ''}`} onClick={() => set(true)}>{onLabel}</button></div> }
