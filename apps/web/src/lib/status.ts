import type { QuizStatus, SessionStatus } from '@/types/db'

const TERMINAL_STATUSES: QuizStatus[] = ['ready', 'failed', 'skip_by_admin', 'skip_by_failure']

export function mapQuizStatusToSessionStatus(
  quizStatus: QuizStatus,
  enqueued: boolean
): SessionStatus {
  switch (quizStatus) {
    case 'ready':
      return 'ready'
    case 'skip_by_admin':
      return 'skip_by_admin'
    case 'skip_by_failure':
      return 'skip_by_failure'
    case 'failed':
      return enqueued ? 'pending' : 'errored'
    case 'not_required':
      return 'pending'
    default:
      return 'pending'
  }
}

export function isTerminalQuizStatus(status: QuizStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}
