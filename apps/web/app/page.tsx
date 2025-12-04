'use client'

import { Box, Button, Flex, Spinner, Stack, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useState } from 'react'
import { AchievementCard } from '@/components/achievement/AchievementCard'
import { ArticleSubmissionForm } from '@/components/forms/ArticleSubmissionForm'
import { IntuitionSummaryCard } from '@/components/quiz/IntuitionSummaryCard'
import { QuestionList } from '@/components/quiz/QuestionList'
import { QuizHeader } from '@/components/quiz/QuizHeader'
import { toaster } from '@/components/ui/toaster'
import { useQuizAnswers } from '@/hooks/useQuizAnswers'
import { useQuizSubmission } from '@/hooks/useQuizSubmission'
import { useUserStats } from '@/hooks/useUserStats'
import { readGuestId, writeGuestId } from '@/lib/guest/storage'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'

const PRESET_QUIZZES: QuizQuestion[] = [
  {
    id: -1,
    category: 'Scenario · Strategy: The Simulation',
    prompt:
      'You are about to tackle a dense 5,000-word essay on a new subject. According to cognitive science, which approach will help you retain the most information?',
    options: [
      {
        text: "Attempt to guess the author's conclusions before reading a single word.",
        rationale:
          'Correct. This triggers the "Pre-test Effect," opening a knowledge gap your brain wants to fill.',
      },
      {
        text: "Read the text carefully from start to finish to ensure you don't miss context.",
        rationale: 'Incorrect. Passive reading often leads to brain rot and low retention.',
      },
    ],
    answerIndex: 0,
    remediationPointer:
      "Don't Read. Start Guessing.\n\nActually, the best way to start reading is to predict the answers first. This isn't cheating; it's priming. By guessing, you turn passive consumption into an active hunt for answers.",
    sourceLocation: {
      anchorText: 'The Science: Why "Guessing" Makes You a Better Reader',
    },
  },
  {
    id: -2,
    category: 'Confirmative · Strategy: The Validation Check',
    prompt:
      'True or False: The primary reason your "Read Later" list keeps growing is a lack of personal discipline.',
    options: [
      {
        text: 'True',
        rationale: 'Not quite. The text argues this is a structural problem, not a character flaw.',
      },
      {
        text: 'False',
        rationale:
          "Correct. You aren't lazy; you just lack the right leverage for high-friction tasks.",
      },
    ],
    answerIndex: 1,
    remediationPointer:
      "It's Not Laziness. It's Friction.\n\nYour list is a graveyard of good intentions because reading to learn requires high energy in a low-energy world. The problem isn't your work ethic; it's that you are trying to work without leverage.",
    sourceLocation: {
      anchorText: 'The Reality: The "Read Later" Graveyard',
    },
  },
] satisfies QuizQuestion[]

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
  return (
    <Flex minH="100vh" align="center" justify="center" bg="gray.50">
      <Stack gap={10} align="center">
        <Spinner color="blue.500" size="lg" />
        <Text fontSize="sm" color="gray.600">
          Warming up Diffread…
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
  const { answers, answeredCount, correctCount, allAnswered, handleSelect } =
    useQuizAnswers(PRESET_QUIZZES)

  return (
    <Box
      as="section"
      w="100%"
      maxW="960px"
      display="flex"
      flexDirection="column"
      gap={{ base: 4, md: 6 }}
    >
      <QuizHeader
        title="Read Less. Understand Better."
        subtitle="Intuition Check"
        articleUrl="https://alpha.diffread.app/manifest"
        progressText={`Checking intuition: ${answeredCount}/${PRESET_QUIZZES.length}`}
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
        loadingText="Creating guest profile"
        width="100%"
      >
        I'm interested — unlock URL submissions
      </Button>
    </Box>
  )
}

function UrlRegistrationSection({ guestId }: { guestId: string }) {
  const { isSubmitting, error, submit } = useQuizSubmission()
  const { stats } = useUserStats()

  const handleSubmit = async (url: string) => {
    await submit(url, { guestId })
  }

  return (
    <Box
      as="section"
      w="100%"
      maxW="960px"
      display="flex"
      flexDirection="column"
      gap={{ base: 6, md: 8 }}
    >
      <QuizHeader title="Ready to clear your tabs." subtitle="Submit new article" progressText="" />

      {/* Achievement Card */}
      <AchievementCard stats={stats} />

      <Box
        bg="white"
        borderRadius="2xl"
        borderWidth="1px"
        borderColor="gray.200"
        p={{ base: 4, md: 6 }}
      >
        <Text color="gray.600" fontSize="sm" mb={4}>
          Drop any URL to check your intuition. We'll generate a magic link in minutes.
        </Text>
        <ArticleSubmissionForm
          onSubmit={handleSubmit}
          onCancel={() => {}}
          isLoading={isSubmitting}
          error={error}
        />
      </Box>
    </Box>
  )
}

export default function HomePage() {
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
        title: 'Guest profile ready',
        description: 'URL submissions unlocked.',
        type: 'success',
      })
      setMode('register')
    } catch (error) {
      toaster.create({
        title: 'Unable to unlock submissions',
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
      py={8}
      px={4}
      display="flex"
      justifyContent="center"
      color="gray.900"
    >
      {content}
    </Box>
  )
}
