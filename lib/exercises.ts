import { PROPS } from './refrigerants'
import { ExerciseId, FAULTS, FaultCode, JOINTS, MICRON_PER_MBAR, P_ATM, P_REC_DONE, R, SimState, T_AMB, evrOpen, pAir, pressure, profile, reachable, readings, tidyIssues } from './sim'

// ---------- Seuils (lus dans le profil d'examen actif) — À VALIDER PAR LE FORMATEUR ----------
export function acc(s: SimState) {
  const p = profile(s)
  return { n2: p.n2, vac: p.vacuum, chargeTol: 0.05, recoverMin: 0.85, maxRelease: 0.02, testHoldS: 120, testMaxDrop: 0.3 }
}
export const RUBRIC = { maxPerCode: 2, maxDoc: 4, releaseCap: 6 }

export interface Step { text: string; hint: string; done: (s: SimState) => boolean; video?: string }
export interface Exercise { id: ExerciseId; title: string; short: string; objective: string; intro: string; setup: (s: SimState) => void; steps: Step[]; criteria: { text: string; ok: (s: SimState) => boolean }[]; nature: string[]; tidy?: boolean }

const pc = (s: SimState) => Math.max(pressure(s.nodes.circLo), pressure(s.nodes.circHi))
const vacNow = (s: SimState) => (acc(s).vac.unit === 'mbar' ? pc(s) * 1000 : pc(s) * 1000 * MICRON_PER_MBAR)
const ppe = (s: SimState) => s.ppe.gloves && s.ppe.glasses
const vgOnCircuit = (s: SimState) => reachable(s, 'vg').has('circLo') || reachable(s, 'vg').has('circHi') || reachable(s, 'vg').has('manMid')
const hoseOn = (s: SimState, port: 'svBP' | 'svHP') => Object.values(s.hoses).some((h) => h.a === port || h.b === port)
const noFault = (s: SimState, ...codes: FaultCode[]) => !s.events.some((e) => e.kind === 'fault' && e.code && codes.includes(e.code))
const n2Ok = (s: SimState) => !!s.n2Hold && s.t - s.n2Hold.start >= acc(s).testHoldS && s.n2Hold.p0 - pc(s) <= acc(s).testMaxDrop && Math.abs(s.n2Hold.p0 - P_ATM - acc(s).n2.target) <= acc(s).n2.tol + 0.3
const vacReached = (s: SimState) => vacNow(s) <= acc(s).vac.target
const vacOk = (s: SimState) => { const a = acc(s).vac; if (!s.vacHold) return false; const p0 = a.unit === 'mbar' ? s.vacHold.p0 * 1000 : s.vacHold.p0 * 1000 * MICRON_PER_MBAR; return p0 <= a.target && s.t - s.vacHold.start >= a.holdS && vacNow(s) - p0 <= Math.max(a.maxRise, 0.5) }
const manifoldHosesEvacuated = (s: SimState) => pressure(s.nodes.hBlue) < 0.15 && pressure(s.nodes.hRed) < 0.15
const allJointsInspected = (s: SimState, after = 0) => JOINTS.every((_, j) => s.inspections[j] && s.inspections[j].t >= after)

function airCircuit(s: SimState, moisture = 0.008) {
  for (const id of ['circLo', 'suct', 'circHi'] as const) Object.assign(s.nodes[id], { air: (P_ATM * s.nodes[id].V) / (R * (T_AMB + 273.15)), h2o: 0, ref: 0, refType: null, contaminated: false })
  s.circuit.moisture = moisture
}
function vacuumCircuit(s: SimState) {
  for (const id of ['circLo', 'suct', 'circHi'] as const) Object.assign(s.nodes[id], { air: (0.0004 * s.nodes[id].V) / (R * (T_AMB + 273.15)), h2o: 0, ref: 0, refType: null, contaminated: false })
  s.circuit.moisture = 0
}
function recoveryCylinder(s: SimState) {
  const evac = profile(s).recCylEvacuated
  Object.assign(s.nodes.recCyl, { air: evac ? (0.0005 * 12.3) / (R * (T_AMB + 273.15)) : (P_ATM * 12.3) / (R * (T_AMB + 273.15)), ref: 0, refType: null, contaminated: false }); s.recCyl.initial = 0
}

const stepPpe: Step = { text: 'Mettre gants et lunettes', hint: 'Côté HP brûlant, côté BP glacé : gants et lunettes avant tout.', done: ppe, video: '08:40' }

