'use client'
import { useState } from 'react'
import { REFRIGERANTS } from '@/lib/refrigerants'

export const NATURES: [string, string][] = [['mise_en_service', 'Mise en service'], ['maintenance', 'Maintenance / entretien'], ['modification', 'Modification'], ['controle', "Contrôle d'étanchéité"], ['demantelement', 'Démantèlement']]
const METHODES = ['Détecteur électronique', 'Produit moussant', 'Mesure de chute de pression (azote)', 'Traceur fluorescent', 'Méthode indirecte']

type Set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
function FieldInput({ label, k, type = 'text', step, placeholder, f, set }: { label: string; k: string; type?: string; step?: string; placeholder?: string; f: Record<string, string>; set: Set }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">{label}</span><input name={k} type={type} step={step} inputMode={type === 'number' ? 'decimal' : undefined} value={f[k] ?? ''} onChange={set(k)} placeholder={placeholder} /></label>
}
function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-bold text-slate-800">{n}. {title}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div></fieldset>
}

/** Document de fin d'intervention : fiche de suivi (lycée, comme dans la vidéo) ou Cerfa 15497 (version d'entraînement). */
export default function Cerfa({ template, onSubmit, initial }: { template: 'fiche' | 'cerfa'; onSubmit: (d: Record<string, string>) => void; initial?: Record<string, string> }) {
  const [f, setF] = useState<Record<string, string>>(initial ?? { controle: 'non', resultat: 'absence', typeFluideCharge: 'neuf', destination: 'traitement', date: new Date().toISOString().slice(0, 10) })
  const set: Set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const natures = (f.nature ?? '').split(',').filter(Boolean)
  const toggleNature = (k: string) => setF({ ...f, nature: (natures.includes(k) ? natures.filter((n) => n !== k) : [...natures, k]).join(',') })
  const fluidSelect = <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Fluide frigorigène</span><select value={f.fluide ?? ''} onChange={set('fluide')}><option value="">—</option>{REFRIGERANTS.map((r) => <option key={r}>{r}</option>)}<option>R-449A</option><option>R-448A</option></select></label>

  if (template === 'fiche') return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><b>Fiche de suivi de l&apos;installation</b> (document d&apos;atelier, comme à l&apos;examen). Rien n&apos;est prérempli : reporter ce que vous avez <b>réellement mesuré</b>.</div>
      <Section n="1" title="Intervention">
        <FieldInput f={f} set={set} label="Date" k="date" type="date" /><FieldInput f={f} set={set} label="Classe" k="classe" placeholder="Term. Bac Pro TFCA" /><FieldInput f={f} set={set} label="Élève" k="eleve" />
      </Section>
      <Section n="2" title="Installation et fluide">
        {fluidSelect}<FieldInput f={f} set={set} label="Charge nominale (kg)" k="chargeNominale" type="number" step="0.01" /><FieldInput f={f} set={set} label="Nature de l'intervention" k="nature" placeholder="Dépannage – filtre déshydrateur" />
      </Section>
      <Section n="3" title="Quantités manipulées">
        <FieldInput f={f} set={set} label="Fluide récupéré (kg)" k="recuperee" type="number" step="0.001" /><FieldInput f={f} set={set} label="Fluide chargé (kg)" k="chargee" type="number" step="0.001" />
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Destination du fluide récupéré</span><select value={f.destination} onChange={set('destination')}><option value="traitement">Traitement</option><option value="recyclage">Recyclage / régénération</option><option value="reutilisation">Réutilisation</option></select></label>
      </Section>
      <Section n="4" title="Contrôle d'étanchéité">
        <FieldInput f={f} set={set} label="Détecteur : type / référence" k="detecteur" placeholder="Détecteur électronique – réf. …" />
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Résultat</span><select value={f.resultat} onChange={set('resultat')}><option value="absence">Absence de fuite</option><option value="fuite">Fuite détectée</option></select></label>
        <FieldInput f={f} set={set} label="État final de l'installation" k="etatFinal" placeholder="En fonctionnement, étanche" />
      </Section>
      <Section n="5" title="Validation">
        <FieldInput f={f} set={set} label="Nom du formateur" k="formateur" /><FieldInput f={f} set={set} label="Signature (nom)" k="signatureOp" />
      </Section>
      <div className="flex justify-end"><button className="btn btn-primary">Valider la fiche</button></div>
    </form>
  )

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><b>Version d&apos;entraînement</b> de la fiche d&apos;intervention <b>Cerfa n° 15497*04</b>. Reporter les valeurs <b>réellement mesurées</b>. Sans valeur réglementaire.</div>
      <Section n="1" title="Opérateur"><FieldInput f={f} set={set} label="Raison sociale" k="operateur" /><FieldInput f={f} set={set} label="N° d'attestation de capacité" k="attestation" /><FieldInput f={f} set={set} label="Nom de l'intervenant" k="intervenant" /></Section>
      <Section n="2" title="Détenteur de l'équipement"><FieldInput f={f} set={set} label="Nom / raison sociale" k="detenteur" /><FieldInput f={f} set={set} label="Adresse" k="adresse" /></Section>
      <Section n="3" title="Équipement">
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Type d&apos;équipement</span><select value={f.typeEquipement ?? ''} onChange={set('typeEquipement')}><option value="">—</option><option>Chambre froide (groupe de condensation)</option><option>Climatisation</option><option>Pompe à chaleur</option></select></label>
        <FieldInput f={f} set={set} label="Identification (n° de série)" k="identification" />{fluidSelect}
        <FieldInput f={f} set={set} label="Charge nominale (kg)" k="chargeNominale" type="number" step="0.01" /><FieldInput f={f} set={set} label="Charge en teq CO2" k="teqCO2" type="number" step="0.001" placeholder="kg × PRG / 1000" />
      </Section>
      <Section n="4" title="Nature de l'intervention"><div className="col-span-full flex flex-wrap gap-2">{NATURES.map(([k, l]) => <button type="button" key={k} onClick={() => toggleNature(k)} className={`btn ${natures.includes(k) ? 'btn-primary' : ''}`}>{natures.includes(k) ? '☑' : '☐'} {l}</button>)}</div></Section>
      <Section n="5" title="Contrôle d'étanchéité">
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Contrôle effectué</span><select value={f.controle} onChange={set('controle')}><option value="oui">Oui</option><option value="non">Non</option></select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Méthode</span><select value={f.methode ?? ''} onChange={set('methode')}><option value="">—</option>{METHODES.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Résultat</span><select value={f.resultat} onChange={set('resultat')}><option value="absence">Absence de fuite</option><option value="fuite">Fuite détectée</option></select></label>
      </Section>
      <Section n="6" title="Quantités de fluide">
        <FieldInput f={f} set={set} label="Fluide chargé (kg)" k="chargee" type="number" step="0.01" />
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Type de fluide chargé</span><select value={f.typeFluideCharge} onChange={set('typeFluideCharge')}><option value="neuf">Neuf</option><option value="recycle">Recyclé</option><option value="regenere">Régénéré</option></select></label>
        <FieldInput f={f} set={set} label="Fluide récupéré (kg)" k="recuperee" type="number" step="0.01" />
        <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600">Destination</span><select value={f.destination} onChange={set('destination')}><option value="traitement">Traitement (destruction)</option><option value="recyclage">Recyclage / régénération</option><option value="reutilisation">Réutilisation sur site</option></select></label>
      </Section>
      <Section n="7" title="Date et signatures"><FieldInput f={f} set={set} label="Date" k="date" type="date" /><FieldInput f={f} set={set} label="Signature opérateur (nom)" k="signatureOp" /><FieldInput f={f} set={set} label="Signature détenteur (nom)" k="signatureDet" /></Section>
      <div className="flex justify-end"><button className="btn btn-primary">Valider la fiche</button></div>
    </form>
  )
}
