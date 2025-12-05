import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import './globals.css'
import { SettingsMenu } from '@/components/ui/SettingsMenu'
import { defaultLocale, type Locale } from '@/i18n/config'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Diffread Alpha Placeholder',
  description:
    'Quiz-guided reading prototype placeholder so you can wire up alpha.diffread.app on Vercel.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const locale = (cookieStore.get('NEXT_LOCALE')?.value as Locale) || defaultLocale

  // Fetch messages for the current locale
  const messages = await getMessages({ locale })

  return (
    <html lang={locale}>
      <body>
        <Providers>
          <NextIntlClientProvider messages={messages} locale={locale}>
            <SettingsMenu />
            {children}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  )
}
