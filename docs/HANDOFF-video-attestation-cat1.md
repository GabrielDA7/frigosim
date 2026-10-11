# Handoff — FrigoSim × the Category 1 practical exam video

> **For the next agent.** This document describes a one-hour training video showing the full **Category 1 attestation d'aptitude practical exam** for refrigerant handling (cold-room condensing unit, replacing a leaking filter-drier). The video is the reference: **FrigoSim must prepare apprentices to pass exactly this practical exam.** It goes from what the exam looks like, to what FrigoSim already covers, to the gaps, to a prioritized backlog with file pointers.
>
> - Source: `~/Desktop/FLUIDES FRIGORIGÈNES _ ATTESTATION D'APTITUDE CATÉGORIE 1 formation pratique complète ( 1 heure )..mp4` (61 min, 640×360, French).
> - Full timestamped transcript: `docs/video-cat1-transcript.txt`. It was produced by automatic speech recognition (Whisper small), so expect wrong words such as "présoctat" for pressostat or "pointo" for pointeau. The final 3 minutes (leak detector + paperwork) are mostly lost to ASR loops, so they were reconstructed from frames.
> - Simulator: `frigosim/` (Next.js 16 + R3F). Read `frigosim/AGENTS.md` before touching code. **This Next.js has breaking changes.**
> - Everything below marked **[trainer]** must be validated by a qualified trainer before use in assessment.

---

## 1. What the video is

A teacher at a lycée professionnel (the paperwork is a "fiche de suivi de l'installation" from the lycée Raspail) walks a candidate through the **complete practical exam scenario**:

> *Remplacement d'un filtre déshydrateur fuyard* on a positive cold room with a hermetic condensing unit, a liquid receiver with an HP service valve, a filter-drier, sight glass, solenoid valve, TEV and evaporator inside the cold room, and KP-type HP/BP pressure switches.

Opening slide, which is the exam's own sequence:

1. Pose et dépose du manifold
2. Récupération du fluide frigorigène
3. Réparation de la panne
4. Mise sous pression d'azote
5. Tirage au vide
6. Recharge en fluide frigorigène
7. Recherche de fuite (électronique)
8. *(implicit)* Fiche de suivi / documentation

The tone is **coaching for an exam**. The teacher repeatedly names what *candidates* get wrong, replays key gestures in slow motion "pour bien fixer ce geste professionnel", and insists on workstation organization and rigour. That is the pedagogy FrigoSim should reproduce.

### Installation used in the video

| Item | Value in the video | FrigoSim today |
|---|---|---|
| Unit | Hermetic condensing unit, wall-mounted, positive cold room | Same (`Scene.tsx`) ✔ |
| Refrigerant (nameplate) | **R-407F, 1.1 kg**. R-404A is used as an example for cylinder capacity | R-134a / R-32 / R-410A, 1.50 kg ✘ |
| Service valves | 3-position steel service valves (*cale arrière / lecture / cale avant*) with **presse-étoupe**, cap and Schrader-less gauge port: one on the **liquid receiver (HP)**, one on the **compressor suction (BP)** | Rotalock valves modelled as 0–1 openings ✘ |
| Pressure switches | Combined HP/BP KP; **BP pressostat max operating pressure 17 bar** limits the N₂ test | KP1 / KP5 modelled ✔, no max-pressure constraint on BP side ✘ |
| Recovery unit | Promax **MiniMax**: IN valve with **LIQUID / OPEN / CLOSED**, mode knob **RECOVER / PURGE**, OUT valve | Generic recovery unit after the Fieldpiece MR45 (no LIQUID position on IN) ~ |
| Recovery cylinder | Yellow (or green) transfer cylinder: **red = liquid (dip tube), blue = vapour**, **tare stamped (7.2 kg)**, max fill stamped per fluid (e.g. R-404A 10 kg) | Tare 10 kg, water capacity 12.3 L, 80 % rule ✔ (no stamped per-fluid max) ~ |
| Scale | Electronic precision scale, zeroed before each transfer | ✔ |
| Nitrogen | **Dry nitrogen (type U)**, cylinder at ~100 bar, regulator with outlet gauge, cylinder chained | ✔ (`n2reg`), no "dry N₂" choice ✘ |
| Vacuum gauge | Needle vacuometer in **mbar abs** with a red set-pointer, plus an electronic vacuum gauge; connected by an extra hose on the manifold's **Schrader service port** | Electronic, microns/mbar ✔, connection point ~ |
| Leak detection | Soap solution (PrestoBul) under N₂; **electronic detector** with reference recorded on the paperwork | ✔ both, but only 4 joints ~ |
| Paperwork | Lycée "fiche de suivi de l'installation": date, class, student, fluid, nominal charge, quantities handled, nature of intervention, **detector type/ref**, final state, name/signature | Cerfa 15497*04 training version ~ |