// ---- Pose / dépose des manomètres ----
const poseSteps: Step[] = [
  stepPpe,
  { text: 'Retirer les bouchons de tige, vérifier la cale arrière, puis retirer les bouchons de voie (les ranger ensemble)', hint: 'Cliquer une vanne de service : bouchon de tige → vérifier « cale arrière » → bouchon de voie. Jamais le bouchon de voie si la vanne n\'est pas en cale arrière.', done: (s) => !s.sv.bp.stemCap && !s.sv.hp.stemCap && !s.sv.bp.portCap && !s.sv.hp.portCap, video: '09:40' },
  { text: 'Raccorder le rouge à la voie HP (réservoir) et le bleu à la voie BP (aspiration), robinets obturateurs et vannes du manifold ouverts', hint: 'Glisser les embouts sur les voies ; vérifier les robinets obturateurs des flexibles et ouvrir HP et BP du manifold.', done: (s) => hoseOn(s, 'svHP') && hoseOn(s, 'svBP') && s.valves.manLo > 0 && s.valves.manHi > 0, video: '10:30' },
  { text: 'Tirer les flexibles au vide : jaune du port central à la pompe, pompe en marche jusqu\'à −1 bar aux deux manos', hint: 'Les flexibles contiennent de l\'air : il ne doit pas entrer dans le circuit.', done: (s) => manifoldHosesEvacuated(s) && reachable(s, 'pump').has('manMid'), video: '11:30' },
  { text: 'Fermer le robinet obturateur du jaune, PUIS arrêter la pompe, puis déconnecter le jaune', hint: 'Si la pompe s\'arrête avant la fermeture, l\'air remonte et le vide est perdu.', done: (s) => !s.pumpOn && !Object.values(s.hoses).some((h) => h.a === 'pumpIn' || h.b === 'pumpIn') && manifoldHosesEvacuated(s), video: '12:50' },
  { text: 'Fermer les vannes HP et BP du manifold', hint: 'L\'erreur la plus fréquente des candidats : laissées ouvertes, le liquide HP file vers l\'aspiration.', done: (s) => s.valves.manLo === 0 && s.valves.manHi === 0 && manifoldHosesEvacuated(s), video: '13:20' },
  { text: 'Desserrer le presse-étoupe, vanne BP en cale de lecture, resserrer ; puis la vanne HP', hint: 'Clé plate de 11 : desserrer → tourner (sens horaire) → resserrer. BP d\'abord, HP ensuite.', done: (s) => s.sv.bp.seat === 'read' && s.sv.hp.seat === 'read' && s.sv.bp.gland === 'tight' && s.sv.hp.gland === 'tight', video: '13:40' },
  { text: 'Mettre sous tension (sectionneur 1), choisir la régulation et lire BP / HP en fonctionnement', hint: 'Vérifier que toutes les vannes du circuit sont ouvertes avant la mise sous tension.', done: (s) => s.elec.power, video: '14:28' },
]
const deposeSteps: Step[] = [
  { text: 'Dépose : toujours commencer par la HP → presse-étoupe, vanne HP en cale arrière, resserrer, puis ouvrir la vanne HP du manifold', hint: 'Le flexible rouge se vide vers l\'aspiration à travers le manifold.', done: (s) => s.sv.hp.seat === 'back' && s.valves.manHi > 0, video: '15:24' },
  { text: 'Fermer la ligne liquide (retirer la bobine de l\'électrovanne) et ouvrir la vanne BP du manifold : le compresseur aspire la BP et les flexibles', hint: 'Pump-down : sans alimentation liquide, la BP descend vers 0 bar.', done: (s) => !evrOpen(s) && s.valves.manLo > 0 && s.sv.hp.seat === 'back', video: '16:30' },
  { text: 'Vers 0 bar, forcer le pressostat BP (contact 3) pour garder le compresseur, puis à 0 bar mettre la vanne BP en cale arrière', hint: 'Geste « sportif » : forcer KP1, puis cale arrière BP dès que le mano BP touche 0.', done: (s) => s.sv.bp.seat === 'back' && pressure(s.nodes.hBlue) < 1.6 && pressure(s.nodes.hRed) < 1.6, video: '17:20' },
  { text: 'Couper le courant, resserrer les presse-étoupes, fermer les robinets obturateurs, déconnecter, remettre bobine, bouchons de voie et de tige', hint: 'Bouchons à la main puis un quart de tour modéré. Jamais de pince multiprise.', done: (s) => tidyIssues(s).length === 0, video: '18:00' },
]
const poseCriteria: Exercise['criteria'] = [
  { text: 'Bouchons de voie retirés en cale arrière (aucun rejet au retrait)', ok: (s) => noFault(s, 'capUnderPressure') },
  { text: 'Flexibles tirés au vide avant l\'ouverture des vannes de service', ok: (s) => noFault(s, 'hoseAir') },
  { text: 'Vannes du manifold fermées avant l\'ouverture des vannes de service', ok: (s) => noFault(s, 'manifoldLeftOpen', 'liquidToSuction') },
  { text: 'Presse-étoupe desserré avant chaque manœuvre', ok: (s) => noFault(s, 'glandTight') },
  { text: 'Dépose : rejet total ≤ 5 g', ok: (s) => readings(s).released <= 0.005 },
  { text: 'Poste remis en état (bouchons, presse-étoupes, courant, capot)', ok: (s) => tidyIssues(s).length === 0 },
]

