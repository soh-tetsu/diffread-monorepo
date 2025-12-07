import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { getOrCreateArticle, updateArticleContent, updateArticleStatus } from '@/lib/db/articles'
import { countQueueItems } from '@/lib/db/queue'
import { updateSession } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { uploadArticlePdf } from '@/lib/storage'
import { normalizeUrl } from '@/lib/utils/normalize-url'

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

        // Always initialize the full chain: session → article → quiz → curiosity_quiz
        const { initializeSessionChain } = await import('@/lib/workflows/session-init')
        const {
          ensureGuestUser: ensureGuestUserPdf,
          synthesizeGuestEmail: synthesizeGuestEmailPdf,
        } = await import('@/lib/db/users')

        const { user: pdfUser } = await ensureGuestUserPdf({ userId: userIdentity.userId })
        const { session: pdfSession, article: pdfArticle } = await initializeSessionChain({
          userId: pdfUser.id,
          email: pdfUser.email ?? synthesizeGuestEmailPdf(pdfUser.id),
          originalUrl: syntheticUrl,
        })

        // Check queue size - determines if we trigger worker or just bookmark
        const queueCount = await countQueueItems(userIdentity.userId)

        if (queueCount < 2 && pdfSession.status === 'bookmarked') {
          // Queue has space - move to pending and trigger worker
          const updatedSession = await updateSession(pdfSession.id, { status: 'pending' })

          // Trigger worker (fire-and-forget)
          const { triggerQuizWorker } = await import('@/lib/workflows/enqueue-session')
          triggerQuizWorker(updatedSession, pdfArticle, { sync: false }).catch((err) => {
            logger.error(
              { err, sessionToken: pdfSession.session_token },
              'Worker invocation failed'
            )
          })

          logger.info(
            { sessionToken: pdfSession.session_token, queueCount },
            'PDF share target session moved to pending (queue has space)'
          )
        } else if (pdfSession.status !== 'bookmarked') {
          logger.info(
            { sessionToken: pdfSession.session_token, status: pdfSession.status },
            'PDF share target reusing existing session'
          )
        } else {
          logger.info(
            { sessionToken: pdfSession.session_token, queueCount },
            'PDF share target session bookmarked (queue full)'
          )
        }

        const session = pdfSession

        logger.info(
          { sessionToken: session.session_token, articleId: article.id, pdfPath: path },
          'PDF share target session created'
        )

        // Redirect to bookmarks page
        const host = request.headers.get('host') || new URL(request.url).host
        const protocol = request.headers.get('x-forwarded-proto') || 'https'
        const redirectUrl = new URL('/bookmarks', `${protocol}://${host}`)

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

    // Always initialize the full chain: session → article → quiz → curiosity_quiz
    // This is fast (just DB operations, no scraping/AI work)
    const { initializeSessionChain } = await import('@/lib/workflows/session-init')
    const { ensureGuestUser, synthesizeGuestEmail } = await import('@/lib/db/users')

    const { user } = await ensureGuestUser({ userId: userIdentity.userId })
    const { session, article } = await initializeSessionChain({
      userId: user.id,
      email: user.email ?? synthesizeGuestEmail(user.id),
      originalUrl: validatedUrl,
    })

    // Check queue size - determines if we trigger worker or just bookmark
    const queueCount = await countQueueItems(userIdentity.userId)

    if (queueCount < 2 && session.status === 'bookmarked') {
      // Queue has space - move to pending and trigger worker
      const updatedSession = await updateSession(session.id, { status: 'pending' })

      // Trigger worker (fire-and-forget)
      const { triggerQuizWorker } = await import('@/lib/workflows/enqueue-session')
      triggerQuizWorker(updatedSession, article, { sync: false }).catch((err) => {
        logger.error({ err, sessionToken: session.session_token }, 'Worker invocation failed')
      })

      logger.info(
        { sessionToken: session.session_token, queueCount },
        'Share target session moved to pending (queue has space)'
      )
    } else if (session.status !== 'bookmarked') {
      // Session already exists with different status - keep it as is
      logger.info(
        { sessionToken: session.session_token, status: session.status },
        'Share target reusing existing session'
      )
    } else {
      // Queue is full - stays as bookmarked
      logger.info(
        { sessionToken: session.session_token, queueCount },
        'Share target session bookmarked (queue full)'
      )
    }

    logger.info(
      { sessionToken: session.session_token, url: validatedUrl },
      'URL share target session created'
    )

    // Redirect to bookmarks page
    const host = request.headers.get('host') || new URL(request.url).host
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const redirectUrl = new URL('/bookmarks', `${protocol}://${host}`)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error({ err }, 'Failed to process share target')

    // Redirect to home with error
    return NextResponse.redirect(new URL('/?error=share-failed', request.url))
  }
}
