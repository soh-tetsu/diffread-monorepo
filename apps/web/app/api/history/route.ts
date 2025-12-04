import { type NextRequest, NextResponse } from 'next/server'
import { getArticleById } from '@/lib/db/articles'
import { getQuizById } from '@/lib/db/quizzes'
import { getSessionsByUserId } from '@/lib/db/sessions'

export const runtime = 'nodejs'

type HistoryItem = {
  sessionToken: string
  articleTitle: string | null
  articleUrl: string
  timestamp: number
  sessionStatus: string
}

/**
 * GET /api/history
 * Returns user's article evaluation history based on their guest ID
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get guest ID from header
    const guestId = request.headers.get('X-Diffread-Guest-Id')

    if (!guestId) {
      return NextResponse.json({ error: 'Guest ID required' }, { status: 400 })
    }

    // Fetch all sessions for this user
    const sessions = await getSessionsByUserId(guestId, 50)

    // Build history items with article metadata
    // Flow: guest_id → sessions.user_id → sessions.quiz_id → quizzes.article_id → articles
    const history: HistoryItem[] = await Promise.all(
      sessions.map(async (session) => {
        let articleTitle: string | null = null

        // Get article metadata via: session.quiz_id → quiz.article_id → article
        if (session.quiz_id) {
          try {
            const quiz = await getQuizById(session.quiz_id)
            if (quiz?.article_id) {
              const article = await getArticleById(quiz.article_id)
              if (article?.metadata && typeof article.metadata === 'object') {
                const metadata = article.metadata as { title?: string | null }
                articleTitle = metadata.title || null
              }
            }
          } catch {
            // Ignore errors fetching article details
          }
        }

        return {
          sessionToken: session.session_token,
          articleTitle,
          articleUrl: session.article_url,
          timestamp: session.created_at ? new Date(session.created_at).getTime() : Date.now(),
          sessionStatus: session.status,
        }
      })
    )

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Failed to fetch history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