// ---- Récupération ----
const recupSteps: Step[] = [
  stepPpe,
  { text: 'Vérifier la cale arrière, retirer les bouchons, raccorder rouge → voie HP et bleu → voie BP', hint: 'Geste repassé deux fois au ralenti dans la vidéo : cale arrière AVANT le bouchon de voie.', done: (s) => hoseOn(s, 'svHP') && hoseOn(s, 'svBP'), video: '19:30' },
  { text: 'Tirer au vide l\'ensemble : jaune du port central à l\'ENTRÉE du récupérateur (IN sur OPEN), noir du port 3/8 à la pompe, vannes du manifold ouvertes, pompe en marche jusqu\'à −1 bar', hint: 'Parcourir tout le chemin et ouvrir chaque vanne ; les vannes de service restent en cale arrière.', done: (s) => pressure(s.nodes.manMid) < 0.15 && pressure(s.nodes.recIn) < 0.2, video: '20:30' },
  { text: 'Fermer le robinet obturateur côté pompe, PUIS arrêter la pompe', hint: 'Toujours le robinet d\'abord, la pompe ensuite.', done: (s) => !s.pumpOn && pressure(s.nodes.manMid) < 0.3, video: '22:40' },
  { text: 'Bouteille de transfert : lire tare et masse max gravées, la poser sur la balance, raccorder OUT → robinet ROUGE (liquide), ouvrir le robinet rouge et la vanne OUT, noter la masse de départ', hint: 'Rouge = liquide (tube plongeur), bleu = vapeur. Une bouteille trop pleine dans une voiture au soleil peut éclater.', done: (s) => s.scale.item === 'recCyl' && Object.values(s.hoses).some((h) => (h.a === 'recCylLiq' && h.b === 'recOut') || (h.b === 'recCylLiq' && h.a === 'recOut')) && s.valves.recCylLiqValve > 0 && s.valves.recOutValve > 0, video: '23:30' },
  { text: 'Ouvrir toutes les vannes du circuit : armoire hors tension → retirer la bobine de l\'électrovanne et poser un aimant permanent', hint: 'Hors tension l\'électrovanne est fermée : le liquide du réservoir resterait piégé.', done: (s) => s.elec.magnet, video: '26:00' },
  { text: 'Presse-étoupe, vannes de service en lecture (un quart de tour), robinets obturateurs et vannes HP / BP du manifold ouverts', hint: 'Desserrer, tourner, resserrer. Puis ouvrir HP et BP du manifold.', done: (s) => s.sv.bp.seat !== 'back' && s.sv.hp.seat !== 'back' && s.valves.manLo > 0 && s.valves.manHi > 0, video: '27:00' },
  { text: 'Récupérateur : IN sur LIQUID, OUT ouverte (jamais CLOSED en marche), mode RECOVER, tarer la balance, mettre en marche', hint: 'Au début il arrive surtout du liquide : IN sur LIQUID évite de noyer le groupe.', done: (s) => s.rec.power && s.rec.mode === 'recover' && s.rec.in === 'liquid' && s.scale.tare > 0, video: '28:00' },
  { text: 'Quand il ne vient plus que de la vapeur, passer IN sur OPEN ; récupérer jusqu\'à 0 bar aux manos', hint: 'La balance monte, les manos descendent. Ne plus toucher la bouteille.', done: (s) => s.rec.in === 'open' && pc(s) <= P_REC_DONE + 0.05 && readings(s).recovered >= acc(s).recoverMin * s.circuit.nominal, video: '30:00' },
  { text: 'À 0 bar : IN sur CLOSED, mode PURGE, purger le groupe vers la bouteille', hint: 'La purge ajoute les derniers grammes (18 g dans la vidéo).', done: (s) => s.rec.in === 'closed' && s.rec.mode === 'purge' && readings(s).residue < 0.02, video: '33:00' },
  { text: 'Arrêter le groupe, fermer le robinet rouge et les robinets obturateurs, noter la masse récupérée', hint: 'Cette masse va sur la fiche de suivi.', done: (s) => !s.rec.power && s.valves.recCylLiqValve === 0, video: '34:30' },
]
const recupCriteria: Exercise['criteria'] = [
  { text: 'Flexibles, manifold et récupérateur tirés au vide avant la récupération', ok: (s) => noFault(s, 'hoseAir', 'recAir') },
  { text: `Circuit récupéré jusqu'à ≤ ${(P_REC_DONE - P_ATM).toFixed(1)} bar relatif`, ok: (s) => pc(s) <= P_REC_DONE + 0.05 },
  { text: 'Masse récupérée ≥ 85 % de la charge, bouteille sous le maximum gravé', ok: (s) => readings(s).recovered >= acc(s).recoverMin * s.circuit.nominal && readings(s).recFill < 1 },
  { text: 'IN sur LIQUID au début, OUT jamais fermée en marche', ok: (s) => noFault(s, 'recOverload', 'recTrip') },
  { text: `Rejet ≤ ${acc({ profileId: 'lycee' } as SimState).maxRelease * 1000} g`, ok: (s) => readings(s).released <= acc(s).maxRelease },
]

