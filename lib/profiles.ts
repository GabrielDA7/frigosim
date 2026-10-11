import type { Refrigerant } from './refrigerants'

/** Profil d'examen : fluide, charge, règles d'essai et de vide, méthode de charge, document. Tout est À VALIDER PAR LE FORMATEUR. */
export type ProfileId = 'lycee' | 'standard'
export interface Profile {
  id: ProfileId; name: string; description: string
  refrigerant: Refrigerant; nominal: number
  n2: { target: number; tol: number; maxLP: number; maxTest: number } // bar relatif ; limite pressostat BP ; limite la plus faible du circuit
  vacuum: { unit: 'mbar' | 'micron'; target: number; holdS: number; maxRise: number } // cible dans l'unité ; tenue (0 = pas de test de tenue)
  blendVapourTopUp: boolean // complément de charge en vapeur toléré pour un mélange
  paperwork: 'fiche' | 'cerfa'
  recTare: number; recMax: Partial<Record<Refrigerant, number>> // tare et masse maximale gravées (kg)
  recCylEvacuated: boolean
}
export const PROFILES: Record<ProfileId, Profile> = {
  lycee: {
    id: 'lycee', name: 'Lycée · examen Cat. 1 (vidéo)', description: 'Groupe froid de chambre froide positive, R-407F 1,1 kg, azote sec 10 bar (pressostat BP 17 bar), vide ≤ 25 mbar à 20 °C, fiche de suivi.',
    refrigerant: 'R-407F', nominal: 1.1,
    n2: { target: 10, tol: 0.5, maxLP: 17, maxTest: 17 },
    vacuum: { unit: 'mbar', target: 25, holdS: 0, maxRise: 0 },
    blendVapourTopUp: true, paperwork: 'fiche', recTare: 7.2, recMax: { 'R-404A': 10, 'R-407F': 10, 'R-134a': 11, 'R-32': 9, 'R-410A': 10 }, recCylEvacuated: true,
  },
  standard: {
    id: 'standard', name: 'Standard · Cerfa 15497', description: 'R-134a 1,5 kg, azote 30 bar (PS 32 bar), vide ≤ 500 microns + tenue 2 min, fiche Cerfa 15497.',
    refrigerant: 'R-134a', nominal: 1.5,
    n2: { target: 30, tol: 1, maxLP: 35, maxTest: 32 },
    vacuum: { unit: 'micron', target: 500, holdS: 120, maxRise: 300 },
    blendVapourTopUp: false, paperwork: 'cerfa', recTare: 10, recMax: { 'R-404A': 10, 'R-407F': 10, 'R-134a': 11, 'R-32': 9, 'R-410A': 10 }, recCylEvacuated: false,
  },
}
export const PROFILE_IDS: ProfileId[] = ['lycee', 'standard']
