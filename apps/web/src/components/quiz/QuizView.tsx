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
  Popover,
  Stack,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { QuestionCard } from '@/components/quiz/QuestionCard'
import { toaster } from '@/components/ui/toaster'
import { trackQuizSelection } from '@/lib/analytics/client'
import { readGuestId } from '@/lib/guest/storage'
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

export function QuizView({
  sessionToken,
  articleUrl,
  articleTitle,
  hookQuestions,
  curiosityQuizStatus,
  initialInstructionsVisible = false,
  questions,
}: Props) {
  const guestId = readGuestId()
  const [curiosityAnswers, setCuriosityAnswers] = useState<Record<number, number | null>>({})
  const [scaffoldAnswers, setScaffoldAnswers] = useState<Record<number, number | null>>({})
  const [showForm, setShowForm] = useState(false)
  const [formUrl, setFormUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const CHUNK_SIZE = 3
  const [visibleCuriosityCount, setVisibleCuriosityCount] = useState(CHUNK_SIZE)
  const [visibleScaffoldCount, setVisibleScaffoldCount] = useState(CHUNK_SIZE)
  const [scaffoldVisible, setScaffoldVisible] = useState(false)

  const curiosityAnswered = useMemo(
    () =>
      Object.values(curiosityAnswers).filter((value) => value !== null && value !== undefined)
        .length,
    [curiosityAnswers]
  )

  const scaffoldAnswered = useMemo(
    () =>
      Object.values(scaffoldAnswers).filter((value) => value !== null && value !== undefined)
        .length,
    [scaffoldAnswers]
  )

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

  const progress = useMemo(() => {
    if (scaffoldVisible && questions.length > 0) {
      return `${scaffoldAnswered}/${questions.length} scaffold answered`
    }
    if (hookQuestions.length > 0) {
      return `${curiosityAnswered}/${hookQuestions.length} curiosity answered`
    }
    return '0 answered'
  }, [curiosityAnswered, hookQuestions.length, scaffoldAnswered, questions.length, scaffoldVisible])

  const handleCuriositySelect = (questionId: number, optionIndex: number) => {
    setCuriosityAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
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
    setScaffoldAnswers((prev) => ({ ...prev, [questionId]: optionIndex }))
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showForm])

  const handleSubmitNewArticle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setFormLoading(true)
    const toastId = `quiz-submit-${Date.now()}`
    toaster.loading({
      id: toastId,
      title: 'Analyzing quizzes…',
      description: 'This usually takes a few seconds.',
    })
    try {
      const submissionResult = await (async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (guestId) headers['X-Diffread-Guest-Id'] = guestId
        const response = await fetch('/api/curiosity', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            currentToken: sessionToken,
            url: formUrl,
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          let errorMessage = payload.error || 'Failed to register article.'
          try {
            const parsed = JSON.parse(errorMessage)
            if (parsed.error?.message) {
              errorMessage = parsed.error.message
            }
          } catch {
            // Not JSON, use original message
          }
          throw new Error(errorMessage)
        }

        const data = await response.json()
        const newSessionToken = data.sessionToken

        const maxAttempts = 20
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const statusHeaders: HeadersInit = guestId ? { 'X-Diffread-Guest-Id': guestId } : {}
          const statusResponse = await fetch(`/api/curiosity?q=${newSessionToken}`, {
            headers: statusHeaders,
          })
          if (statusResponse.ok) {
            const payload = await statusResponse.json()
            if (payload.status === 'ready') {
              return { sessionToken: newSessionToken }
            }
            if (payload.status === 'failed' || payload.status === 'skip_by_failure') {
              throw new Error(payload.errorMessage || 'Quiz generation failed.')
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
        throw new Error('Quiz is taking longer than expected. Please check back shortly.')
      })()

      const quizUrl = `/quiz?q=${submissionResult.sessionToken}`
      setShowForm(false)
      setFormUrl('')
      setFormError(null)

      const makeToastClickable = () => {
        setTimeout(() => {
          const toastElements = document.querySelectorAll('[role="status"]')
          const toastEl = Array.from(toastElements).find((el) =>
            el.textContent?.includes('Quiz ready!')
          )

          if (toastEl) {
            const toastElement = toastEl as HTMLElement
            toastElement.style.cursor = 'pointer'
            const clickHandler = (e: Event) => {
              const target = e.target as HTMLElement
              if (!target.closest('[data-part="close-trigger"]')) {
                window.open(quizUrl, '_blank')
                toaster.dismiss(toastId)
              }
            }
            toastElement.addEventListener('click', clickHandler, { once: true })
          }
        }, 50)
      }

      toaster.update(toastId, {
        title: 'Quiz ready!',
        description: 'Click anywhere to open in new tab.',
        type: 'success',
        duration: Infinity,
        closable: true,
      })
      makeToastClickable()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setFormError(message)
      toaster.update(toastId, {
        title: 'Quiz generation failed',
        description: message,
        type: 'error',
        duration: Infinity,
        closable: true,
      })
    } finally {
      setFormLoading(false)
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
            Quiz guided reading
          </Text>
          <Heading size="6xl">{articleTitle || 'Verify your intuition'}</Heading>
          {articleUrl && (
            <Link
              href={articleUrl}
              color="blue.600"
              fontSize="sm"
              wordBreak="break-all"
              target="_blank"
              rel="noreferrer"
            >
              Oringial Article
            </Link>
          )}
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
          {progress}
        </Badge>
      </Flex>

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
            <Text color="gray.700">
              {curiosityQuizStatus === 'pending'
                ? 'Questions are still generating. Refresh in a few seconds.'
                : 'No questions available for this quiz.'}
            </Text>
          </Box>
        ) : (
          <VStack gap={{ base: 4, md: 6 }} align="stretch">
            {hookQuestions.slice(0, visibleCuriosityCount).map((question) => (
              <Box
                key={`curiosity-${question.id}`}
                ref={(el: HTMLDivElement | null) => {
                  questionRefs.current[question.id] = el
                }}
              >
                <QuestionCard
                  question={question}
                  articleUrl={articleUrl}
                  selectedIndex={curiosityAnswers[question.id] ?? null}
                  onSelect={(index) => handleCuriositySelect(question.id, index)}
                />
              </Box>
            ))}
            {scaffoldVisible &&
              questions.length > 0 &&
              questions.slice(0, visibleScaffoldCount).map((question) => (
                <Box
                  key={`scaffold-${question.id}`}
                  ref={(el: HTMLDivElement | null) => {
                    questionRefs.current[question.id] = el
                  }}
                >
                  <QuestionCard
                    question={question}
                    articleUrl={articleUrl}
                    selectedIndex={scaffoldAnswers[question.id] ?? null}
                    onSelect={(index) => handleScaffoldSelect(question.id, index)}
                  />
                </Box>
              ))}
            {(() => {
              // Determine if we can load more curiosity questions
              const canLoadMoreCuriosity = visibleCuriosityCount < hookQuestions.length
              // Determine if we can load more scaffold questions
              const canLoadMoreScaffold = scaffoldVisible && visibleScaffoldCount < questions.length
              // Check if scaffold needs to be generated or shown
              const needMoreQuestions = !scaffoldVisible

              let buttonLabel = "That's all"
              let buttonDisabled = true
              let buttonOnClick = () => {}
              let comingSoonPopover = false

              if (canLoadMoreCuriosity) {
                buttonLabel = 'Load more'
                buttonDisabled = false
                buttonOnClick = () =>
                  setVisibleCuriosityCount((prev) =>
                    Math.min(prev + CHUNK_SIZE, hookQuestions.length)
                  )
              } else if (canLoadMoreScaffold) {
                buttonLabel = 'Load more'
                buttonDisabled = false
                buttonOnClick = () =>
                  setVisibleScaffoldCount((prev) => Math.min(prev + CHUNK_SIZE, questions.length))
              } else if (needMoreQuestions) {
                buttonLabel = 'More Quizzes'
                buttonDisabled = true
                comingSoonPopover = true
              }

              if (comingSoonPopover) {
                return (
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <Button
                        type="button"
                        colorPalette="gray"
                        variant="subtle"
                        aria-disabled="true"
                        width="100%"
                      >
                        {buttonLabel}
                      </Button>
                    </Popover.Trigger>
                    <Popover.Positioner>
                      <Popover.Content borderRadius="lg" borderColor="gray.200">
                        <Popover.Arrow />
                        <Popover.Body>
                          <Popover.Title fontWeight="semibold" mb={2}>
                            Coming Soon!
                          </Popover.Title>
                          <Text fontSize="sm" color="gray.700">
                            We&apos;re still training the scaffold engine.
                          </Text>
                        </Popover.Body>
                      </Popover.Content>
                    </Popover.Positioner>
                  </Popover.Root>
                )
              }

              return (
                <Button
                  type="button"
                  colorPalette="teal"
                  variant="subtle"
                  disabled={buttonDisabled}
                  onClick={buttonOnClick}
                  width="100%"
                >
                  {buttonLabel}
                </Button>
              )
            })()}
          </VStack>
        )}
      </Box>

      <Flex mt={{ base: 6, md: 8 }}>
        <Button
          type="button"
          colorPalette="teal"
          onClick={() => {
            if (!showForm) {
              setShowForm(true)
            }
          }}
        >
          Try another article
        </Button>
      </Flex>

      {showForm && (
        <chakra.form onSubmit={handleSubmitNewArticle} ref={formRef}>
          <VStack gap={3} align="stretch">
            <Field.Root>
              <Field.Label>URL</Field.Label>
              <Input
                id="new-article-url"
                type="url"
                required
                placeholder="https://example.com/article"
                value={formUrl}
                onChange={(event) => setFormUrl(event.target.value)}
                borderRadius="xl"
                borderColor="gray.200"
                bg="white"
              />
            </Field.Root>
            <Stack direction={{ base: 'column', sm: 'row' }} gap={3}>
              <Button
                type="submit"
                disabled={formLoading}
                colorPalette="teal"
                w={{ base: '100%', sm: 'auto' }}
              >
                {formLoading ? 'Queuing…' : 'Start quiz'}
              </Button>
              <Button
                type="button"
                colorPalette="teal"
                variant="outline"
                w={{ base: '100%', sm: 'auto' }}
                onClick={() => {
                  setShowForm(false)
                  setFormUrl('')
                  setFormError(null)
                }}
              >
                Cancel
              </Button>
            </Stack>
            {formError && <Text color="red.600">{formError}</Text>}
          </VStack>
        </chakra.form>
      )}
    </Box>
  )
}
