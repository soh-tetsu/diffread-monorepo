import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { getOrCreateArticle, updateArticleContent, updateArticleStatus } from '@/lib/db/articles'
import { logger } from '@/lib/logger'
import { uploadArticlePdf } from '@/lib/storage'
import { normalizeUrl } from '@/lib/utils/normalize-url'
import { enqueueAndProcessSession } from '@/lib/workflows/enqueue-session'

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

    logger.info({ title, text, url, hasPdf: !!pdfFile }, 'Received share target request')

    // Get guest ID from cookies
    const guestId = extractGuestId(request)

    // Build user identity for session creation
    // - If guestId exists: use it (will fetch existing or recreate guest)
    // - If guestId is null: create a new guest first
    let userIdentity: { userId: string }

    if (guestId) {
      userIdentity = { userId: guestId }
    } else {
      // No guest ID - create a new guest
      const { ensureGuestUser } = await import('@/lib/db/users')
      const { user } = await ensureGuestUser({})
      userIdentity = { userId: user.id }

      // Set cookie so future share-target calls use this guest
      const cookieStore = await cookies()
      cookieStore.set('diffread_guest_id', user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60, // 1 year
        path: '/',
      })
    }

    // Handle PDF file sharing
    if (pdfFile) {
      logger.info(
        { fileName: pdfFile.name, fileSize: pdfFile.size, fileType: pdfFile.type },
        'Processing shared PDF file'
      )

      try {
        // Read PDF content and generate hash
        const arrayBuffer = await pdfFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Create hash of PDF content (for deduplication)
        const { createHash } = await import('crypto')
        const contentHash = createHash('sha256').update(buffer).digest('hex')

        // Generate synthetic URL based on content hash (not filename)
        // This ensures identical PDFs share the same article, regardless of filename
        const pdfFilename = pdfFile.name || 'shared-document.pdf'
        const syntheticUrl = `file:///pdf/${contentHash}`
        const normalizedUrl = normalizeUrl(syntheticUrl)

        // Create or get article record (will reuse if same PDF was shared before)
        const article = await getOrCreateArticle(normalizedUrl, syntheticUrl)

        // Update article status to scraping
        await updateArticleStatus(article.id, 'scraping')

        // Upload PDF to storage
        const { path, metadata } = await uploadArticlePdf(arrayBuffer, normalizedUrl)

        // Update article with PDF storage info
        await updateArticleContent(article.id, {
          storage_path: path,
          storage_metadata: metadata,
          content_hash: contentHash,
          metadata: { title: title || pdfFilename },
          content_medium: 'pdf',
        })

        // Mark article as ready
        await updateArticleStatus(article.id, 'ready')

        // Create session and trigger quiz generation (same as URL path)
        const { session } = await enqueueAndProcessSession(userIdentity, syntheticUrl, {
          sync: false, // Process asynchronously
        })

        logger.info(
          { sessionToken: session.session_token, articleId: article.id, pdfPath: path },
          'PDF share target session created'
        )

        // Redirect to quiz page with session token
        // Use the host from the request to handle tunnels (ngrok, cloudflared)
        const host = request.headers.get('host') || new URL(request.url).host
        const protocol = request.headers.get('x-forwarded-proto') || 'https'
        const redirectUrl = new URL('/quiz', `${protocol}://${host}`)
        redirectUrl.searchParams.set('q', session.session_token)

        return NextResponse.redirect(redirectUrl)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error({ err, fileName: pdfFile.name }, 'Failed to process shared PDF')
        return NextResponse.redirect(new URL('/?error=pdf-upload-failed', request.url))
      }
    }

    // Handle URL sharing (existing logic)
    const sharedUrl = url || text

    if (!sharedUrl || typeof sharedUrl !== 'string') {
      logger.warn({ title, text, url }, 'Share target missing URL')
      return NextResponse.redirect(new URL('/?error=missing-url', request.url))
    }

    // Validate URL format
    let validatedUrl: string
    try {
      const urlObj = new URL(sharedUrl)
      validatedUrl = urlObj.href
    } catch {
      logger.warn({ sharedUrl }, 'Share target received invalid URL')
      return NextResponse.redirect(new URL('/?error=invalid-url', request.url))
    }

    // Create session for the shared URL
    const { session } = await enqueueAndProcessSession(userIdentity, validatedUrl, {
      sync: false, // Process asynchronously
    })

    logger.info(
      { sessionToken: session.session_token, url: validatedUrl },
      'URL share target session created'
    )

    // Redirect to quiz page with session token
    // Use the host from the request to handle tunnels (ngrok, cloudflared)
    const host = request.headers.get('host') || new URL(request.url).host
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const redirectUrl = new URL('/quiz', `${protocol}://${host}`)
    redirectUrl.searchParams.set('q', session.session_token)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to process share target')

    // Redirect to home with error
    return NextResponse.redirect(new URL('/?error=share-failed', request.url))
  }
}