// ---- Azote ----
const azoteSteps: Step[] = [
  stepPpe,
  { text: 'Azote sec type U : raccorder le jaune au détendeur, vérifier la pression bouteille (≈ 100 bar suffisent)', hint: 'De l\'azote humide saturerait le déshydrateur neuf.', done: (s) => s.n2Type === 'U' && Object.values(s.hoses).some((h) => h.a === 'n2Out' || h.b === 'n2Out'), video: '36:00' },
  { text: 'Déconnecter le vacuomètre ; raccorder rouge → voie HP et bleu → voie BP, vannes de service en lecture', hint: 'Le vacuomètre ne supporte pas la pression.', done: (s) => !vgOnCircuit(s) && hoseOn(s, 'svHP') && hoseOn(s, 'svBP') && s.sv.bp.seat !== 'back' && s.sv.hp.seat !== 'back', video: '36:30' },
  { text: 'Régler le détendeur ≈ 10 bar puis ajuster aux manos : HP et BP à la pression d\'essai', hint: 'Limites : pressostat BP 17 bar max et cadran du mano BP. 10 bar est la valeur retenue pour ce groupe.', done: (s) => Math.abs(pc(s) - P_ATM - acc(s).n2.target) <= acc(s).n2.tol, video: '37:00' },
  { text: 'Fermer la bouteille d\'azote', hint: 'La tenue en pression se juge source fermée.', done: (s) => s.valves.n2CylValve === 0 && !!s.n2Hold, video: '38:00' },
  { text: 'Moussant : commencer par le composant remplacé (brasures du déshydrateur), puis tour complet et méthodique (pressostats, détendeur en chambre froide…)', hint: 'Cliquer le groupe froid : liste des raccords. Les bulles n\'apparaissent que sous pression.', done: (s) => allJointsInspected(s) && JOINTS[s.inspectOrder[0] ?? -1]?.drier === true, video: '38:30' },
  { text: 'Réparer la fuite trouvée', hint: '« Resserrer / rebraser » sur le raccord qui bulle.', done: (s) => s.circuit.leakJoint === null },
  { text: 'Garder un œil sur les manos : pression stable (≥ 2 min, chute ≤ 0,3 bar)', hint: 'Repressuriser si nécessaire après réparation, puis refermer la bouteille.', done: n2Ok, video: '40:30' },
  { text: 'Évacuer l\'azote (inerte) : ouvrir une extrémité vers l\'atmosphère jusqu\'à ≈ 0 bar', hint: 'Astuce de la vidéo : s\'en servir pour souffler le condenseur.', done: (s) => s.n2Hold === null && pc(s) < 1.6 && !reachable(s, 'circHi').has('n2reg'), video: '41:00' },
]
const azoteCriteria: Exercise['criteria'] = [
  { text: 'Pression d\'essai dans la bande, sans dépasser la limite la plus faible', ok: (s) => noFault(s, 'overpressure', 'lpSwitchOver') && s.stepsDone.some((d, i) => d && (s.exerciseId ? EXERCISES[s.exerciseId].steps[i] === azoteSteps[3] : false)) },
  { text: 'Azote sec, vacuomètre protégé, manos intacts', ok: (s) => noFault(s, 'wetN2', 'gauge') },
  { text: 'Recherche de fuite complète, composant remplacé en premier', ok: (s) => noFault(s, 'soapOrder') && allJointsInspected(s) },
  { text: 'Fuite réparée et tenue en pression vérifiée', ok: (s) => s.circuit.leakJoint === null && n2Ok(s) },
]

