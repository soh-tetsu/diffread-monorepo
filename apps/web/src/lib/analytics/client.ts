export type QuizEventPayload = {
  sessionToken: string
  questionId: number
  selectedIndex: number
  correct: boolean
  timestamp: number
}

const EVENT_NAME = 'diffread:quiz-selection'

export function trackQuizSelection(payload: QuizEventPayload) {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }))
}
