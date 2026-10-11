'use client'
import dynamic from 'next/dynamic'
// Rendu côté client uniquement : scène WebGL et préférences locales (visite guidée) sans hydratation serveur.
const Simulator = dynamic(() => import('@/components/Simulator'), { ssr: false, loading: () => <div className="grid h-full place-items-center text-slate-500">Chargement de FrigoSim…</div> })
export default function Page() { return <Simulator /> }