// ---- Vide ----
const videSteps: Step[] = [
  stepPpe,
  { text: 'Vacuomètre : régler l\'index rouge sur la cible, le raccorder sur le port central du manifold', hint: 'À 20 °C l\'eau bout sous ≈ 23 mbar : viser ≤ 25 mbar abs (ou la cible du profil).', done: vgOnCircuit, video: '43:00' },
  { text: 'Noir du port 3/8 à la pompe ; rouge → HP et bleu → BP ; TOUTES les vannes ouvertes (pompe, manifold, vannes de service en lecture, robinets obturateurs)', hint: 'Étape très importante : parcourir le chemin et vérifier chaque vanne avant de démarrer.', done: (s) => reachable(s, 'pump').has('circLo') && reachable(s, 'pump').has('circHi'), video: '44:00' },
  { text: 'Démarrer la pompe et suivre la descente (rapide, puis de plus en plus lente)', hint: 'De 30 min à plusieurs heures en réel : utiliser ×5 / ×20.', done: (s) => s.pumpOn && reachable(s, 'pump').has('circLo'), video: '44:40' },
  { text: 'Atteindre la cible de vide', hint: 'Un palier vers 23 mbar : l\'humidité s\'évapore, continuer.', done: vacReached, video: '45:30' },
  { text: 'Isoler : fermer les vannes du manifold, retirer le vacuomètre, fermer le robinet obturateur de la pompe PUIS arrêter la pompe', hint: 'Le vide doit « bien se maintenir » : les manos restent à −1 bar.', done: (s) => !!s.vacHold && !s.pumpOn && noFault(s, 'pumpOff'), video: '46:00' },
]
const videCriteria: Exercise['criteria'] = [
  { text: 'Cible de vide atteinte', ok: (s) => vacReached(s) || s.stepsDone.some((d, i) => d && (s.exerciseId ? EXERCISES[s.exerciseId].steps[i] === videSteps[4] : false)) },
  { text: 'Circuit isolé, vide maintenu', ok: (s) => vacOk(s) || (acc(s).vac.holdS === 0 && !!s.vacHold && vacNow(s) <= acc(s).vac.target * 1.5) },
  { text: 'Robinet fermé avant l\'arrêt de la pompe, vacuomètre intact', ok: (s) => noFault(s, 'pumpOff') && !s.damaged.vg },
]

// ---- Charge ----
const chargeSteps: Step[] = [
  stepPpe,
  { text: 'Lire la plaque : fluide et charge nominale ; choisir la bouteille du bon fluide', hint: 'Cliquer le groupe froid pour lire la plaque, puis la bouteille de fluide pour choisir.', done: (s) => s.refCyl.type === s.refrigerant, video: '46:40' },
  { text: 'Bouteille sur la balance, mise à zéro ; jaune du port central au robinet de la bouteille en phase LIQUIDE (bouteille retournée)', hint: 'Glisser la bouteille sur le plateau, « Tare », puis raccorder.', done: (s) => s.scale.item === 'refCyl' && s.scale.tare > 0 && Object.values(s.hoses).some((h) => h.a === 'refCylOut' || h.b === 'refCylOut') && s.refCyl.inverted, video: '47:00' },
  { text: 'Vanne BP du manifold FERMÉE, vanne HP ouverte, voie HP en lecture : ouvrir le robinet → migration naturelle du liquide dans le réservoir', hint: 'Le liquide inonde le réservoir jusqu\'à l\'équilibre des pressions.', done: (s) => readings(s).charged > 0.05 && s.valves.manLo === 0, video: '47:40' },
  { text: 'Quand la migration s\'arrête : fermer la vanne HP du manifold, mettre sous tension (pump-down), bouteille debout (vapeur), ouvrir la vanne BP : le compresseur aspire le complément', hint: 'Surveiller le voyant du manifold : seul du gaz doit passer.', done: (s) => s.elec.power && s.valves.manHi === 0 && s.valves.manLo > 0 && readings(s).charged > 0.5 * s.circuit.nominal, video: '49:00' },
  { text: 'À la charge nominale : fermer très vite la vanne BP, puis le robinet de la bouteille et le robinet obturateur ; noter la masse chargée', hint: 'Fermer dès que la balance affiche la valeur.', done: (s) => Math.abs(readings(s).charged - s.circuit.nominal) <= acc(s).chargeTol && s.valves.manLo === 0 && s.valves.refCylValve === 0, video: '50:30' },
]
const chargeCriteria: Exercise['criteria'] = [
  { text: 'Fluide conforme à la plaque', ok: (s) => s.nodes.circHi.refType === s.refrigerant && !s.nodes.circHi.contaminated && !s.nodes.circLo.contaminated },
  { text: 'Masse chargée = charge nominale ± 0,05 kg', ok: (s) => Math.abs(readings(s).charged - s.circuit.nominal) <= acc(s).chargeTol },
  { text: 'Pas de coup de liquide, pas de contamination', ok: (s) => noFault(s, 'slug', 'contamination', 'vapourBlend') },
  { text: 'Rejet ≤ 20 g', ok: (s) => readings(s).released <= acc(s).maxRelease },
]

