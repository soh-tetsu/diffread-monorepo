import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Web Share Target API
 *
 * Handles content shared from other apps/websites to this PWA.
 * This endpoint receives POST requests from the browser's share menu.
 *
 * Supports:
 * - URL sharing (from web pages)
 * - PDF file sharing (from Files app, email attachments, etc.)
 *
 * @see https://web.dev/web-share-target/
 */
export async function POST(request: Request) {
  try {
    // Parse multipart/form-data from share target
    const formData = await request.formData()

    const title = formData.get('title') as string | null
    const text = formData.get('text') as string | null
    const url = formData.get('url') as string | null
    const pdfFile = formData.get('pdf') as File | null

    // Get host for redirect URL
    const host = request.headers.get('host') || new URL(request.url).host
    const protocol = request.headers.get('x-forwarded-proto') || 'https'

    // Handle PDF file sharing - just redirect immediately
    if (pdfFile) {
      const redirectUrl = new URL('/share-confirm', `${protocol}://${host}`)
      redirectUrl.searchParams.set('type', 'pdf')
      redirectUrl.searchParams.set('filename', pdfFile.name || 'shared-document.pdf')
      if (title) redirectUrl.searchParams.set('title', title)

      return NextResponse.redirect(redirectUrl, 303)
    }

    // Handle URL sharing - just redirect immediately
    const sharedUrl = url || text

    const redirectUrl = new URL('/share-confirm', `${protocol}://${host}`)
    redirectUrl.searchParams.set('type', 'url')
    if (sharedUrl) redirectUrl.searchParams.set('url', sharedUrl)
    if (title) redirectUrl.searchParams.set('title', title)

    return NextResponse.redirect(redirectUrl, 303)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to process share target')

    // Redirect to home with error
    const host = request.headers.get('host') || new URL(request.url).host
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    return NextResponse.redirect(new URL('/?error=share-failed', `${protocol}://${host}`))
  }
}
