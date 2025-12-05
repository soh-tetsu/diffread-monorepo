import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Diffread Alpha Placeholder',
  description:
    'Quiz-guided reading prototype placeholder so you can wire up alpha.diffread.app on Vercel.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''

  // Extract locale from pathname (e.g., /ja/... -> ja)
  const locale = pathname.split('/')[1] || 'en'

  return (
    <html lang={locale}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
