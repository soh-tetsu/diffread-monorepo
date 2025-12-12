import { NextResponse } from 'next/server'
import {
  extractGuestId,
  GuestSessionError,
  validateSessionOwnership,
} from '@/lib/api/guest-session'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')
    const guestId = extractGuestId(request)

    const session = await validateSessionOwnership(token, guestId, {
      messages: {
        MISSING_TOKEN: 'Missing session token.',
        SESSION_NOT_FOUND: 'Session not found.',
      },
    })

    let article = null

    if (session.article_url) {
      const { data: articleData, error: articleError } = await supabase
        .from('articles')
        .select('id, status, metadata')
        .eq('original_url', session.article_url)
        .maybeSingle()

      if (articleError && articleError.code !== 'PGRST116') {
        logger.error({ err: articleError }, 'Failed to load article')
      }

      if (articleData) {
        const metadata = articleData.metadata as Record<string, unknown> | null
        article = {
          id: articleData.id,
          status: articleData.status,
          metadata: {
            title: typeof metadata?.title === 'string' ? metadata.title : null,
          },
        }
      }
    }

    return NextResponse.json({
      session: {
        session_token: session.session_token,
        status: session.status,
        study_status: session.study_status,
        article_url: session.article_url,
        user_id: session.user_id, // Return user_id so client can save to localStorage
      },
      article,
    })
  } catch (error) {
    if (error instanceof GuestSessionError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    logger.error({ err: error }, 'GET /api/quiz failed')
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error.' },
      { status: 500 }
    )
  }
}