---

## 2. The exam procedure, step by step (as shown)

Timestamps refer to the video. **Bold** marks the checks the teacher explicitly calls out. These are the behaviours FrigoSim should detect and score.

### 2.1 Understand the installation — 00:56 → 07:28

- Schematic: 1 compressor, 2 condenser, 8 liquid receiver, 7 filter-drier (the part to replace), 6 sight glass, 5 solenoid valve, 4 TEV, 3 evaporator, 9 HP/BP pressure switch; the two service valves are marked **H** with green arrows.
- Tour of the real unit following the refrigerant flow. The insulated pipe is the BP vapour line.
- **Service valve anatomy:** (1) permanent pressure port for the pressure switches, (2) gauge port, (3) refrigerant inlet, (4) mounting nut, (5) pointeau, (6) carré de manœuvre, (7) **presse-étoupe**.
- **Three positions:** *cale arrière* (back-seated, gauge port isolated), *lecture* (mid, gauge port open, flow passes), *cale avant* (front-seated, line closed). Counter-clockwise moves to the back seat and clockwise moves forward.
- **Always loosen the presse-étoupe before turning the stem, then re-tighten it.**

### 2.2 Tools and preparation — 07:28 → 09:20

- **Vacuum pump oil level between MIN and MAX**, degassing cap open.
- Tools: 11 mm flat spanner (presse-étoupe), ratchet spanner (carré de manœuvre), adjustable spanner (caps), flat screwdriver.
- **Zero the gauges** with the screwdriver. In the video the BP gauge was not at zero.
- **Every hose has a shut-off valve (robinet obturateur) at its end.**
- **PPE:** gloves (HP side is very hot, BP side very cold, burn risk) and safety glasses.

### 2.3 Pose des manomètres (connecting the manifold) — 09:20 → 14:28

1. Remove the stem cap, **check the valve is on the back seat**, and only then remove the gauge-port cap.
2. **Put all caps in one place** so none get lost.
3. Connect the red hose to the HP service valve (on the receiver), tighten firmly, open the hose shut-off and the manifold HP valve. Do the same with the blue hose on the BP valve.
4. **Evacuate the hoses before opening onto the circuit.** Connect the yellow hose to the vacuum pump and run it until both gauges read **−1 bar**.
5. **Close the yellow hose shut-off before stopping the pump.** Remove the yellow hose with its shut-off closed, or the vacuum is lost.
6. **Close the manifold HP and BP valves.** *"Cela arrive très souvent que des candidats les laissent ouvertes"*: if they stay open, HP liquid reaches the compressor suction, which is dangerous.
7. Open the service valves: loosen the presse-étoupe, turn the stem clockwise to *lecture*, then re-tighten the presse-étoupe. Do BP first, then HP. **Use the 11 mm spanner, not multigrip pliers.**

### 2.4 Start-up and measurements — 14:28 → 15:24

- Plug in the three-phase supply, switch the **sectionneur from 0 to 1**, **check that every circuit valve is open**, and choose the control mode: **pump-down or thermostatic**.

### 2.5 Dépose des manomètres (disconnecting without losing refrigerant) — 15:24 → 18:40

