import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { locales } from '@/i18n/config'

export async function POST(request: Request) {
  const body = await request.json()
  const { locale } = body

  // Validate locale
  if (!locales.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, {
    maxAge: 365 * 24 * 60 * 60, // 1 year
    path: '/',
  })

  return NextResponse.json({ success: true })
}
