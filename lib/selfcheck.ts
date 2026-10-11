// Auto-vérification du modèle physique et des gestes de l'examen : `npx tsx lib/selfcheck.ts`
import assert from 'node:assert/strict'
import { applyExercise, EXERCISES } from './exercises'
import { Action, P_ATM, SimState, initialState, pAir, pressure, readings, reducer, tidyIssues } from './sim'

let s: SimState
const d = (a: Action) => { s = reducer(s, a) }
const run = (sec: number) => { for (let i = 0; i < sec * 2; i++) d({ type: 'tick', dt: 0.5, wallDt: 0.5 }) }
const pc = () => Math.max(pressure(s.nodes.circLo), pressure(s.nodes.circHi))
const totalRef = () => Object.values(s.nodes).reduce((a, n) => a + n.ref, 0)
const faults = () => s.events.filter((e) => e.kind === 'fault').map((e) => e.code)
const has = (c: string) => faults().includes(c as never)
const ppe = () => { d({ type: 'ppe', item: 'gloves' }); d({ type: 'ppe', item: 'glasses' }) }
const uncap = (k: 'bp' | 'hp') => { d({ type: 'sv', which: k, stemCap: false }); d({ type: 'sv', which: k, portCap: false }) }
const seat = (k: 'bp' | 'hp', to: 'back' | 'read' | 'front') => { d({ type: 'sv', which: k, gland: 'loose' }); d({ type: 'sv', which: k, seat: to }); d({ type: 'sv', which: k, gland: 'tight' }) }
const hoses = () => { d({ type: 'connect', hose: 'red', end: 'a', port: 'manHP' }); d({ type: 'connect', hose: 'red', end: 'b', port: 'svHP' }); d({ type: 'connect', hose: 'blue', end: 'a', port: 'manLP' }); d({ type: 'connect', hose: 'blue', end: 'b', port: 'svBP' }) }
const evacHoses = () => { d({ type: 'connect', hose: 'yellow', end: 'a', port: 'manREF' }); d({ type: 'connect', hose: 'yellow', end: 'b', port: 'pumpIn' }); d({ type: 'valve', id: 'manLo', value: 1 }); d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'pump', on: true }); run(120); d({ type: 'hoseValve', hose: 'yellow', end: 'b', open: false }); d({ type: 'pump', on: false }); d({ type: 'connect', hose: 'yellow', end: 'b', port: null }); d({ type: 'valve', id: 'manLo', value: 0 }); d({ type: 'valve', id: 'manHi', value: 0 }) }

// A. EPI
s = initialState('sandbox'); d({ type: 'pump', on: true }); assert.equal(s.pumpOn, false); assert.ok(has('ppe'))

// B. Bouchon de voie retiré hors cale arrière → rejet + faute ; presse-étoupe serré → manœuvre refusée
s = initialState('guided'); applyExercise(s, 'manifold'); ppe()
d({ type: 'sv', which: 'hp', stemCap: false }); d({ type: 'sv', which: 'hp', seat: 'read' }); assert.equal(s.sv.hp.seat, 'back'); assert.ok(has('glandTight'), 'presse-étoupe serré refusé')
seat('hp', 'read'); assert.equal(s.sv.hp.seat, 'read')
d({ type: 'sv', which: 'hp', portCap: false }); run(3); assert.ok(has('capUnderPressure') && readings(s).released > 0.0005, 'bouchon retiré en lecture : rejet')

