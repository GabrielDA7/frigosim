'use client'
import { useEffect, useLayoutEffect, useState } from 'react'

const STEPS: { target: string; title: string; text: string }[] = [
  { target: 'brand', title: 'Bienvenue dans FrigoSim', text: "Vous intervenez sur un groupe froid de chambre froide : compresseur, condenseur, réservoir, déshydrateur, détendeur et évaporateur. Chaque action a une conséquence physique visible sur les instruments." },
  { target: 'modes', title: 'Trois modes', text: 'Bac à sable : exploration libre. Pratique guidée : cinq exercices avec étapes, indices et bilan. Évaluation EP3 : chronométré, sans aide, note sur 20 et fiche Cerfa. Le sélecteur « Fluide » change la plaque signalétique (R-134a, R-32, R-410A).' },
  { target: 'scene', title: "L'atelier 3D", text: "Molette (ou pincement) et boutons + / − pour zoomer ; glissez le fond de l'atelier pour déplacer la vue, ⌂ pour recentrer. Survolez un élément pour afficher son nom ; cliquez un équipement pour ouvrir ses commandes ; glissez-le pour le déplacer sur l'établi ou au sol (les flexibles suivent, dans la limite de leur longueur). ⟲ range l'atelier." },
  { target: 'scene', title: 'Raccorder les flexibles', text: "Glissez l'extrémité d'un flexible (bleu BP, rouge HP, jaune charge, noir vide 3/8, gris vacuomètre) jusqu'à un raccord. Sur tablette : touchez l'extrémité, puis le raccord. Les flexibles raccordés restent visibles ; des pointillés animés montrent le sens de circulation." },
  { target: 'tiles', title: 'Instruments', text: 'BP et HP en bar relatif avec la température de saturation du fluide (point de rosée / point de bulle). Vacuomètre en microns ou mbar absolus, à ne jamais laisser sous pression. Balance : masse brute et nette après tare.' },
  { target: 'panel', title: 'Équipements & outils', text: 'Vannes de service, manifold, pompe à vide, récupérateur, bouteilles, azote, balance : toutes les commandes sont ici, avec de gros boutons. La section « Raccordements (clavier) » remplace le glisser-déposer.' },
  { target: 'card', title: 'Consigne et étapes', text: "L'objectif de l'exercice, les étapes validées en direct et le bouton Indice. « Terminer » ouvre le bilan : ce qui s'est passé, la cause, ce qu'il faut vérifier. En évaluation, « Soumettre » enchaîne la fiche Cerfa 15497 et la note." },
  { target: 'ppe', title: 'Sécurité d\'abord', text: 'Gants et lunettes sont obligatoires avant toute mise en route (pompe, compresseur, récupérateur, robinets de bouteille). Sans EPI, l\'action est bloquée et l\'oubli est enregistré pour l\'évaluation.' },
]

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]
  useLayoutEffect(() => {
    const measure = () => { const el = document.querySelector(`[data-tour="${step.target}"]`); setRect(el ? el.getBoundingClientRect() : null) }
    measure(); window.addEventListener('resize', measure); const id = setInterval(measure, 500)
    return () => { window.removeEventListener('resize', measure); clearInterval(id) }
  }, [step.target])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const pad = 8
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200, vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const cardW = Math.min(400, vw - 32)
  let top = rect ? rect.bottom + 14 : vh / 2 - 120, left = rect ? rect.left : vw / 2 - cardW / 2
  if (rect && top + 240 > vh) top = Math.max(16, rect.top - 250)
  left = Math.max(16, Math.min(left, vw - cardW - 16))
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Visite guidée">
      {rect ? <div className="absolute rounded-2xl border-2 border-blue-400 transition-all duration-300" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad, boxShadow: '0 0 0 9999px rgba(15,23,42,.55)' }} /> : <div className="absolute inset-0 bg-slate-900/55" />}
      <div className="absolute card p-4 transition-all duration-300" style={{ top, left, width: cardW }}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Visite guidée · {i + 1}/{STEPS.length}</div>
        <h2 className="mt-1 text-base font-bold">{step.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{step.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex gap-1">{STEPS.map((_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-blue-600' : 'bg-slate-300'}`} />)}</div>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={onClose}>Passer</button>
            {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Précédent</button>}
            {i < STEPS.length - 1 ? <button className="btn btn-primary" onClick={() => setI(i + 1)}>Suivant</button> : <button className="btn btn-primary" onClick={onClose}>Commencer</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
