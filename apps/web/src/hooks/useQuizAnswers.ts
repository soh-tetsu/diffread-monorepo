import { useMemo, useState } from 'react'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'

export type QuizAnswers = Record<number, number | null>

export type UseQuizAnswersReturn = {
  answers: QuizAnswers
  answeredCount: number
  correctCount: number
  allAnswered: boolean
  handleSelect: (questionId: number, optionIndex: number) => void
  resetAnswers: () => void
}

/**
 * Hook for managing quiz answer state and calculating scores.
 *
 * @param questions - Array of quiz questions
 * @returns Answer state, counts, and selection handler
 */
export function useQuizAnswers(questions: QuizQuestion[]): UseQuizAnswersReturn {
  const [answers, setAnswers] = useState<QuizAnswers>({})

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => value !== null && value !== undefined).length,
    [answers]
  )

  const correctCount = useMemo(() => {
    return questions.filter((q) => {
      const selectedIndex = answers[q.id]
      return (
        selectedIndex !== null && selectedIndex !== undefined && selectedIndex === q.answerIndex
      )
    }).length
  }, [answers, questions])

  const allAnswered = useMemo(
    () => questions.length > 0 && answeredCount === questions.length,
    [answeredCount, questions.length]
  )

  const handleSelect = (questionId: number, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }))
  }

  const resetAnswers = () => {
    setAnswers({})
  }

  return {
    answers,
    answeredCount,
    correctCount,
    allAnswered,
    handleSelect,
    resetAnswers,
  }
}