// ---- Réinjection du résidu + dépose finale, détecteur, état du poste ----
const reinjectSteps: Step[] = [
  { text: 'Réinjecter le résidu du récupérateur (interdit de le rejeter) : récupérateur raccordé au port central, vanne HP en cale arrière, vanne HP du manifold ouverte, bobine retirée, vanne BP ouverte', hint: 'Le compresseur aspire tout (groupe, manifold, flexibles) vers la BP.', done: (s) => readings(s).residue < 0.005 && s.sv.hp.seat === 'back', video: '51:20' },
  { text: 'Vers 0 bar, forcer le pressostat BP et mettre très vite la vanne BP en cale arrière', hint: '« Assez sportive » : deux ou trois entraînements suffisent.', done: (s) => s.sv.bp.seat === 'back' && pressure(s.nodes.hBlue) < 1.6, video: '53:00' },
]
const detectorSteps: Step[] = [
  { text: 'Détecteur électronique allumé, sensibilité maximale ; parcourir TOUS les raccords dans le sens du fluide, chambre froide comprise', hint: 'Partir du refoulement compresseur et suivre le circuit.', done: (s) => s.detector.on && s.detector.sensitivity === 'max' && allJointsInspected(s, s.events.find((e) => e.msg.startsWith('Filtre déshydrateur remplacé'))?.t ?? 0) && Object.values(s.inspections).every((i) => i.result === 'rien' || i.result === 'aucune'), video: '55:32' },
  { text: 'Remettre le poste en état : bouchons, presse-étoupes, flexibles rangés, courant coupé, capot du pressostat, bobine', hint: 'Rigueur et rangement sont notés.', done: (s) => tidyIssues(s).length === 0, video: '54:30' },
]
const stepReplace: Step = { text: 'Remplacer le filtre déshydrateur fuyard (circuit à 0 bar)', hint: 'Cliquer le groupe froid → « Remplacer le déshydrateur ». Uniquement circuit récupéré.', done: (s) => s.circuit.replaced, video: '35:00' }