1. **Always start with the HP side.** Back-seat the HP service valve (loosen the presse-étoupe, turn to the back seat, re-tighten).
2. Open the manifold HP valve so the red hose drains toward the suction.
3. **Close the liquid outlet valve** so the compressor pumps the BP side and the hoses down.
4. Open the manifold BP valve. Both pressures fall.
5. Near 0 bar, **force the BP pressostat** (contact no. 3) so the compressor keeps running.
6. **At 0 bar, back-seat the BP service valve.**
7. Re-tighten the presse-étoupes, refit the caps by hand, then finish with a moderate turn of the adjustable spanner (**no multigrip pliers**).

### 2.6 Recovery — 18:40 → 35:56

1. Organize the workstation: the space is tight and there is a lot of equipment.
2. Connect the red and blue hoses as in 2.3, **again checking the back seat before removing each cap**. This gesture is replayed in slow motion twice.
3. **Evacuate the hoses, the manifold and the recovery unit together.** The yellow hose goes to the recovery unit's IN, and a fourth hose runs from the unit to the vacuum pump with **its shut-off on the pump side**. Walk the whole path and open every valve (pump, OUT on open, mode RECOVER, IN on open, manifold HP/BP, hose shut-offs). The service valves stay back-seated. Run until −1 bar. **Close the hose shut-off first, then stop the pump.**
4. Recovery cylinder: red is liquid (dip tube) and blue is vapour. **Read the stamped tare (7.2 kg) and the maximum fill for this fluid** (e.g. R-404A 10 kg, so 17.2 kg gross at most). An overfilled cylinder left in a hot car can explode.
5. Put the cylinder on the scale and connect the recovery unit's OUT to the **red (liquid)** valve. Open the cylinder valve and the hose shut-off. **Note the starting mass, then don't touch the cylinder.**
6. **Open all circuit valves.** With the cabinet de-energised the **solenoid valve is closed**, so **remove its coil and fit a permanent magnet** to open it.
7. Open the service valves a quarter turn (loosen the presse-étoupe first), then the hose shut-offs and the manifold HP and BP valves.
8. Recovery unit settings: **IN on LIQUID at first** (most of the incoming refrigerant is liquid and would overload the unit), **OUT on OPEN** (never CLOSED in operation, or the unit trips on safety), mode **RECOVER**.
9. **Tare (zero) the scale**, then power on and press start.
10. Watch the scale rise and the gauges fall. Once only vapour is arriving, switch **IN from LIQUID to OPEN** to speed things up.
11. At 0 bar (circuit gauges and the recovery unit's BP gauge), close the inlet hose shut-off and switch to **PURGE** with IN **CLOSED**. In the video purge added 18 g (452 g → **480 g recovered**).
12. A small quantity remains in the unit. **It must be reinjected into the circuit at the end of the job, never vented.**
13. Stop the unit, close the cylinder's red valve and the hose shut-off. **Record the recovered mass (480 g) for the fiche de suivi.**
14. The circuit can now be opened for the repair (the drier is replaced and brazed off-camera).

### 2.7 Nitrogen pressure test — 35:56 → 41:32

1. Use **dry nitrogen (type U)**. Wet nitrogen would put moisture into a brand-new drier.
2. Connect the yellow hose to the N₂ regulator and **check the cylinder pressure (~100 bar is enough)**.
3. Set the regulator to **≈ 10 bar**, then fine-tune using the circuit gauges (HP 8 bar → 10 bar; BP should read the same).
4. **Pressure limits:** the **BP pressostat maximum operating pressure (17 bar)** and the **BP gauge dial**, which the needle can damage if exceeded. The rigorous rule is HP test pressure at maximum condensing pressure and BP test pressure at maximum evaporating pressure. 10 bar is an accepted approximation for a small unit. **[trainer]**
5. **Close the N₂ cylinder.**
6. Soap test: **start with the replaced component** (drier brazes), then do a **complete, methodical tour** of every flare nut and braze, including both pressostat connections and the **TEV inside the cold room**.
7. **Keep an eye on the gauges.** If the pressure hasn't dropped from 10 bar, the circuit is tight.
8. Vent the nitrogen (it is inert: air is 79 % N₂). Tip: use it to blow-clean the condenser.

### 2.8 Vacuum — 41:32 → 46:40

1. Purpose: remove non-condensables **and moisture**. Moisture only boils off if the pressure is below water's saturation pressure at ambient temperature.
2. **Target from the saturation curve: at 20 °C ambient, ≤ ~25 mbar abs.** Lower is better. **[trainer]**
3. Needle vacuometer: set the **red pointer to the target**. At rest it reads ~1 bar (atmospheric). Connect it with an extra hose to the **Schrader port on the manifold's service port**.
4. **Very important step: check that every valve is open** (pump, vacuometer valve, manifold HP/BP, all circuit valves, hose shut-offs on the service valves). Then start the pump.
5. The pressure drops quickly, then slower and slower (250 mbar … 25 mbar). **It can take from 30 minutes to several hours.**
6. Once the target is reached, close the manifold HP and BP valves, remove the vacuometer hose (the Schrader seals), **close the pump hose's shut-off, then stop the pump**, and refit the service-port cap.
7. In this video there is **no timed vacuum-hold test**: the target is reached, the circuit is isolated, and the vacuum is "bien maintenu" at the start of charging (gauges still at −1 bar). **[trainer]**

### 2.9 Charging — 46:40 → 51:20

1. **Charge = nameplate value: 1.1 kg R-407F.**
2. Connect the yellow hose to the transfer cylinder's **red (liquid)** valve, **zero the scale**, then open the hose shut-off and the cylinder valve.
3. **Close the manifold BP valve.** Charge **by natural migration on the HP side, into the liquid receiver**. Open the red hose's shut-off sharply and the refrigerant floods the receiver.
4. Migration stops when pressures equalise (**152 g short** of 1.1 kg in the video).
5. Top-up trick: energise the cabinet in **pump-down mode** and start the compressor. **Close the manifold HP valve and open the BP valve**, so the compressor **draws vapour** from the cylinder. Watch the manifold sight glass: only gas should pass (no "coup de liquide").
6. **At 1.1 kg, close the manifold BP valve very quickly**, then the cylinder valve and the hose shut-off. **Record the charged mass.**
7. ⚠ **[trainer]** R-407F is a **zeotropic blend**. The video finishes the charge in vapour from the cylinder. FrigoSim currently penalizes `vapourBlend`. Decide which rule the exam centre applies (e.g. liquid laminated through the BP valve vs. a small vapour top-up) and make the simulator consistent with it.

### 2.10 Reinjecting the recovery unit's residue + final gauge removal — 51:20 → 55:32

1. **Venting is forbidden.** Connect the recovery unit's hose to the manifold service port (a Schrader, so it is safe to open. **"Know your equipment"**).
2. **Back-seat the HP service valve** (very important), open the manifold HP valve and the recovery unit's shut-off, and **close the liquid outlet valve** (or remove the solenoid coil).
3. Open the manifold BP valve. The compressor draws everything (recovery unit, manifold, hoses) into the BP side.
4. Near 0 bar the BP pressostat cuts out, so **force it** and **back-seat the BP valve very quickly**. *"Assez sportive… avec deux ou trois entraînements vous allez très facilement réussir."* This is exactly the kind of timed gesture a simulator can train.
5. Re-tighten the presse-étoupes, disconnect the hoses, refit the caps (moderate tightening), refit the black stem caps.
6. Disconnect the last hose, cap the service port, put the manifold away. **Cut the power and refit the HP/BP pressostat cover.**
7. *"Il y a un gros travail sur l'organisation du poste de travail… extrêmement rigoureux sur le rangement de vos outils."*

### 2.11 Electronic leak detection — 55:32 → 59:00

- Switch the detector on and set the **sensitivity to maximum**.
- Follow the **refrigerant flow direction** from the compressor discharge, over **every braze and every flare**, including the newly replaced drier and the **parts inside the cold room**.
- **The detector's reference/type must be recorded** on the paperwork.

### 2.12 Paperwork — 59:00 → end

The fiche de suivi is filled in on camera: date · class · student · **fluid type** · **nominal charge (1.1)** · **quantities handled (récup. 0.48 kg, charge 1.1 kg)** · **nature of intervention ("Dépannage – filtre D")** · **detector type/ref** · final state · trainer name and signature.

---

## 3. Gap analysis: FrigoSim vs the exam

Legend: ✔ covered · ~ partly · ✘ missing. "Where" points at the code to change.

| # | Exam behaviour (video) | Status | Where |
|---|---|---|---|
| G1 | **3-position service valves** (back seat / reading / front seat), presse-étoupe loosen/tighten, caps removed and refitted; gauge port only open when *not* back-seated | ✘ (svLo/svHi/svLiq are 0..1) | `lib/sim.ts` `VALVES`, `PORTS`, edges; `Simulator.tsx` valve UI; `Scene.tsx` |
| G2 | **Back-seat check before removing the gauge-port cap** (shown twice in slow motion) | ✘ | new fault `capUnderPressure` |
| G3 | **Hose shut-off valves** at each hose end; **hose evacuation to −1 bar before opening onto the circuit** | ✘ (`openEnd` only) | `HOSES`, new valves `hoseRed/hoseBlue/hoseYellow/...`; new fault `hoseAir` (air pushed into circuit) |
| G4 | **Manifold HP/BP valves left open after hose evacuation**, the candidates' most common error | ✘ | fault `manifoldLeftOpen` when opening service valves with manifold valves open |
| G5 | **Pose / dépose des manomètres** as its own exercise, incl. **pump-down removal**: HP side first, close liquid outlet, force KP1, back-seat at 0 bar | ✘ | `lib/exercises.ts` new `manifold` exercise; `sim.ts` action `forceLP` |
| G6 | Tool prep: **pump oil level**, **gauge zero adjustment**, right tool (11 mm spanner, no multigrip pliers), caps centralised | ✘ | a "préparation du poste" checklist step + random "BP gauge not zeroed" state |
| G7 | Electrical: plug, **sectionneur 0/1**, control mode **pump-down vs thermostatic**; cut power and refit the pressostat cover at the end | ~ (comp on/off) | `sim.ts` `power`, `regMode`; UI |
| G8 | **Solenoid valve closed when de-energised → coil off + permanent magnet** for recovery/vacuum/charge | ✘ (`evr` defaults to 1) | `evr` = f(power, coil, magnet) |
| G9 | Recovery unit **IN valve LIQUID → OPEN**; whole path evacuated together; OUT never CLOSED in operation | ~ (OUT trip ✔) | `rec` state, `recInValve` positions |
| G10 | **Stamped cylinder tare + max fill per fluid**; note the starting mass | ~ | `recCyl`, `Simulator.tsx` cylinder panel |
| G11 | **Reinject the recovery unit's residue** into the circuit at the end; venting forbidden | ✘ | step in `recup`/`complet`; residue node in `recUnit` |
| G12 | N₂ test pressure **bounded by the BP pressostat's max operating pressure (17 bar) and the gauge dial**, not only nameplate PS; check cylinder pressure; **dry N₂** | ~ (30 bar vs PS 32) | `ACCEPT.testTarget`, `maxTest`; add `lpSwitchMax`; scenario parameter **[trainer]** |
| G13 | Soap test order: **replaced part first**, then a complete methodical tour **incl. the TEV inside the cold room** | ~ (4 joints, fixed leak at joint 2) | `JOINTS` → full joint list incl. drier brazes, pressostat flares, TEV; randomized leak |
| G14 | Vacuum target from the **water saturation curve vs ambient** (25 mbar @ 20 °C), needle gauge with set-pointer, gauge on the manifold Schrader | ~ (500 µ + 2 min hold) | `ACCEPT.vac*` → exam-profile driven; show the curve in the debrief **[trainer]** |
| G15 | Charge: **liquid migration into the receiver with BP closed**, then **compressor top-up through BP**, close fast at target | ~ (methods exist) | `chargeSteps`; allow the two-phase method; resolve the R-407F blend rule **[trainer]** |
| G16 | Refrigerants used on cold-room exams: **R-407F, R-404A** (and likely R-448A/R-449A) | ✘ | `lib/refrigerants.ts`: add tables with CoolProp, same method as existing |
| G17 | Nominal charge **1.1 kg**, varied per scenario | ~ (fixed 1.5) | `circuit.nominal` from scenario |
| G18 | Electronic leak test: **max sensitivity, follow flow direction, every joint**, **detector ref recorded** | ~ | `stepLeakRef`; detector settings; paperwork field |
| G19 | **Fiche de suivi** (lycée format) incl. detector ref, nature "Dépannage", quantities handled | ~ (Cerfa variant) | `components/Cerfa.tsx` + `checkCerfa` → add "Fiche de suivi" template |
| G20 | Workstation organization and putting tools away are explicitly assessed | ✘ | "rangement" checks at the end (caps refitted, hoses disconnected, power off, cover refitted) |
| G21 | Physical realism of time (vacuum 30 min to hours) | ✔ speed ×1/×5/×20 | keep, and expose "temps réel estimé" in the debrief |

---

## 4. Pedagogy to carry into FrigoSim

What the teacher does, and how to translate it. These are design rules, not features to bolt on.

1. **Mirror the exam sequence exactly.** Add an **"Examen blanc Catégorie 1"** scenario that chains §2.3 → §2.12 in the video's order, with the same equipment and the same paperwork. Apprentices should arrive at the real exam having already done this run several times.
2. **Part-task first, then the whole task.** The video is split into chapters, each a self-contained gesture sequence. Keep the existing per-operation exercises, add **"Pose/dépose du manifold"** (G5), and unlock the full exam once each part has been passed in guided mode.
3. **Name the frequent candidate errors and make them happen.** Each error the teacher calls out (manifold valves left open, cap removed without a back-seat check, pump stopped before the hose valve is closed, OUT valve closed, vented residue, multigrip pliers) becomes a **detectable fault** with a short cause/check text. `FAULTS` already has this shape: extend it.
4. **"Fixer le geste professionnel": replay.** The teacher replays critical gestures in slow motion. Add a **debrief replay** of the apprentice's own actions at the moment a fault was raised (the action log already exists in `s.events`), shown next to the correct sequence.
5. **Faded guidance.** Keep the three modes but make them progressive: *Pratique guidée* (steps + hints), then *Entraînement* (steps visible, hints cost points, no step list after the first run), then *Examen blanc* (no steps, no hints, timed, paperwork required). The current `assessment` mode is already close to the last one.
6. **Predict before acting.** At key moments, ask one quick question before the action takes effect, e.g. "Que va indiquer le mano HP si j'ouvre la vanne de service maintenant ?" or "Quelle dépression viser à 22 °C ?". This forces the apprentice to read the gauges, which the teacher insists on ("gardez un œil sur vos manomètres").
7. **Teach the why with the curve.** For the vacuum, show the **water saturation curve** with the current ambient temperature and the apprentice's reached pressure plotted on it, as the video does. The same goes for the N₂ limit: show which component sets the maximum (pressostat BP 17 bar, gauge dial, nameplate PS).
8. **Randomize what the exam randomizes.** Vary the fluid, nominal charge, ambient temperature, which joint leaks, whether a gauge is off zero, and whether the solenoid coil is energised. That way the apprentice learns the procedure, not one memorized path.
9. **Timed, "sportive" sequences.** The final pump-down (force KP1, back-seat at 0 bar) is a timing skill. Score it on outcome (refrigerant left in the hoses, in grams) and let apprentices retry just that segment.
10. **Paperwork is part of the gesture.** Require the fiche de suivi at the end of every full run. Pre-fill nothing. Compare every field against the simulation's own measurements (already done by `checkCerfa`; extend it for G19).
11. **Rigour and workstation scoring.** Add a final "état du poste" checklist: caps refitted (stem and port), hoses removed, manifold put away, power cut, pressostat cover refitted, cylinders closed. These are easy wins and are explicitly assessed.

---

## 5. Prioritized backlog

**P0: required to rehearse the exam shown**

1. **3-position service valves + presse-étoupe + caps** (G1, G2). Model `svLo`/`svHi` as `{ seat: 'back' | 'read' | 'front', gland: 'tight' | 'loose', cap: boolean, portCap: boolean }`. The gauge port connects to the circuit only when `seat !== 'back'`; flow is blocked when `seat === 'front'`. Turning the stem with the gland tight raises a `gland` fault. Removing the port cap when not back-seated raises a `capUnderPressure` fault plus a release.
2. **Hose shut-off valves + hose evacuation** (G3, G4). Hoses gain an end valve. Air in a hose that is opened onto the circuit adds non-condensables, raising a `hoseAir` fault. Opening a service valve while the manifold HP/BP valves are open raises `manifoldLeftOpen`.
3. **New exercise `manifold`: pose/dépose des manomètres** (G5, G7) with pump-down removal. Needs actions `power`, `regMode: 'pumpdown' | 'thermostat'`, `forceLP`, and `liquidValve` (the existing `svLiq`).
4. **Solenoid coil/magnet** (G8). `evr` is open iff (power && regulation calls) || magnet fitted.
5. **Exam profile** (`lib/examProfiles.ts`): one object per exam centre holding the fluid, nominal charge, N₂ test pressure rule, vacuum criterion (mbar from curve vs microns + hold), blend charging rule, and paperwork template. `ACCEPT` reads from the active profile. Ship a "Lycée – vidéo Cat. 1" profile with R-407F, 1.1 kg, N₂ 10 bar (BP pressostat 17 bar, BP dial limit), vacuum ≤ 25 mbar @ 20 °C, and the fiche de suivi. **[trainer]**
6. **Examen blanc Cat. 1** scenario (§4.1) chaining all steps plus residue reinjection (G11) plus the final état du poste (G20).

**P1: fidelity and feedback**

7. Add R-407F and R-404A (then R-448A/R-449A) to `refrigerants.ts` with CoolProp bubble/dew tables, GWP and blend flags (G16).
8. Recovery unit IN valve `closed | liquid | open` (liquid = restricted flow; open while liquid is still arriving raises an "overload" warning) and a stamped cylinder tare/max per fluid (G9, G10).
9. Full joint list (drier brazes ×2, pressostat flares ×2, receiver valve, suction Rotalock, TEV inside the cold room, etc.), a random leak, and soap-test order scoring (replaced part first) (G13, G18).
10. Vacuum debrief with the water saturation curve and ambient temperature; needle-gauge set-pointer UI (G14).
11. Fiche de suivi template plus detector ref field in `Cerfa.tsx` / `checkCerfa` (G19).
12. Tool-prep checklist: pump oil level, gauge zero (randomly off), tool choice (G6).

**P2: pedagogy layer**

13. Debrief replay of the action log at each fault (§4.4).
14. Prediction prompts (§4.6), per-segment retry for timed sequences (§4.9), progressive modes (§4.5).
15. Link each fault's `check` text to the matching video timestamp (table in §2) so a trainer can show the reference gesture.

---

## 6. Acceptance checks for the next agent

- Extend `frigosim/lib/selfcheck.ts` for every new behaviour (pattern: build state → dispatch actions → `assert`). At minimum:
  - removing a port cap while not back-seated produces a release and a fault;
  - pose sequence with hose evacuation leaves `air ≈ 0` in the circuit, and without evacuation `hoseAir` fires;
  - pump-down removal ends with hoses at ≈ 0 bar and < 5 g released;
  - with power off and no magnet, the solenoid valve blocks the liquid line;
  - the profile switch changes `ACCEPT` thresholds and the paperwork template;
  - mass conservation still holds for every new path.
- `npx tsx lib/selfcheck.ts` must pass, and `npm run build` must succeed.
- Keep the UI in **French** and reuse the vocabulary of the video (*cale arrière, cale de lecture, cale avant, presse-étoupe, carré de manœuvre, robinet obturateur, voie de service, bouteille de transfert, migration naturelle, forcer le pressostat BP, fiche de suivi*).
- Don't present any threshold as regulatory. Keep every **[trainer]** item configurable and labelled "à valider par le formateur".
