'use client'

import {
  Badge,
  Box,
  Button,
  chakra,
  Field,
  Flex,
  Heading,
  Input,
  Link,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '@/components/quiz/QuestionCard'
import { toaster } from '@/components/ui/toaster'
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
        text: 'Attempt to guess the author’s conclusions before reading a single word.',
        rationale:
          'Correct. This triggers the “Pre-test Effect,” opening a knowledge gap your brain wants to fill.',
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
      'True or False: The primary reason your “Read Later” list keeps growing is a lack of personal discipline.',
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
  const [answers, setAnswers] = useState<Record<number, number | null>>({})

  const answeredCount = useMemo(() => {
    return PRESET_QUIZZES.filter((quiz) => typeof answers[quiz.id] === 'number').length
  }, [answers])

  const allAnswered = PRESET_QUIZZES.every((quiz) => typeof answers[quiz.id] === 'number')

  const handleSelect = (questionId: number, optionIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }))
  }
  return (
    <Box
      as="section"
      w="100%"
      maxW="960px"
      display="flex"
      flexDirection="column"
      gap={{ base: 4, md: 6 }}
    >
      <Flex
        as="header"
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align="flex-start"
        gap={4}
        p={{ base: 4, md: 6 }}
        borderRadius="2xl"
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
      >
        <Box flex="1">
          <Text
            textTransform="uppercase"
            letterSpacing="wider"
            fontSize="xs"
            color="gray.500"
            mb={2}
          >
            Quiz guided reading
          </Text>
          <Heading size="4xl" color="gray.900">
            {/*Stop hoarding. Start mastering.*/}
            Read Less. Understand Better.
          </Heading>
          <Link
            href="https://alpha.diffread.app/manifest"
            color="blue.600"
            fontSize="sm"
            target="_blank"
            rel="noreferrer"
          >
            Original Article
          </Link>
        </Box>
        <Badge
          px={4}
          py={2.5}
          borderRadius="full"
          borderWidth="1px"
          borderColor="gray.200"
          fontSize="sm"
          colorPalette="gray"
          variant="outline"
          alignSelf={{ base: 'stretch', md: 'flex-start' }}
          textAlign={{ base: 'center', md: 'left' }}
        >
          {answeredCount}/{PRESET_QUIZZES.length} questions answered
        </Badge>
      </Flex>

      <Box as="section">
        <VStack gap={{ base: 4, md: 6 }} align="stretch">
          {PRESET_QUIZZES.map((quiz) => (
            <QuestionCard
              key={quiz.id}
              question={quiz}
              selectedIndex={answers[quiz.id] ?? null}
              onSelect={(optionIndex) => handleSelect(quiz.id, optionIndex)}
              articleUrl={'https://alpha.diffread.app/manifest'}
            />
          ))}
        </VStack>
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
        I’m interested — unlock URL submissions
      </Button>
    </Box>
  )
}

function UrlRegistrationSection({ guestId }: { guestId: string }) {
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!url) {
      toaster.create({
        title: 'Add a URL first',
        description: 'Paste any article and we will handle the rest.',
        type: 'info',
      })
      return
    }

    setIsSubmitting(true)
    const toastId = `url-submit-${Date.now()}`
    toaster.loading({
      id: toastId,
      title: 'Analyzing quizzes…',
      description: 'This usually takes a few seconds.',
    })
    try {
      const submissionResult = await (async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (guestId) {
          headers['X-Diffread-Guest-Id'] = guestId
        }
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId: guestId, url }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to create session')
        }

        const payload = (await response.json()) as { sessionToken: string }
        const { sessionToken } = payload

        const maxAttempts = 20
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const curiosityHeaders: HeadersInit = guestId ? { 'X-Diffread-Guest-Id': guestId } : {}
          const statusResponse = await fetch(`/api/curiosity?q=${sessionToken}`, {
            headers: curiosityHeaders,
          })
          if (statusResponse.ok) {
            const statusPayload = await statusResponse.json()
            if (statusPayload.status === 'ready') {
              return { sessionToken }
            }
            if (statusPayload.status === 'failed' || statusPayload.status === 'skip_by_failure') {
              throw new Error(statusPayload.errorMessage || 'Quiz generation failed.')
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }

        throw new Error('Quiz is taking longer than expected. Please check back shortly.')
      })()

      const quizUrl = `/quiz?q=${encodeURIComponent(submissionResult.sessionToken)}`
      setUrl('')
      const attachClickableToast = () => {
        setTimeout(() => {
          const toastElements = document.querySelectorAll('[role="status"]')
          const toastEl = Array.from(toastElements).find((el) =>
            el.textContent?.includes('Quiz ready!')
          )

          if (toastEl) {
            const element = toastEl as HTMLElement
            element.style.cursor = 'pointer'
            const clickHandler = (e: Event) => {
              const target = e.target as HTMLElement
              if (!target.closest('[data-part="close-trigger"]')) {
                window.location.href = quizUrl
                toaster.dismiss(toastId)
              }
            }
            element.addEventListener('click', clickHandler, { once: true })
          }
        }, 50)
      }

      toaster.update(toastId, {
        title: 'Quiz ready!',
        description: 'Click anywhere to open now.',
        type: 'success',
        duration: Infinity,
        closable: true,
      })
      attachClickableToast()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toaster.update(toastId, {
        title: 'Quiz generation failed',
        description: message,
        type: 'error',
        duration: Infinity,
        closable: true,
      })
    } finally {
      setIsSubmitting(false)
    }
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
      <Flex
        as="header"
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align="flex-start"
        gap={4}
        p={{ base: 4, md: 6 }}
        borderRadius="2xl"
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
      >
        <Box flex="1">
          <Text
            textTransform="uppercase"
            letterSpacing="wider"
            fontSize="xs"
            color="gray.500"
            mb={2}
          >
            Submit new article
          </Text>
          <Heading size="4xl" color="gray.900">
            Ready to clear your tabs.
          </Heading>
          <Text color="gray.600" fontSize="sm">
            Drop any URL to spin up curiosity + scaffold quizzes. We’ll generate a magic link in few
            minutes.
          </Text>
        </Box>
      </Flex>

      <chakra.form
        onSubmit={handleSubmit}
        bg="white"
        borderRadius="2xl"
        borderWidth="1px"
        borderColor="gray.200"
        p={{ base: 4, md: 6 }}
      >
        <VStack gap={3} align="stretch">
          <Field.Root>
            <Field.Label>URL to read</Field.Label>
            <Input
              type="url"
              required
              placeholder="https://example.com/article"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              borderRadius="xl"
              borderColor="gray.200"
              bg="gray.50"
            />
          </Field.Root>
          <Stack direction={{ base: 'column', sm: 'row' }} gap={3}>
            <Button type="submit" colorPalette="teal" loading={isSubmitting}>
              {isSubmitting ? 'Queuing…' : 'Generate quiz'}
            </Button>
            <Button type="button" variant="outline" colorPalette="teal" onClick={() => setUrl('')}>
              Cancel
            </Button>
          </Stack>
        </VStack>
      </chakra.form>
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
