'use client'

import { Box, Button, Heading, Text } from '@chakra-ui/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect } from 'react'
import useSWR from 'swr'
import { QuizView } from '@/components/quiz/QuizView'
import type { QuizQuestion } from '@/lib/quiz/normalize-curiosity-quizzes'
import { normalizeHookQuestions } from '@/lib/quiz/normalize-curiosity-quizzes'
import type { CuriosityQuizStatus, ScaffoldQuizStatus, SessionStatus } from '@/types/db'

type QuizMetaResponse = {
  session: {
    session_token: string
    status: SessionStatus
    article_url: string | null
    user_id: string
  }
  article: {
    id: number
    status: string
    metadata: {
      title: string | null
    }
  } | null
}

type CuriosityQuizResponse = {
  status: CuriosityQuizStatus
  questions: unknown
  errorMessage: string | null
}

type ScaffoldQuizResponse = {
  status: ScaffoldQuizStatus
  questions: QuizQuestion[]
  errorMessage: string | null
}

const GUEST_BINDING_ERROR = 'guest-binding-mismatch'

const fetcher = async (url: string) => {
  // Cookie is automatically sent by browser
  const res = await fetch(url, { credentials: 'same-origin' })
  if (res.status === 403) throw new Error(GUEST_BINDING_ERROR)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

// SWR config for Suspense mode
const swrConfig = {
  suspense: false, // Disable suspense mode to prevent hydration issues
  revalidateOnFocus: false,
}

function QuizPageContent() {
  const t = useTranslations('quizPage')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('q') ?? null
  const showInstructions = searchParams?.get('show') === 'instructions'

  // Fetch quiz metadata (session + article info)
  const { data: quizMeta, error: metaError } = useSWR<QuizMetaResponse>(
    token ? `/api/quiz?q=${token}` : null,
    fetcher,
    swrConfig
  )

  // Fetch curiosity quiz questions
  const { data: curiosityQuizData, error: curiosityQuizError } = useSWR<CuriosityQuizResponse>(
    token ? `/api/curiosity?q=${token}` : null,
    fetcher,
    swrConfig
  )

  // Fetch scaffold quiz questions (only if session is ready or if user explicitly wants to see them)
  const { data: scaffoldQuizData } = useSWR<ScaffoldQuizResponse>(
    token && (quizMeta?.session.status === 'ready' || showInstructions)
      ? `/api/scaffold?q=${token}`
      : null,
    fetcher,
    swrConfig
  )

  // Redirect to homepage if no token is provided
  useEffect(() => {
    if (!token) {
      router.push('/')
    }
  }, [token, router])

  // Guest ID is now managed via cookie (auto-renewed in root layout)
  // No need to manually sync here

  // Don't render anything while redirecting
  if (!token) {
    return null
  }

  const guestMismatch =
    metaError?.message === GUEST_BINDING_ERROR ||
    curiosityQuizError?.message === GUEST_BINDING_ERROR

  if (guestMismatch) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading as="h1" size="xl" mb={3} color="gray.900">
            {t('sessionSecured')}
          </Heading>
          <Text color="gray.700" mb={6}>
            {t('wrongGuestProfile')}
          </Text>
          <Button colorPalette="teal" onClick={() => router.push('/')}>
            {t('goToHomepage')}
          </Button>
        </Box>
      </Box>
    )
  }

  if (metaError || curiosityQuizError) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading as="h1" size="xl" mb={3} color="gray.900">
            Something went wrong.
          </Heading>
          <Text fontSize="md" color="fg.muted">
            {metaError?.message || curiosityQuizError?.message || 'Unknown error.'}
          </Text>
        </Box>
      </Box>
    )
  }

  // Handle loading state
  if (!quizMeta || !curiosityQuizData) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Text color="gray.700" fontSize="lg">
            Loading quiz…
          </Text>
        </Box>
      </Box>
    )
  }

  // Handle failed curiosity quiz generation
  if (
    (curiosityQuizData.status === 'failed' || curiosityQuizData.status === 'skip_by_failure') &&
    curiosityQuizData.errorMessage
  ) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="450px"
          w="full"
          p={10}
          bg="white"
          borderWidth="1px"
          borderColor="red.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading size="4xl">Quiz generation failed</Heading>
          <Text fontSize="md" color="fg.muted">
            {curiosityQuizData.errorMessage}
          </Text>
        </Box>
      </Box>
    )
  }

  // Normalize questions
  const curiosityQuestions = normalizeHookQuestions(curiosityQuizData.questions)
  const scaffoldQuestions = scaffoldQuizData?.questions || []

  return (
    <Box
      as="main"
      id="quiz-top"
      minH="100vh"
      bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
      color="gray.900"
    >
      <QuizView
        sessionToken={token}
        articleUrl={quizMeta.session.article_url}
        articleTitle={quizMeta.article?.metadata?.title ?? null}
        initialInstructionsVisible={showInstructions}
        hookQuestions={curiosityQuestions}
        curiosityQuizStatus={curiosityQuizData.status}
        questions={scaffoldQuestions}
      />
    </Box>
  )
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <Box
          minH="100vh"
          bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
          py={8}
          px={4}
          display="flex"
          justifyContent="center"
          color="gray.900"
        >
          <Box
            maxW="720px"
            w="full"
            p={8}
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="2xl"
            textAlign="center"
            shadow="lg"
            alignSelf="flex-start"
            mt={8}
          >
            <Text color="gray.700" fontSize="lg">
              Loading quiz…
            </Text>
          </Box>
        </Box>
      }
    >
      <QuizPageContent />
    </Suspense>
  )
}