export const EXERCISES: Record<ExerciseId, Exercise> = {
  manifold: {
    id: 'manifold', title: 'Pose et dépose des manomètres', short: 'Manifold', nature: ['maintenance'], tidy: true,
    objective: 'Poser le manifold sans faire entrer d\'air ni perdre de fluide, lire les pressions en fonctionnement, puis le déposer par pump-down sans rejet.',
    intro: 'Le groupe fonctionne normalement avec sa charge nominale. Vannes de service en cale arrière, bouchons en place, armoire hors tension.',
    setup: (s) => { s.circuit.faulty = false },
    steps: [...poseSteps, ...deposeSteps], criteria: poseCriteria,
  },
  recup: {
    id: 'recup', title: 'Récupération du fluide', short: 'Récupération', nature: ['maintenance'],
    objective: 'Tirer au vide l\'ensemble, récupérer le fluide dans la bouteille de transfert en suivant la balance, purger, noter la masse.',
    intro: 'Le déshydrateur fuit : il faut récupérer la charge avant de le remplacer. Bouteille de transfert : tare et maximum gravés.',
    setup: (s) => { recoveryCylinder(s); s.circuit.faulty = true },
    steps: recupSteps, criteria: recupCriteria,
  },
  azote: {
    id: 'azote', title: 'Mise sous pression d\'azote', short: 'Azote', nature: ['controle'],
    objective: 'Pressuriser à l\'azote sec, rechercher la fuite au moussant (composant remplacé d\'abord), réparer, vérifier la tenue.',
    intro: 'Le déshydrateur neuf vient d\'être brasé : le circuit est à l\'air. Limite d\'essai : pressostat BP et cadran BP.',
    setup: (s) => { airCircuit(s); s.circuit.faulty = true; s.circuit.replaced = true; s.circuit.leakJoint = Math.random() < 0.7 ? (Math.random() < 0.5 ? 0 : 1) : 2 + Math.floor(Math.random() * 8) },
    steps: azoteSteps, criteria: azoteCriteria,
  },
  vide: {
    id: 'vide', title: 'Tirage au vide', short: 'Vide', nature: ['maintenance'],
    objective: 'Éliminer incondensables et humidité : atteindre la cible de vide, isoler et vérifier que le vide se maintient.',
    intro: 'Test azote terminé et circuit dépressurisé : il contient de l\'air et un peu d\'humidité.',
    setup: (s) => { airCircuit(s); s.vacHold = null },
    steps: videSteps, criteria: videCriteria,
  },
  charge: {
    id: 'charge', title: 'Recharge en fluide frigorigène', short: 'Charge', nature: ['maintenance', 'mise_en_service'],
    objective: 'Charger la valeur plaque : migration naturelle du liquide côté HP, puis complément aspiré par le compresseur côté BP.',
    intro: 'Circuit tiré au vide. La plaque donne le fluide et la charge nominale.',
    setup: (s) => { vacuumCircuit(s); const other = s.refrigerant === 'R-407F' ? 'R-404A' : 'R-407F'; s.refCyl.type = other; s.nodes.refCyl.refType = other },
    steps: chargeSteps, criteria: chargeCriteria,
  },
  examen: {
    id: 'examen', title: 'Examen blanc Catégorie 1 : remplacement d\'un déshydrateur fuyard', short: 'Examen blanc', nature: ['maintenance', 'controle'], tidy: true,
    objective: 'Dérouler l\'intervention complète dans l\'ordre de l\'épreuve : pose/dépose des manos, récupération, réparation, azote, vide, recharge, réinjection du résidu, détecteur, fiche de suivi.',
    intro: 'Voyant jaune : le déshydrateur fuit. Épreuve chronométrée, sans indice.',
    setup: (s) => { recoveryCylinder(s); s.circuit.faulty = true; s.circuit.replaced = false },
    steps: [...poseSteps, ...deposeSteps, ...recupSteps.slice(1), stepReplace, ...azoteSteps.slice(1), ...videSteps.slice(1), ...chargeSteps.slice(1), ...reinjectSteps, ...detectorSteps],
    criteria: [...poseCriteria.slice(0, 4), ...recupCriteria.slice(0, 4), { text: 'Déshydrateur remplacé circuit à 0 bar', ok: (s) => s.circuit.replaced && noFault(s, 'replaceUnderPressure') }, ...azoteCriteria, ...videCriteria.slice(0, 2), ...chargeCriteria.slice(0, 3), { text: 'Résidu du récupérateur réinjecté (rien de rejeté)', ok: (s) => readings(s).residue < 0.005 && noFault(s, 'residueVented') }, { text: 'Contrôle final au détecteur, poste remis en état', ok: (s) => detectorSteps.every((st) => st.done(s)) }, { text: 'Rejet total ≤ 20 g', ok: (s) => readings(s).released <= acc(s).maxRelease }],
  },
}
export const EXERCISE_IDS: ExerciseId[] = ['manifold', 'recup', 'azote', 'vide', 'charge', 'examen']

export function applyExercise(s: SimState, id: ExerciseId) {
  EXERCISES[id].setup(s)
  s.exerciseId = id
  s.stepsDone = EXERCISES[id].steps.map(() => false)
  s.manScale = s.refrigerant
}

