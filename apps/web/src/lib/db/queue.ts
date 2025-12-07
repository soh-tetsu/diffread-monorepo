import pLimit from 'p-limit'
import { execute } from '@/lib/db/supabase-helpers'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { processCuriosityQuiz } from '@/lib/workers/process-curiosity-quiz'
import type { SessionRow } from '@/types/db'

const pendingWorkerLimit = pLimit(1)

/**
 * Count how many sessions are in the user's queue
 * Queue = status is ready OR pending AND study_status is not completed/archived
 */
export async function countQueueItems(userId: string): Promise<number> {
  const result = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['ready', 'pending'])
    .in('study_status', ['not_started', 'curiosity_in_progress'])

  if (result.error) {
    throw new Error(`Failed to count queue items: ${result.error.message}`)
  }

  return result.count ?? 0
}

/**
 * Get the oldest bookmarked session for a user
 * Used to move next bookmarked item into processing when queue slot opens
 */
export async function getOldestBookmarkedSession(userId: string): Promise<SessionRow | null> {
  const result = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'bookmarked')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    throw new Error(`Failed to get oldest bookmarked session: ${result.error.message}`)
  }

  return result.data
}

/**
 * Move oldest bookmarked session to pending status and invoke worker
 * Returns true if a session was processed, false if no bookmarked sessions available
 */
export async function processNextBookmarkedSession(userId: string): Promise<boolean> {
  const bookmarked = await getOldestBookmarkedSession(userId)

  if (!bookmarked) {
    return false // No bookmarked sessions waiting
  }

  const result = await supabase
    .from('sessions')
    .update({ status: 'pending' })
    .eq('id', bookmarked.id)

  execute(result, { context: `move bookmarked session ${bookmarked.id} to pending` })

  // Get curiosity quiz ID for this session
  if (!bookmarked.quiz_id) {
    logger.error(
      { sessionToken: bookmarked.session_token, sessionId: bookmarked.id },
      'Bookmarked session missing quiz_id - cannot invoke worker'
    )
    return true
  }

  const { getCuriosityQuizByQuizId } = await import('@/lib/db/curiosity-quizzes')
  const curiosityQuiz = await getCuriosityQuizByQuizId(bookmarked.quiz_id)

  if (!curiosityQuiz) {
    logger.error(
      { sessionToken: bookmarked.session_token, quizId: bookmarked.quiz_id },
      'Curiosity quiz not found for bookmarked session - cannot invoke worker'
    )
    return true
  }

  // Invoke worker to process the specific curiosity quiz
  logger.info(
    { sessionToken: bookmarked.session_token, userId, curiosityQuizId: curiosityQuiz.id },
    'Invoking worker for dequeued session'
  )
  pendingWorkerLimit(() =>
    processCuriosityQuiz(curiosityQuiz.id).catch((err) => {
      logger.error(
        { err, sessionToken: bookmarked.session_token, curiosityQuizId: curiosityQuiz.id },
        'Worker failed for dequeued session'
      )
    })
  )

  return true
}

/**
 * Check queue and process next bookmarked if slots available
 * Called after user completes/archives a quiz
 */
export async function tryProcessNextInQueue(userId: string): Promise<void> {
  const queueCount = await countQueueItems(userId)

  if (queueCount < 2) {
    await processNextBookmarkedSession(userId)
  }
}

/**
 * Auto-fill queue if empty but waiting list has items
 * Called when user visits bookmarks page or homepage
 */
export async function autoFillQueue(userId: string): Promise<void> {
  const queueCount = await countQueueItems(userId)
  const MAX_QUEUE_SIZE = 2

  // Fill queue up to max capacity
  for (let i = queueCount; i < MAX_QUEUE_SIZE; i++) {
    const hasMore = await processNextBookmarkedSession(userId)
    if (!hasMore) break
  }
}
