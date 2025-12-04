'use client'

import { Box, VStack } from '@chakra-ui/react'
import { QuestionCard } from '@/components/quiz/QuestionCard'
import type { QuizAnswers } from '@/hooks/useQuizAnswers'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'

type Props = {
  questions: QuizQuestion[]
  answers: QuizAnswers
  articleUrl?: string | null
  onSelect: (questionId: number, optionIndex: number) => void
}

export function QuestionList({ questions, answers, articleUrl, onSelect }: Props) {
  return (
    <VStack gap={{ base: 4, md: 6 }} align="stretch">
      {questions.map((question) => (
        <Box key={question.id}>
          <QuestionCard
            question={question}
            articleUrl={articleUrl}
            selectedIndex={answers[question.id] ?? null}
            onSelect={(index) => onSelect(question.id, index)}
          />
        </Box>
      ))}
    </VStack>
  )
}
