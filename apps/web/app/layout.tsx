import type { Metadata } from 'next'
import './globals.css'
import { GuestIdRenewal } from '@/components/providers/GuestIdRenewal'
import { LocaleProvider } from '@/components/providers/LocaleProvider'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Diffread - Quiz-Guided Reading',
  description: 'Transform passive reading into active learning with quiz-guided approach',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Diffread',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0d9488',
}

// IMPORTANT: No async/await here = enables static generation
// Locale detection happens client-side in LocaleProvider
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <GuestIdRenewal />
          <LocaleProvider>{children}</LocaleProvider>
        </Providers>
      </body>
    </html>
  )
}
