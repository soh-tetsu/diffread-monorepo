import { getOrCreateSession, updateSession } from '@/lib/db/sessions'
import { bootstrapQuiz } from '@/lib/quiz/bootstrap'
import { mapQuizStatusToSessionStatus } from '@/lib/status'
import type { SessionRow } from '@/types/db'

export async function initSession(email: string, originalUrl: string) {
  const session = await getOrCreateSession(email, originalUrl)
  const job = await bootstrapQuiz(originalUrl)

  const quizId = job.quiz.id
  let updatedSession: SessionRow = session

  const desiredStatus = mapQuizStatusToSessionStatus(job.quiz.status, job.enqueued)

  const updates: Partial<SessionRow> = {}
  if (session.quiz_id !== quizId) {
    updates.quiz_id = quizId
  }
  if (session.status !== desiredStatus) {
    updates.status = desiredStatus
  }

  if (Object.keys(updates).length > 0) {
    updatedSession = await updateSession(session.id, updates)
  }

  return {
    session: updatedSession,
    article: job.article,
    quiz: job.quiz,
    normalizedUrl: job.normalizedUrl,
    enqueued: job.enqueued,
  }
}
