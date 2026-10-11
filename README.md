# FrigoSim — préparation à l'épreuve pratique Catégorie 1 (attestation d'aptitude)

Simulateur 3D (Next.js 16, React Three Fiber) qui reproduit l'épreuve pratique décrite dans `docs/HANDOFF-video-attestation-cat1.md` : **remplacement d'un filtre déshydrateur fuyard** sur un groupe de condensation de chambre froide positive. Pose / dépose des manomètres (vannes de service 3 positions, presse-étoupe, bouchons, tirage au vide des flexibles, dépose par pump-down), récupération (IN LIQUID → OPEN, purge, bouteille de transfert gravée), azote sec (limite pressostat BP), tirage au vide (cible mbar vs température), recharge (migration naturelle puis complément compresseur), réinjection du résidu, détecteur, état du poste, fiche de suivi. Interface en français, vocabulaire de la vidéo.

* **Toutes les commandes sont sur les objets 3D** : cliquer un élément ouvre sa fenêtre de commandes (vanne de service, électrovanne, pressostats, manifold, récupérateur…). Les embouts de flexibles se saisissent et s'aimantent sur les raccords ; chaque embout a son robinet obturateur.
* **Pédagogie** : étape courante + indice (avec minutage vidéo), carte d'erreur au centre (pourquoi, le bon geste, « revenir avant l'erreur »), score en direct, fluide visible (gouttes animées, niveaux), bilan avec critères et barème, fiche à remplir et vérifiée.
* **Profils d'examen** (`lib/profiles.ts`) : « Lycée · examen Cat. 1 » (R-407F 1,1 kg, N₂ 10 bar / pressostat BP 17 bar, vide ≤ 25 mbar, fiche de suivi) et « Standard · Cerfa 15497 » (R-134a 1,5 kg, 30 bar, 500 µ + tenue). Tout est **à valider par le formateur**.

```bash
npm install
npm run dev        # http://localhost:3000
npx tsx lib/selfcheck.ts   # auto-vérification du modèle physique et des gestes de l'examen
```

## Installation en une fois avec Claude Code (Windows, sans rien d'installé)

1. Ouvrir **PowerShell** (touche Windows, taper « PowerShell », Entrée) et coller cette ligne pour installer Claude Code, puis Entrée :

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

2. Fermer puis rouvrir PowerShell, taper `claude`, Entrée, et se connecter avec son compte Claude quand le navigateur s'ouvre.
3. Coller le prompt ci-dessous dans Claude Code et appuyer sur Entrée. Accepter les demandes d'autorisation (touche `y` ou « Yes »). À la fin, le simulateur s'ouvre dans le navigateur.

