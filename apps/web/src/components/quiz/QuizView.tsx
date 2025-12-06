'use client'

import { Box, Button, Popover } from '@chakra-ui/react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { ArticleSubmissionForm } from '@/components/forms/ArticleSubmissionForm'
import { IntuitionSummaryCard } from '@/components/quiz/IntuitionSummaryCard'
import { QuestionList } from '@/components/quiz/QuestionList'
import { QuizHeader } from '@/components/quiz/QuizHeader'
import { SettingsMenu } from '@/components/ui/SettingsMenu'
import { Toolbar } from '@/components/ui/Toolbar'
import { toaster } from '@/components/ui/toaster'
import { useQuizAnswers } from '@/hooks/useQuizAnswers'
import { useQuizSubmission } from '@/hooks/useQuizSubmission'
import { useUserStats } from '@/hooks/useUserStats'
import { trackQuizSelection } from '@/lib/analytics/client'
import { readGuestIdFromCookie } from '@/lib/guest/cookie'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'
import type { CuriosityQuizStatus } from '@/types/db'

type Props = {
  sessionToken: string
  articleUrl?: string | null
  articleTitle?: string | null
  hookQuestions: QuizQuestion[]
  curiosityQuizStatus: CuriosityQuizStatus | null
  questions: QuizQuestion[]
  initialInstructionsVisible?: boolean
}

const CHUNK_SIZE = 3

