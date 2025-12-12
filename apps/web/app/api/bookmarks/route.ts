import { type NextRequest, NextResponse } from 'next/server'
import { extractGuestId } from '@/lib/api/guest-session'
import { autoFillQueue } from '@/lib/db/queue'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

type BookmarkSession = {
  sessionToken: string
  articleTitle: string | null
  articleUrl: string
  status: string
  studyStatus: string
  timestamp: number
}

/**
 * GET /api/bookmarks
 * Returns user's bookmarked sessions organized by queue/waiting/archive
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get guest ID from cookie (automatically sent by browser)
    const guestId = extractGuestId(request)

    if (!guestId) {
      return NextResponse.json({ error: 'Guest ID required' }, { status: 400 })
    }

    // Auto-fill queue if empty but waiting list has items
    // This handles edge case where queue is empty but bookmarked sessions exist
    autoFillQueue(guestId).catch((err) => {
      console.error('Failed to auto-fill queue:', err)
    })

    // Fetch all sessions with article metadata in a single JOIN query
    // Use LEFT JOIN (not inner) to include sessions without quiz_id yet
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(
        `
        session_token,
        article_url,
        status,
        study_status,
        created_at,
        quiz_id,
        metadata,
        quizzes(
          article_id,
          articles(
            metadata
          )
        )
      `
      )
      .eq('user_id', guestId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Failed to fetch bookmarks:', error)
      return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 })
    }

    // Transform the data
    const bookmarks: BookmarkSession[] = (sessions || []).map((session: any) => {
      let articleTitle: string | null = null

      // Priority 1: Article metadata (from full scrape)
      if (session.quizzes?.articles?.metadata) {
        const metadata = session.quizzes.articles.metadata as { title?: string | null }
        articleTitle = metadata.title || null
      }

      // Priority 2: Session metadata (from share-target or early title fetch)
      if (!articleTitle && session.metadata) {
        const sessionMetadata = session.metadata as { title?: string | null }
        articleTitle = sessionMetadata.title || null
      }

      return {
        sessionToken: session.session_token,
        articleTitle,
        articleUrl: session.article_url,
        status: session.status,
        studyStatus: session.study_status,
        timestamp: session.created_at ? new Date(session.created_at).getTime() : Date.now(),
      }
    })

    // Organize bookmarks into three categories
    const queue: BookmarkSession[] = []
    const waiting: BookmarkSession[] = []
    const archived: BookmarkSession[] = []

    for (const bookmark of bookmarks) {
      if (bookmark.studyStatus === 'archived') {
        // Archived section
        archived.push(bookmark)
      } else if (
        (bookmark.status === 'ready' ||
          bookmark.status === 'pending' ||
          bookmark.status === 'errored') &&
        (bookmark.studyStatus === 'not_started' || bookmark.studyStatus === 'curiosity_in_progress')
      ) {
        // Queue section (ready to solve OR currently generating OR errored, max 2 slots)
        queue.push(bookmark)
      } else {
        // Waiting list (bookmarked or errored, no slots occupied)
        waiting.push(bookmark)
      }
    }

    // Sort queue by created_at (oldest first)
    queue.sort((a, b) => a.timestamp - b.timestamp)

    // Sort waiting list by created_at (oldest first)
    waiting.sort((a, b) => a.timestamp - b.timestamp)

    // Sort archived by created_at (newest first)
    archived.sort((a, b) => b.timestamp - a.timestamp)

    return NextResponse.json({
      queue: queue.slice(0, 2), // Max 2 in queue
      waiting,
      archived,
    })
  } catch (error) {
    console.error('Failed to fetch bookmarks:', error)
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 })
  }
}
