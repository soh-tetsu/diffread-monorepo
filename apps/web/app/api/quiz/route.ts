import { NextResponse } from 'next/server'
import { getSessionByToken } from '@/lib/db/sessions'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('q')

    if (!token) {
      return NextResponse.json({ message: 'Missing session token.' }, { status: 400 })
    }

    const session = await getSessionByToken(token)

    if (!session) {
      return NextResponse.json({ message: 'Session not found.' }, { status: 404 })
    }

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
        article_url: session.article_url,
      },
      article,
    })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/quiz failed')
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error.' },
      { status: 500 }
    )
  }
}