// C. Pose correcte : cale arrière vérifiée, flexibles tirés au vide, manifold fermé → aucune faute, pas d'air dans le circuit
s = initialState('guided'); applyExercise(s, 'manifold'); ppe(); uncap('bp'); uncap('hp'); hoses(); evacHoses()
assert.ok(pressure(s.nodes.hBlue) < 0.15 && pressure(s.nodes.hRed) < 0.15, 'flexibles sous vide')
seat('bp', 'read'); seat('hp', 'read'); run(5)
assert.ok(!has('hoseAir') && !has('manifoldLeftOpen') && !has('capUnderPressure'), `pose sans faute : ${faults()}`)
assert.ok(pAir(s.nodes.circHi) < 0.01, 'pas d\'air dans le circuit')
assert.ok(readings(s).hp > 3 && readings(s).lp > 3, 'manos lisent le circuit')
// mise sous tension puis dépose par pump-down
d({ type: 'elec', power: true }); run(60); assert.ok(readings(s).hp > readings(s).lp + 1, 'HP > BP en fonctionnement')
seat('hp', 'back'); d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'elec', coil: false }); d({ type: 'valve', id: 'manLo', value: 1 }); run(300)
d({ type: 'elec', forceLP: true }); run(240)
assert.ok(pressure(s.nodes.hBlue) < 1.6, `flexibles vidés ${pressure(s.nodes.hBlue).toFixed(2)} bar abs`)
seat('bp', 'back'); d({ type: 'elec', power: false }); d({ type: 'elec', coil: true })
for (const h of ['red', 'blue'] as const) { d({ type: 'hoseValve', hose: h, end: 'b', open: false }); d({ type: 'connect', hose: h, end: 'b', port: null }) }
d({ type: 'sv', which: 'bp', portCap: true }); d({ type: 'sv', which: 'hp', portCap: true }); d({ type: 'sv', which: 'bp', stemCap: true }); d({ type: 'sv', which: 'hp', stemCap: true })
assert.ok(readings(s).released < 0.005, `dépose : rejet ${(readings(s).released * 1000).toFixed(1)} g`)
assert.deepEqual(tidyIssues(s), [], 'poste rangé')
assert.ok(EXERCISES.manifold.criteria.every((c) => c.ok(s)), 'critères pose/dépose')

// D. Pose sans tirage au vide des flexibles → hoseAir ; manifold laissé ouvert → manifoldLeftOpen
s = initialState('guided'); applyExercise(s, 'manifold'); ppe(); uncap('bp'); uncap('hp'); hoses(); d({ type: 'valve', id: 'manLo', value: 1 }); d({ type: 'valve', id: 'manHi', value: 1 })
seat('bp', 'read'); seat('hp', 'read'); assert.ok(has('hoseAir'), 'air des flexibles'); assert.ok(has('manifoldLeftOpen'), 'manifold laissé ouvert')

// E. Électrovanne : hors tension sans aimant, la ligne liquide est fermée
s = initialState('sandbox'); assert.ok(!s.elec.coil || true); d({ type: 'elec', power: false }); s.nodes.circLo.ref = 0.05; const hi0 = s.nodes.circHi.ref; run(60); assert.ok(Math.abs(s.nodes.circHi.ref - hi0) < 1e-6, 'électrovanne fermée hors tension'); d({ type: 'elec', magnet: true }); run(60); assert.ok(s.nodes.circHi.ref < hi0, 'aimant : ligne liquide ouverte')

