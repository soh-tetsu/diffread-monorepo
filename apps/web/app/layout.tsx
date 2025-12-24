import type { Metadata } from 'next'
import './globals.css'
import { GuestIdRenewal } from '@/components/providers/GuestIdRenewal'
import { LocaleProvider } from '@/components/providers/LocaleProvider'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { NotificationProvider } from '@/components/ui/NotificationBanner'
import { StickyHeaderContainer } from '@/components/ui/StickyHeaderContainer'
import { Providers } from './providers'

const isDev = process.env.NODE_ENV === 'development'

export const metadata: Metadata = {
  title: isDev ? 'Diffread DEV - Quiz-Guided Reading' : 'Diffread - Quiz-Guided Reading',
  description: 'Transform passive reading into active learning with quiz-guided approach',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: isDev ? 'Diffread DEV' : 'Diffread',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: isDev ? '#ea580c' : '#0d9488',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NotificationProvider>
            <ServiceWorkerRegistration />
            <GuestIdRenewal />
            <LocaleProvider>
              <StickyHeaderContainer />
              {children}
            </LocaleProvider>
          </NotificationProvider>
        </Providers>
      </body>
    </html>
  )
}