// ---------- Barème (sur 20) — à valider par le formateur ----------
export interface ScoreLine { code: FaultCode | 'target'; label: string; count: number; penalty: number; cause: string; check: string; fix: string }
export function livePenalty(s: SimState) {
  const counts = new Map<FaultCode, number>()
  for (const e of s.events) if (e.kind === 'fault' && e.code) counts.set(e.code, (counts.get(e.code) ?? 0) + 1)
  let p = 0
  for (const [code, n] of counts) p += Math.min(n, code === 'release' ? 3 : RUBRIC.maxPerCode) * FAULTS[code].penalty
  return Math.min(20, p)
}
export function score(s: SimState, ex: Exercise, docErrors: string[]) {
  const counts = new Map<FaultCode, number>()
  for (const e of s.events) if (e.kind === 'fault' && e.code) counts.set(e.code, (counts.get(e.code) ?? 0) + 1)
  const lines: ScoreLine[] = []
  for (const [code, n] of counts) { const f = FAULTS[code]; lines.push({ code, label: f.label, count: n, penalty: Math.min(n, code === 'release' ? 3 : RUBRIC.maxPerCode) * f.penalty, cause: f.cause, check: f.check, fix: f.fix }) }
  if (ex.tidy) { const issues = tidyIssues(s); if (issues.length) lines.push({ code: 'untidy', label: FAULTS.untidy.label, count: issues.length, penalty: Math.min(3, Math.ceil(issues.length / 2)), cause: issues.join(' · '), check: FAULTS.untidy.check, fix: FAULTS.untidy.fix }) }
  const success = ex.criteria.every((c) => c.ok(s))
  if (!success) lines.push({ code: 'target', label: FAULTS.target.label, count: 1, penalty: FAULTS.target.penalty, cause: FAULTS.target.cause, check: FAULTS.target.check, fix: FAULTS.target.fix })
  if (docErrors.length) lines.push({ code: 'doc', label: FAULTS.doc.label, count: docErrors.length, penalty: Math.min(RUBRIC.maxDoc, docErrors.length) * FAULTS.doc.penalty, cause: docErrors.join(' · '), check: FAULTS.doc.check, fix: FAULTS.doc.fix })
  const total = Math.max(0, 20 - lines.reduce((a, l) => a + l.penalty, 0))
  return { total, lines, success }
}

// ---------- Documents : fiche de suivi (lycée) ou Cerfa 15497 ----------
export function expectedDoc(s: SimState, ex: Exercise) {
  const r = readings(s)
  const leakDone = Object.keys(s.inspections).length > 0 || !!s.n2Hold
  return {
    fluide: s.refrigerant, chargeNominale: s.circuit.nominal, teqCO2: (s.circuit.nominal * PROPS[s.refrigerant].gwp) / 1000,
    nature: ex.nature, controle: leakDone ? 'oui' : 'non', resultat: s.circuit.leakJoint === null ? 'absence' : 'fuite',
    chargee: Math.max(0, r.charged), recuperee: Math.max(0, r.recovered), detecteurRequis: ex.id === 'examen', depannage: ex.id === 'examen' || ex.id === 'recup' || ex.id === 'azote',
  }
}
export function checkDoc(form: Record<string, string>, exp: ReturnType<typeof expectedDoc>, template: 'fiche' | 'cerfa') {
  const errs: string[] = []
  const num = (k: string) => parseFloat((form[k] ?? '').replace(',', '.'))
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(tol, 0.05 * b)
  if (form.fluide !== exp.fluide) errs.push(`Fluide : ${form.fluide || '—'} au lieu de ${exp.fluide}`)
  if (!near(num('chargeNominale'), exp.chargeNominale, 0.05)) errs.push(`Charge nominale : ${form.chargeNominale || '—'} kg au lieu de ${exp.chargeNominale.toFixed(2)} kg`)
  if (!near(num('chargee') || 0, exp.chargee, 0.05)) errs.push(`Quantité chargée : ${form.chargee || '0'} kg au lieu de ${exp.chargee.toFixed(2)} kg`)
  if (!near(num('recuperee') || 0, exp.recuperee, 0.05)) errs.push(`Quantité récupérée : ${form.recuperee || '0'} kg au lieu de ${exp.recuperee.toFixed(2)} kg`)
  if (template === 'fiche') {
    if (exp.detecteurRequis && !(form.detecteur ?? '').trim()) errs.push('Type / référence du détecteur non renseignés')
    if (exp.depannage && !/d[ée]pannage|filtre|d[ée]shydrateur/i.test(form.nature ?? '')) errs.push('Nature de l\'intervention : indiquer « Dépannage – filtre déshydrateur »')
    if (!(form.eleve ?? '').trim()) errs.push('Nom de l\'élève manquant')
  } else {
    if (!near(num('teqCO2'), exp.teqCO2, 0.05)) errs.push(`Charge en teq CO2 : ${form.teqCO2 || '—'} au lieu de ${exp.teqCO2.toFixed(3)}`)
    const natures = (form.nature ?? '').split(',').filter(Boolean)
    if (!exp.nature.some((n) => natures.includes(n)) || (exp.nature.includes('controle') && !natures.includes('controle'))) errs.push('Nature de l\'intervention incohérente avec l\'exercice')
    if (form.controle !== exp.controle) errs.push(`Contrôle d'étanchéité : ${form.controle || '—'} (attendu : ${exp.controle})`)
    if (exp.controle === 'oui' && form.resultat !== exp.resultat) errs.push(`Résultat du contrôle : attendu « ${exp.resultat === 'absence' ? 'absence de fuite' : 'fuite détectée'} »`)
  }
  return errs
}
export const _internal = { pAir }