export function QuizView({
  sessionToken,
  articleUrl,
  articleTitle,
  hookQuestions,
  curiosityQuizStatus,
  initialInstructionsVisible = false,
  questions,
}: Props) {
  const t = useTranslations('quiz')
  const router = useRouter()
  const guestId = readGuestIdFromCookie()
  const [showForm, setShowForm] = useState(false)
  const [scaffoldVisible, setScaffoldVisible] = useState(false)
  const [visibleCuriosityCount, setVisibleCuriosityCount] = useState(CHUNK_SIZE)
  const [visibleScaffoldCount, setVisibleScaffoldCount] = useState(CHUNK_SIZE)

  // Quiz answer management
  const curiosityQuiz = useQuizAnswers(hookQuestions)
  const scaffoldQuiz = useQuizAnswers(questions)

  // Quiz submission management
  const { isSubmitting, error, submit } = useQuizSubmission()

  // User stats tracking
  const { recordSkip, recordDeepDive } = useUserStats()

  // Initialize visibility based on props
  useEffect(() => {
    if (initialInstructionsVisible && questions.length > 0) {
      setScaffoldVisible(true)
      setVisibleScaffoldCount(Math.min(CHUNK_SIZE, questions.length))
    }
  }, [initialInstructionsVisible, questions.length])

  useEffect(() => {
    setVisibleCuriosityCount(Math.min(CHUNK_SIZE, hookQuestions.length))
  }, [hookQuestions.length])

  useEffect(() => {
    setVisibleScaffoldCount(Math.min(CHUNK_SIZE, questions.length))
  }, [questions.length])

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Progress text calculation
  const progressText = useMemo(() => {
    if (scaffoldVisible && questions.length > 0) {
      return t('deepDive', { answered: scaffoldQuiz.answeredCount, total: questions.length })
    }
    if (hookQuestions.length > 0) {
      return t('checkingIntuition', {
        answered: curiosityQuiz.answeredCount,
        total: hookQuestions.length,
      })
    }
    return t('noQuestions')
  }, [
    curiosityQuiz.answeredCount,
    hookQuestions.length,
    scaffoldQuiz.answeredCount,
    questions.length,
    scaffoldVisible,
    t,
  ])

  // Track analytics when answers change
  const handleCuriositySelect = (questionId: number, optionIndex: number) => {
    curiosityQuiz.handleSelect(questionId, optionIndex)
    const question = hookQuestions.find((q) => q.id === questionId)
    if (question) {
      trackQuizSelection({
        sessionToken,
        questionId,
        selectedIndex: optionIndex,
        correct: optionIndex === question.answerIndex,
        timestamp: Date.now(),
      })
    }
  }

  const handleScaffoldSelect = (questionId: number, optionIndex: number) => {
    scaffoldQuiz.handleSelect(questionId, optionIndex)
    const question = questions.find((q) => q.id === questionId)
    if (question) {
      trackQuizSelection({
        sessionToken,
        questionId,
        selectedIndex: optionIndex,
        correct: optionIndex === question.answerIndex,
        timestamp: Date.now(),
      })
    }
  }

  const handleSubmitNewArticle = async (url: string) => {
    await submit(url, {
      guestId,
      currentToken: sessionToken,
      openInNewTab: true,
    })
    setShowForm(false)
  }

  // Determine what questions to show
  const visibleCuriosityQuestions = hookQuestions.slice(0, visibleCuriosityCount)
  const visibleScaffoldQuestions = scaffoldVisible ? questions.slice(0, visibleScaffoldCount) : []

  // Load more button logic
  const canLoadMoreCuriosity = visibleCuriosityCount < hookQuestions.length
  const canLoadMoreScaffold = scaffoldVisible && visibleScaffoldCount < questions.length
  const showIntuitionSummary =
    curiosityQuiz.allAnswered && visibleCuriosityCount >= hookQuestions.length

  // Don't show "More Quizzes" if intuition summary is displayed (it has the Deep Dive button)
  const needMoreQuestions = !scaffoldVisible && !showIntuitionSummary

  let loadMoreButton: React.ReactNode = null

  if (canLoadMoreCuriosity) {
    loadMoreButton = (
      <Button
        type="button"
        colorPalette="teal"
        variant="subtle"
        onClick={() =>
          setVisibleCuriosityCount((prev) => Math.min(prev + CHUNK_SIZE, hookQuestions.length))
        }
        width="100%"
      >
        Load more
      </Button>
    )
  } else if (canLoadMoreScaffold) {
    loadMoreButton = (
      <Button
        type="button"
        colorPalette="teal"
        variant="subtle"
        onClick={() =>
          setVisibleScaffoldCount((prev) => Math.min(prev + CHUNK_SIZE, questions.length))
        }
        width="100%"
      >
        Load more
      </Button>
    )
  } else if (needMoreQuestions) {
    loadMoreButton = (
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            type="button"
            colorPalette="gray"
            variant="subtle"
            aria-disabled="true"
            width="100%"
          >
            More Quizzes
          </Button>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content borderRadius="lg" borderColor="gray.200">
            <Popover.Arrow />
            <Popover.Body>
              <Popover.Title fontWeight="semibold" mb={2}>
                Coming Soon!
              </Popover.Title>
              <Box fontSize="sm" color="gray.700">
                We&apos;re still training the scaffold engine.
              </Box>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    )
  } else if (scaffoldVisible) {
    loadMoreButton = (
      <Button type="button" colorPalette="teal" variant="subtle" disabled width="100%">
        That's all
      </Button>
    )
  }

  return (
    <>
      <Toolbar progressText={progressText}>
        <SettingsMenu showHomeButton />
      </Toolbar>

      <Box
        as="section"
        w="100%"
        maxW="960px"
        mx="auto"
        px={4}
        py={1}
        display="flex"
        flexDirection="column"
        gap={6}
      >
        <QuizHeader
          title={articleTitle || 'Verify your intuition'}
          subtitle={t('intuitionCheck')}
          articleUrl={articleUrl}
          linkText={t('originalArticle')}
        />

        <Box as="section">
          {hookQuestions.length === 0 && questions.length === 0 ? (
            <Box
              maxW="720px"
              mx="auto"
              p={{ base: 6, md: 8 }}
              bg="white"
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="2xl"
              textAlign="center"
            >
              <Box color="gray.700">
                {curiosityQuizStatus === 'pending'
                  ? 'Questions are still generating. Refresh in a few seconds.'
                  : 'No questions available for this quiz.'}
              </Box>
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={{ base: 4, md: 6 }}>
              {visibleCuriosityQuestions.length > 0 && (
                <QuestionList
                  questions={visibleCuriosityQuestions}
                  answers={curiosityQuiz.answers}
                  articleUrl={articleUrl}
                  onSelect={handleCuriositySelect}
                />
              )}

              {/* Show intuition summary after all curiosity questions are answered */}
              {curiosityQuiz.allAnswered && visibleCuriosityCount >= hookQuestions.length && (
                <IntuitionSummaryCard
                  totalQuestions={hookQuestions.length}
                  correctCount={curiosityQuiz.correctCount}
                  onDeepDive={() => {
                    recordDeepDive(
                      hookQuestions.length,
                      curiosityQuiz.correctCount,
                      articleTitle,
                      articleUrl
                    )
                    if (questions.length > 0) {
                      setScaffoldVisible(true)
                    } else {
                      toaster.create({
                        title: 'Coming Soon!',
                        description: "We're still training the scaffold engine.",
                        type: 'info',
                      })
                    }
                  }}
                  onSkip={() => router.push('/')}
                  onRecordSkip={() =>
                    recordSkip(
                      hookQuestions.length,
                      curiosityQuiz.correctCount,
                      articleTitle,
                      articleUrl
                    )
                  }
                />
              )}

              {visibleScaffoldQuestions.length > 0 && (
                <QuestionList
                  questions={visibleScaffoldQuestions}
                  answers={scaffoldQuiz.answers}
                  articleUrl={articleUrl}
                  onSelect={handleScaffoldSelect}
                />
              )}

              {loadMoreButton}
            </Box>
          )}
        </Box>

        {!showForm && (
          <Box>
            <Button type="button" colorPalette="teal" onClick={() => setShowForm(true)}>
              {t('tryAnotherArticle')}
            </Button>
          </Box>
        )}

        {showForm && (
          <Box bg="white" borderRadius="lg" borderWidth="1px" borderColor="gray.200" p={4}>
            <ArticleSubmissionForm
              onSubmit={handleSubmitNewArticle}
              onCancel={() => setShowForm(false)}
              isLoading={isSubmitting}
              error={error}
              submitButtonText="Start quiz"
            />
          </Box>
        )}
      </Box>
    </>
  )
}