```text
Tu es sur un PC Windows où rien n'est installé. Installe et lance le simulateur FrigoSim (dépôt GitHub https://github.com/GabrielDA7/frigosim) de bout en bout, sans me poser de questions sauf blocage réel, en expliquant chaque étape en une phrase simple en français.

1. Vérifie si `git` et `node` (version 20 ou plus) sont disponibles. Sinon installe-les avec winget : `winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements` puis `winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements`. Si winget n'existe pas, télécharge et lance les installateurs officiels (git-scm.com et nodejs.org LTS) en mode silencieux. Après installation, ouvre un nouveau shell ou recharge le PATH (`$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`) et vérifie `git --version` et `node --version`.
2. Clone le dépôt dans le dossier Documents : `git clone https://github.com/GabrielDA7/frigosim "$HOME\Documents\frigosim"` (si le dossier existe déjà, fais `git pull` dedans).
3. Dans ce dossier, lance `npm install` puis `npm run build` pour vérifier que tout compile.
4. Lance `npm run dev` en arrière-plan (il doit rester actif), attends que http://localhost:3000 réponde, puis ouvre cette adresse dans le navigateur par défaut avec `Start-Process http://localhost:3000`.
5. Explique-moi en trois phrases comment m'en servir : cliquer un élément pour ses commandes, glisser les embouts de flexibles sur les raccords, suivre l'étape affichée en bas à gauche. Précise que pour relancer plus tard il suffit d'ouvrir PowerShell, taper `cd $HOME\Documents\frigosim` puis `npm run dev`, et d'ouvrir http://localhost:3000.
```

## Contenu

| Dossier | Rôle |
|---|---|
| `lib/refrigerants.ts` | Tables de saturation R-134a / R-32 / R-410A (bulle et rosée) **générées avec CoolProp 6.6** par pas de 5 K, PRG, masses volumiques |
| `lib/sim.ts` | Modèle physique : nœuds de volume (circuit BP/HP, manifold, flexibles, bouteilles, pompe, récupérateur, détendeur N2), vannes, transferts gaz/liquide, pompe à vide, compresseur avec pressostats KP1/KP5, récupérateur (arrêt auto, purge, pressostat HP), humidité, fuite, dommages instruments, catalogue de fautes, journal |
| `lib/exercises.ts` | Six exercices (pose/dépose manifold, récupération, azote, vide, recharge, examen blanc complet), seuils lus dans le profil, barème /20, vérification de la fiche de suivi / Cerfa |
| `lib/profiles.ts` | Profils d'examen (fluide, charge, règles N₂ et vide, document) |
| `components/Scene.tsx` | Atelier 3D : groupe mural écorché, chambre froide, établi (solide), équipements déplaçables (établi / sol / rail mural), flexibles animés (ressort amorti, longueur 4 m / 3 m / 1,2 m, flèche selon le mou, fluide visible), raccordement par glisser libre avec aimantation, toucher-toucher ou clavier ; niveaux de liquide visibles |
| `components/Simulator.tsx` | Barre de modes, instruments, panneau équipements (gros boutons, raccordements au clavier), consigne, courbes, bilan, score |
| `components/Cerfa.tsx` | Fiche de suivi (lycée) et fiche Cerfa 15497*04 (entraînement) |
| `components/Tour.tsx` | Visite guidée de la plateforme (première ouverture, bouton « ? ») |

## Modèle physique (simplifié, isotherme sauf circuit)

* Gaz parfaits pour l'air et la vapeur d'eau ; fluide frigorigène diphasique à P<sub>sat</sub>(T) dès que la masse dépasse la capacité vapeur du volume, gaz parfait sinon.
* Transferts entre nœuds reliés par des chemins ouverts : débit ∝ ΔP, limité à l'égalisation exacte par paire (schéma explicite stable, pas de 10 ms).
* Liquide transféré depuis les raccords « liquide » (bouteille retournée, vanne de réservoir, robinet LIQUIDE) et à travers les nœuds de transit.
* Compresseur : évaporation ≈ T<sub>amb</sub> − 30 K, condensation ≈ T<sub>amb</sub> + 25 K ; pump-down par KP1 (0,2 / 1,5 bar) ; KP5 à P<sub>sat</sub>(62 °C).
* Pompe à vide 0,1 L/s effectif, vide limite ≈ 15 microns ; humidité du circuit dégazée sous 100 mbar (palier ≈ 23 mbar).
* Récupérateur : 0,15 L/s vapeur + liquide, arrêt automatique à 0,6 bar abs (≈ −0,4 bar), mode purge, pressostat HP 39 bar — d'après le manuel Fieldpiece MR45.
* Masse de fluide strictement conservée (bouteilles ↔ circuit ↔ atmosphère) ; tout rejet est comptabilisé en grammes.

## À valider par un formateur avant usage en évaluation

* Pression d'essai 30 bar : uniquement si la PS plaque le permet (`ACCEPT.maxTest`, 32 bar pour la maquette R-134a, 45 bar pour R-32/R-410A). Daikin : ≥ 2 bar puis 30 bar, jamais au-dessus de « PS High ».
* Seuils : vide ≤ 500 microns, tenue 2 min, remontée ≤ 300 microns ; chute azote ≤ 0,3 bar / 2 min ; charge ± 0,05 kg ; récupération ≥ 90 % et ≤ 0,6 bar abs ; rejet ≤ 20 g.
* Barème `RUBRIC` / `FAULTS` (pénalités par faute, plafonds) et critères de réussite de chaque exercice.
* Limites instruments : mano BP 35 bar, HP 55 bar, vacuomètre 10 bar.
* Les durées sont simulées : vitesse ×1 / ×5 / ×20 ; l'évaluation enregistre le temps réel et le temps simulé.

Pas de photoréalisme ni de capteurs réels. Le formulaire Cerfa est une reproduction pédagogique sans valeur réglementaire.
