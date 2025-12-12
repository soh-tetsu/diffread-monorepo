'use client'

import { Box, Button, Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuArrowRight } from 'react-icons/lu'
import useSWR from 'swr'
import { AchievementCard } from '@/components/achievement/AchievementCard'
import { ArticleSubmissionForm } from '@/components/forms/ArticleSubmissionForm'
import { IntuitionSummaryCard } from '@/components/quiz/IntuitionSummaryCard'
import { QuestionList } from '@/components/quiz/QuestionList'
import { QuizHeader } from '@/components/quiz/QuizHeader'
import { AppToolbar } from '@/components/ui/AppToolbar'
import { toaster } from '@/components/ui/toaster'
import { useQuizAnswers } from '@/hooks/useQuizAnswers'
import { useQuizSubmission } from '@/hooks/useQuizSubmission'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useUserStats } from '@/hooks/useUserStats'
import { readGuestIdFromCookie, renewGuestIdCookie } from '@/lib/guest/cookie'
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
    const stored = readGuestIdFromCookie()
    if (stored) {
      setGuestId(stored)
    }
    setIsReady(true)
  }, [])

  const persistGuestId = useCallback((value: string) => {
    renewGuestIdCookie(value)
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
      <AppToolbar
        progressText={t('progressChecking', {
          answered: answeredCount,
          total: PRESET_QUIZZES.length,
        })}
      />

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

const queueCountFetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) return { count: 0, firstSessionToken: null }
  return res.json()
}

function UrlRegistrationSection({ guestId }: { guestId: string }) {
  const t = useTranslations('home')
  const { isSubmitting, error, submit } = useQuizSubmission()
  const { stats } = useUserStats()

  // Use SWR for queue count - shares cache with AppToolbar
  const { data: queueData } = useSWR<{ count: number; firstSessionToken: string | null }>(
    '/api/queue-count',
    queueCountFetcher,
    {
      refreshInterval: 30000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  )

  const queueCount = queueData?.count ?? 0
  const firstSessionToken = queueData?.firstSessionToken

  const handleSubmit = async (url: string) => {
    await submit(url)
  }

  return (
    <>
      <AppToolbar />

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

        {/* Queue Banner */}
        {queueCount > 0 && firstSessionToken && (
          <Box bg="teal.50" borderWidth="2px" borderColor="teal.300" borderRadius="lg" p={4}>
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              align={{ base: 'stretch', sm: 'center' }}
              justify="space-between"
              gap={3}
            >
              <Text fontSize="md" fontWeight="semibold" color="teal.900">
                {t('queueBanner', { count: queueCount })}
              </Text>
              <Button asChild size="sm" colorPalette="teal" variant="solid" flexShrink={0}>
                <NextLink href={`/quiz?q=${firstSessionToken}`}>
                  <Text>{t('queueBannerAction')}</Text>
                </NextLink>
              </Button>
            </Flex>
          </Box>
        )}

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
  const { hasCompletedOnboarding, isLoading: isLoadingProfile, refetch } = useUserProfile()
  const [mode, setMode] = useState<'loading' | 'onboarding' | 'register'>('loading')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Check URL parameter for onboarding trigger - no dependency array to run on every render
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const shouldShowOnboarding = params.get('onboarding') === 'true'

    if (shouldShowOnboarding && !showOnboarding) {
      setShowOnboarding(true)
      // Clean up URL after detecting the parameter
      window.history.replaceState({}, '', '/')
    }
  })

  useEffect(() => {
    if (!isReady) return

    // Priority 1: Explicitly triggered from menu - always show
    if (showOnboarding) {
      setMode('onboarding')
      return
    }

    // Priority 2: Loading profile
    if (isLoadingProfile) {
      setMode('loading')
      return
    }

    // Priority 3: No guestId and not completed - show automatically
    if (!hasCompletedOnboarding && !guestId) {
      setMode('onboarding')
      return
    }

    // Default: Show register form
    setMode('register')
  }, [isReady, isLoadingProfile, hasCompletedOnboarding, showOnboarding, guestId])

  // Handle error messages from share target redirects
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')

    if (error) {
      let errorMessage = 'Unknown error'
      if (error === 'missing-url') {
        errorMessage = t('shareMissingUrl')
      } else if (error === 'invalid-url') {
        errorMessage = t('shareInvalidUrl')
      } else if (error === 'share-failed') {
        errorMessage = t('shareFailedError')
      } else if (error === 'pdf-upload-failed') {
        errorMessage = t('pdfUploadFailed')
      }

      toaster.create({
        title: t('shareErrorTitle'),
        description: errorMessage,
        type: 'error',
      })

      // Clean up URL
      window.history.replaceState({}, '', '/')
    }
  }, [t])

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

      // Force refresh user profile to update hasCompletedOnboarding across all instances
      await refetch()

      // Reset explicit trigger flag so mode selection logic can respond to hasCompletedOnboarding
      setShowOnboarding(false)

      toaster.create({
        title: t('guestProfileReady'),
        description: t('urlSubmissionsUnlocked'),
        type: 'success',
      })
      // Mode will be updated automatically by the useEffect watching hasCompletedOnboarding
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