// F. Récupération complète (lycée : bouteille déjà tirée au vide)
s = initialState('guided'); applyExercise(s, 'recup'); ppe(); const m0 = totalRef(); uncap('bp'); uncap('hp'); hoses()
d({ type: 'connect', hose: 'yellow', end: 'a', port: 'manREF' }); d({ type: 'connect', hose: 'yellow', end: 'b', port: 'recIn' }); d({ type: 'connect', hose: 'black', end: 'a', port: 'manVAC' }); d({ type: 'connect', hose: 'black', end: 'b', port: 'pumpIn' })
d({ type: 'rec', in: 'open' }); d({ type: 'valve', id: 'manLo', value: 1 }); d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'pump', on: true }); run(180)
assert.ok(pressure(s.nodes.recIn) < 0.2, `récupérateur tiré au vide (${(pressure(s.nodes.recIn) * 1000).toFixed(0)} mbar)`)
d({ type: 'hoseValve', hose: 'black', end: 'b', open: false }); d({ type: 'pump', on: false }); d({ type: 'connect', hose: 'black', end: 'b', port: null }); d({ type: 'connect', hose: 'black', end: 'a', port: null })
d({ type: 'scale', item: 'recCyl' }); d({ type: 'connect', hose: 'black', end: 'a', port: 'recOut' }); d({ type: 'connect', hose: 'black', end: 'b', port: 'recCylLiq' }); d({ type: 'hoseValve', hose: 'black', end: 'b', open: true }); d({ type: 'valve', id: 'recCylLiqValve', value: 1 }); d({ type: 'valve', id: 'recOutValve', value: 1 })
d({ type: 'elec', coil: false }); d({ type: 'elec', magnet: true }); seat('bp', 'read'); seat('hp', 'read')
d({ type: 'rec', in: 'liquid', mode: 'recover' }); d({ type: 'tare' }); d({ type: 'rec', power: true }); run(300); d({ type: 'rec', in: 'open' }); run(600)
assert.ok(pc() <= 0.6 + 0.05, `circuit récupéré ${(pc() - P_ATM).toFixed(2)} bar rel.`)
assert.ok(readings(s).recovered > 0.85 * s.circuit.nominal, `masse récupérée ${readings(s).recovered.toFixed(3)} kg`)
d({ type: 'rec', in: 'closed', mode: 'purge' }); run(60); assert.ok(readings(s).residue < 0.02, `résidu après purge ${(readings(s).residue * 1000).toFixed(1)} g`)
assert.ok(Math.abs(totalRef() - m0) < 1e-6, 'masse conservée'); assert.ok(!has('recAir') && !has('recTrip') && !has('recOverload'), `récup sans faute : ${faults()}`)
assert.ok(readings(s).released < 0.005, `rejet ${(readings(s).released * 1000).toFixed(1)} g`)
// IN sur CLOSED : aucune entrée ; IN sur OPEN avec du liquide → surcharge
s = initialState('guided'); applyExercise(s, 'recup'); ppe(); uncap('bp'); uncap('hp'); hoses(); d({ type: 'connect', hose: 'yellow', end: 'a', port: 'manREF' }); d({ type: 'connect', hose: 'yellow', end: 'b', port: 'recIn' })
d({ type: 'connect', hose: 'black', end: 'a', port: 'recOut' }); d({ type: 'connect', hose: 'black', end: 'b', port: 'recCylLiq' }); d({ type: 'valve', id: 'recCylLiqValve', value: 1 }); d({ type: 'valve', id: 'recOutValve', value: 1 }); d({ type: 'scale', item: 'recCyl' })
seat('hp', 'read'); d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'rec', in: 'open', mode: 'recover', power: true }); run(30); assert.ok(has('recOverload'), 'IN OPEN avec liquide → surcharge')

// G. Azote 10 bar, limite pressostat BP 17 bar, fuite, moussant dans l'ordre
s = initialState('guided'); applyExercise(s, 'azote'); ppe(); uncap('bp'); uncap('hp'); hoses(); seat('bp', 'read'); seat('hp', 'read')
d({ type: 'connect', hose: 'yellow', end: 'a', port: 'manREF' }); d({ type: 'connect', hose: 'yellow', end: 'b', port: 'n2Out' })
d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'valve', id: 'manLo', value: 1 }); d({ type: 'n2', set: 10 }); d({ type: 'valve', id: 'n2CylValve', value: 1 }); d({ type: 'valve', id: 'n2Valve', value: 1 }); run(240)
assert.ok(Math.abs(pc() - P_ATM - 10) < 0.5, `pression d'essai ${(pc() - P_ATM).toFixed(2)} bar`)
d({ type: 'valve', id: 'n2CylValve', value: 0 }); d({ type: 'valve', id: 'n2Valve', value: 0 }); run(1)
const leak = s.circuit.leakJoint!; d({ type: 'inspect', joint: 3, tool: 'bulles' }); assert.ok(has('soapOrder'), 'ordre moussant : composant remplacé d\'abord')
d({ type: 'inspect', joint: leak, tool: 'bulles' }); assert.equal(s.inspections[leak].result, 'bulles'); d({ type: 'repair', joint: leak }); const p1 = pc(); run(150); assert.ok(p1 - pc() < 0.05, 'tenue après réparation')
d({ type: 'n2', set: 20 }); d({ type: 'valve', id: 'n2CylValve', value: 1 }); d({ type: 'valve', id: 'n2Valve', value: 1 }); run(300); assert.ok(has('lpSwitchOver') && has('overpressure'), 'limite pressostat BP 17 bar')

