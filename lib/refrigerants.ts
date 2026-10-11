// Données de saturation (bar absolu) générées avec CoolProp 6.6 (HEOS, équations d'état NIST/REFPROP)
// par pas de 5 K. Cohérentes avec les tables Danfoss Coolselector. À faire valider par le formateur.
export type Refrigerant = 'R-32' | 'R-410A' | 'R-134a' | 'R-407F' | 'R-404A'
export const REFRIGERANTS: Refrigerant[] = ['R-407F', 'R-404A', 'R-134a', 'R-32', 'R-410A']

const T_PTS = [-40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
const PT: Record<Refrigerant, { bubble: number[]; dew: number[] }> = {
  'R-32': {
    bubble: [1.7741, 2.2138, 2.7344, 3.3456, 4.0575, 4.8807, 5.8263, 6.9058, 8.131, 9.5145, 11.0691, 12.8081, 14.7457, 16.8962, 19.2751, 21.8983, 24.7831, 27.9478, 31.4123, 35.1988, 39.3323, 43.8427, 48.7682],
    dew: [1.7741, 2.2138, 2.7344, 3.3456, 4.0575, 4.8807, 5.8263, 6.9058, 8.131, 9.5145, 11.0691, 12.8081, 14.7457, 16.8962, 19.2751, 21.8983, 24.7831, 27.9478, 31.4123, 35.1988, 39.3323, 43.8427, 48.7682],
  },
  'R-410A': {
    bubble: [1.755, 2.1893, 2.7031, 3.3057, 4.0069, 4.8168, 5.746, 6.8057, 8.0071, 9.3621, 10.883, 12.5827, 14.4745, 16.5725, 18.8915, 21.4471, 24.2564, 27.3376, 30.7107, 34.3984, 38.4265, 42.8262, 47.6392],
    dew: [1.7485, 2.1814, 2.6935, 3.2941, 3.993, 4.8004, 5.7268, 6.7831, 7.9808, 9.3318, 10.8482, 12.5429, 14.4293, 16.5214, 18.8341, 21.3833, 24.1861, 27.2613, 30.6299, 34.316, 38.3483, 42.7635, 47.6173],
  },
  // R-407F : mélange HEOS R-32/R-125/R-134a 30/30/40 % masse (CoolProp) ; glissement ≈ 5 K
  'R-407F': {
    bubble: [1.3502, 1.6899, 2.0928, 2.5668, 3.1197, 3.7597, 4.4956, 5.3361, 6.2906, 7.3683, 8.579, 9.9327, 11.4396, 13.1102, 14.9553, 16.9861, 19.214, 21.6511, 24.23, 27.11, 30.3456, 33.751, 37.4333],
    dew: [0.9963, 1.2705, 1.6009, 1.9953, 2.4616, 3.0083, 3.6443, 4.3791, 5.2222, 6.1838, 7.2746, 8.5057, 9.8885, 11.4354, 13.1592, 15.0734, 17.1928, 19.5332, 22.1122, 24.9498, 28.0695, 31.5004, 35.2819],
  },
  'R-404A': {
    bubble: [1.3529, 1.6853, 2.0778, 2.5373, 3.071, 3.6864, 4.3912, 5.1936, 6.1018, 7.1245, 8.2708, 9.5498, 10.9715, 12.5458, 14.2836, 16.1961, 18.2954, 20.5948, 23.1087, 25.8538, 28.85, 32.1242, 35.7209],
    dew: [1.3098, 1.6362, 2.0223, 2.4751, 3.0018, 3.6099, 4.3073, 5.1021, 6.0027, 7.018, 8.1569, 9.4289, 10.844, 12.4123, 14.1449, 16.0532, 18.1495, 20.4473, 22.9615, 25.7093, 28.7122, 32.0001, 35.6328],
  },
  'R-134a': {
    bubble: [0.5121, 0.6614, 0.8438, 1.064, 1.3273, 1.6394, 2.006, 2.4334, 2.928, 3.4966, 4.1461, 4.8837, 5.7171, 6.6538, 7.702, 8.8698, 10.1659, 11.5992, 13.1791, 14.9151, 16.8178, 18.8982, 21.1683],
    dew: [0.5121, 0.6614, 0.8438, 1.064, 1.3273, 1.6394, 2.006, 2.4334, 2.928, 3.4966, 4.1461, 4.8837, 5.7171, 6.6538, 7.702, 8.8698, 10.1659, 11.5992, 13.1791, 14.9151, 16.8178, 18.8982, 21.1683],
  },
}

export const PROPS: Record<Refrigerant, { M: number; rhoLiq: number; gwp: number; blend: boolean; charge: 'liquide' | 'vapeur'; color: string; cylinder: string }> = {
  // M g/mol et masse volumique liquide à 20 °C (kg/L) : CoolProp. PRG : règlement (UE) 2024/573 (AR4). Méthode de charge usuelle.
  'R-407F': { M: 82.059, rhoLiq: 1.1388, gwp: 1825, blend: true, charge: 'liquide', color: '#a78bfa', cylinder: '#ede9fe' },
  'R-404A': { M: 97.604, rhoLiq: 1.0673, gwp: 3922, blend: true, charge: 'liquide', color: '#fb923c', cylinder: '#ffedd5' },
  'R-134a': { M: 102.032, rhoLiq: 1.2253, gwp: 1430, blend: false, charge: 'vapeur', color: '#60a5fa', cylinder: '#bfdbfe' },
  'R-32': { M: 52.024, rhoLiq: 0.9814, gwp: 675, blend: false, charge: 'liquide', color: '#38bdf8', cylinder: '#e0f2fe' },
  'R-410A': { M: 72.585, rhoLiq: 1.0833, gwp: 2088, blend: true, charge: 'liquide', color: '#f472b6', cylinder: '#fbcfe8' },
}

function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  let i = 1
  while (xs[i] < x) i++
  const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
  return ys[i - 1] + f * (ys[i] - ys[i - 1])
}
const LN: Record<Refrigerant, { bubble: number[]; dew: number[] }> = Object.fromEntries(
  (Object.keys(PT) as Refrigerant[]).map((r) => [r, { bubble: PT[r].bubble.map(Math.log), dew: PT[r].dew.map(Math.log) }]),
) as never

/** Pression de saturation (bar abs) à T (°C) — interpolation en ln(p). */
export function satP(r: Refrigerant, kind: 'bubble' | 'dew', tC: number) { return Math.exp(interp(T_PTS, LN[r][kind], tC)) }
/** Température de saturation (°C) à p (bar abs). */
export function satT(r: Refrigerant, kind: 'bubble' | 'dew', pAbs: number) { return pAbs <= 0 ? NaN : interp(LN[r][kind], T_PTS, Math.log(pAbs)) }
/** Pression de vapeur saturante de l'eau (bar) — formule de Magnus. */
export function satPWater(tC: number) { return 0.0061078 * Math.exp((17.27 * tC) / (tC + 237.3)) }
