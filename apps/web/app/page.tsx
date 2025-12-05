'use client'

import { Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AchievementCard } from '@/components/achievement/AchievementCard'
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
import { readGuestId, writeGuestId } from '@/lib/guest/storage'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'

function usePresetQuizzes(): QuizQuestion[] {
  const t = useTranslations('home.presetQuiz')

  return useMemo(
    () =>
      [
        {
          id: -1,
          category: t('question1.category'),
          prompt: t('question1.prompt'),
          options: [
            {
              text: t('question1.option1'),
              rationale: t('question1.option1Rationale'),
            },
            {
              text: t('question1.option2'),
              rationale: t('question1.option2Rationale'),
            },
          ],
          answerIndex: 0,
          remediationBody: t('question1.remediationBody'),
          sourceLocation: {
            anchorText: t('question1.sourceAnchor'),
          },
        },
        {
          id: -2,
          category: t('question2.category'),
          prompt: t('question2.prompt'),
          options: [
            {
              text: t('question2.option1'),
              rationale: t('question2.option1Rationale'),
            },
            {
              text: t('question2.option2'),
              rationale: t('question2.option2Rationale'),
            },
          ],
          answerIndex: 1,
          remediationBody: t('question2.remediationBody'),
          sourceLocation: {
            anchorText: t('question2.sourceAnchor'),
          },
        },
      ] satisfies QuizQuestion[],
    [t]
  )
}

type GuestProfileState = {
  guestId: string | null
  isReady: boolean
  persistGuestId: (value: string) => void
}

function useGuestProfile(): GuestProfileState {
  const [guestId, setGuestId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const stored = readGuestId()
    if (stored) {
      setGuestId(stored)
    }
    setIsReady(true)
  }, [])

  const persistGuestId = useCallback((value: string) => {
    writeGuestId(value)
    setGuestId(value)
  }, [])

  return { guestId, isReady, persistGuestId }
}

function LoadingScreen() {
  const t = useTranslations('home')

  return (
    <Flex minH="100vh" align="center" justify="center" bg="gray.50">
      <Stack gap={10} align="center">
        <Spinner color="blue.500" size="lg" />
        <Text fontSize="sm" color="gray.600">
          {t('loadingMessage')}
        </Text>
      </Stack>
    </Flex>
  )
}

function OnboardingSection({
  onUnlock,
  isUnlocking,
}: {
  onUnlock: () => void
  isUnlocking: boolean
}) {
  const t = useTranslations('home')
  const PRESET_QUIZZES = usePresetQuizzes()
  const { answers, answeredCount, correctCount, allAnswered, handleSelect } =
    useQuizAnswers(PRESET_QUIZZES)

  return (
    <>
      <Toolbar
        progressText={t('progressChecking', {
          answered: answeredCount,
          total: PRESET_QUIZZES.length,
        })}
      >
        <SettingsMenu showHomeButton={false} />
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
          title={t('title')}
          subtitle={t('subtitle')}
          articleUrl="https://alpha.diffread.app/manifest"
        />

        <Box as="section" display="flex" flexDirection="column" gap={{ base: 4, md: 6 }}>
          <QuestionList
            questions={PRESET_QUIZZES}
            answers={answers}
            articleUrl="https://alpha.diffread.app/manifest"
            onSelect={handleSelect}
          />

          {/* Show intuition summary after all questions are answered */}
          {allAnswered && (
            <IntuitionSummaryCard
              totalQuestions={PRESET_QUIZZES.length}
              correctCount={correctCount}
              onDeepDive={() => onUnlock()}
            />
          )}
        </Box>

        <Button
          type="button"
          colorPalette="teal"
          size="lg"
          onClick={onUnlock}
          disabled={!allAnswered || isUnlocking}
          loading={isUnlocking}
          loadingText={t('unlockButtonLoading')}
          width="100%"
        >
          {t('unlockButton')}
        </Button>
      </Box>
    </>
  )
}

function UrlRegistrationSection({ guestId }: { guestId: string }) {
  const t = useTranslations('home')
  const { isSubmitting, error, submit } = useQuizSubmission()
  const { stats } = useUserStats()

  const handleSubmit = async (url: string) => {
    await submit(url, { guestId })
  }

  return (
    <>
      <Toolbar>
        <SettingsMenu showHomeButton={false} />
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
        <QuizHeader title={t('readyTitle')} subtitle={t('submitSubtitle')} />

        {/* Achievement Card */}
        <AchievementCard stats={stats} />

        <Box bg="white" borderRadius="lg" borderWidth="1px" borderColor="gray.200" p={4}>
          <Text color="gray.600" fontSize="sm" mb={4}>
            {t('submitDescription')}
          </Text>
          <ArticleSubmissionForm
            onSubmit={handleSubmit}
            onCancel={() => {}}
            isLoading={isSubmitting}
            error={error}
          />
        </Box>
      </Box>
    </>
  )
}

export default function HomePage() {
  const t = useTranslations('toaster')
  const { guestId, isReady, persistGuestId } = useGuestProfile()
  const [mode, setMode] = useState<'loading' | 'onboarding' | 'register'>('loading')
  const [isUnlocking, setIsUnlocking] = useState(false)

  useEffect(() => {
    if (!isReady) return
    setMode(guestId ? 'register' : 'onboarding')
  }, [guestId, isReady])

  const handleUnlock = async () => {
    setIsUnlocking(true)
    try {
      const response = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: guestId ?? undefined,
          onboardingCompleted: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to provision guest profile')
      }

      const payload = (await response.json()) as { userId: string }
      persistGuestId(payload.userId)
      toaster.create({
        title: t('guestProfileReady'),
        description: t('urlSubmissionsUnlocked'),
        type: 'success',
      })
      setMode('register')
    } catch (error) {
      toaster.create({
        title: t('unableToUnlock'),
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      })
    } finally {
      setIsUnlocking(false)
    }
  }

  if (!isReady || mode === 'loading') {
    return <LoadingScreen />
  }

  const content =
    mode === 'onboarding' ? (
      <OnboardingSection onUnlock={handleUnlock} isUnlocking={isUnlocking} />
    ) : (
      guestId && <UrlRegistrationSection guestId={guestId} />
    )

  return (
    <Box
      as="main"
      minH="100vh"
      bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
      color="gray.900"
    >
      {content}
    </Box>
  )
}