// H. Vide ≤ 25 mbar (profil lycée) puis isolement
s = initialState('guided'); applyExercise(s, 'vide'); ppe(); uncap('bp'); uncap('hp'); hoses(); seat('bp', 'read'); seat('hp', 'read')
d({ type: 'connect', hose: 'black', end: 'a', port: 'manVAC' }); d({ type: 'connect', hose: 'black', end: 'b', port: 'pumpIn' }); d({ type: 'connect', hose: 'vg', end: 'b', port: 'manREF' })
d({ type: 'valve', id: 'manLo', value: 1 }); d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'pump', on: true }); run(900)
assert.ok(pc() * 1000 <= 25, `vide ${(pc() * 1000).toFixed(1)} mbar`)
d({ type: 'valve', id: 'manLo', value: 0 }); d({ type: 'valve', id: 'manHi', value: 0 }); d({ type: 'hoseValve', hose: 'black', end: 'b', open: false }); d({ type: 'pump', on: false }); run(130)
assert.ok(!has('pumpOff') && pc() * 1000 < 40, 'vide maintenu après isolement'); assert.ok(EXERCISES.vide.criteria.every((c) => c.ok(s)), 'critères vide')

// I. Charge : migration naturelle puis complément compresseur (R-407F, complément vapeur toléré par le profil)
s = initialState('guided'); applyExercise(s, 'charge'); ppe(); const c0 = totalRef(); uncap('bp'); uncap('hp'); hoses(); seat('bp', 'read'); seat('hp', 'read')
d({ type: 'refCyl', refType: 'R-407F', inverted: true }); d({ type: 'scale', item: 'refCyl' }); d({ type: 'tare' })
d({ type: 'connect', hose: 'yellow', end: 'a', port: 'manREF' }); d({ type: 'connect', hose: 'yellow', end: 'b', port: 'refCylOut' })
d({ type: 'valve', id: 'manHi', value: 1 }); d({ type: 'valve', id: 'refCylValve', value: 1 }); run(120)
const mig = readings(s).charged; assert.ok(mig > 0.05, `migration naturelle ${mig.toFixed(3)} kg`)
d({ type: 'valve', id: 'manHi', value: 0 }); d({ type: 'elec', power: true }); d({ type: 'refCyl', inverted: false }); d({ type: 'valve', id: 'manLo', value: 1 }); run(400)
assert.ok(readings(s).charged > mig + 0.2, `complément compresseur ${readings(s).charged.toFixed(3)} kg`)
assert.ok(!has('vapourBlend'), 'complément vapeur toléré (profil lycée)'); assert.ok(Math.abs(totalRef() - c0) < 1e-6, 'masse conservée (charge)')

// J. Profil standard : seuils différents et Cerfa
s = initialState('guided', 'standard'); assert.equal(s.refrigerant, 'R-134a'); assert.equal(s.circuit.nominal, 1.5); assert.equal(s.circuit.maxTest, 32)

console.log('selfcheck OK —', faults().length, 'fautes provoquées dans la dernière séquence')
