import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
export const metadata: Metadata = { title: 'FrigoSim — Simulateur de manipulation des fluides frigorigènes', description: 'Simulateur isométrique pour apprentis frigoristes : test azote, tirage au vide, charge, récupération, fiche Cerfa 15497.' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden bg-[#e9eff8] text-slate-800">{children}</body>
    </html>
  )
}
