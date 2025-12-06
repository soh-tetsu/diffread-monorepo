import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toaster } from '@/components/ui/toaster'

type SubmissionOptions = {
  guestId?: string | null
  currentToken?: string
  openInNewTab?: boolean
}

type SubmissionResult = {
  sessionToken: string
}

export type UseQuizSubmissionReturn = {
  isSubmitting: boolean
  error: string | null
  submit: (url: string, options?: SubmissionOptions) => Promise<SubmissionResult | null>
  reset: () => void
}

/**
 * Hook for handling quiz submission with polling and toast notifications.
 *
 * Workflow:
 * 1. Submit URL to create/enqueue quiz
 * 2. Poll quiz status endpoint until ready/failed
 * 3. Show toast notifications with clickable link
 *
 * @returns Submission state and submit handler
 */
export function useQuizSubmission(): UseQuizSubmissionReturn {
  const t = useTranslations('quizSubmission')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const makeToastClickable = (toastId: string, quizUrl: string, openInNewTab = false) => {
    setTimeout(() => {
      const toastElements = document.querySelectorAll('[role="status"]')
      const toastEl = Array.from(toastElements).find((el) =>
        el.textContent?.includes(t('quizReady'))
      )

      if (toastEl) {
        const element = toastEl as HTMLElement
        element.style.cursor = 'pointer'
        const clickHandler = (e: Event) => {
          const target = e.target as HTMLElement
          if (!target.closest('[data-part="close-trigger"]')) {
            if (openInNewTab) {
              window.open(quizUrl, '_blank')
            } else {
              window.location.href = quizUrl
            }
            toaster.dismiss(toastId)
          }
        }
        element.addEventListener('click', clickHandler, { once: true })
      }
    }, 50)
  }

  const submit = async (
    url: string,
    options: SubmissionOptions = {}
  ): Promise<SubmissionResult | null> => {
    const { guestId, currentToken, openInNewTab = false } = options

    setIsSubmitting(true)
    setError(null)

    const toastId = `quiz-submit-${Date.now()}`

    // Progressive status updates
    const updateStatus = (title: string) => {
      toaster.update(toastId, {
        title,
        type: 'loading',
      })
    }

    toaster.loading({
      id: toastId,
      title: t('scrapingUrl'),
    })

    try {
      // Step 1: Submit URL to create session
      // Cookie is automatically sent by browser
      const endpoint = currentToken ? '/api/curiosity' : '/api/sessions'
      const body = currentToken ? { currentToken, url } : { userId: guestId, url }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        let errorMessage = payload.error || payload.message || 'Failed to create session'

        // Try to extract nested error message
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

      const data = (await response.json()) as { sessionToken: string }
      const newSessionToken = data.sessionToken

      // Step 2: Start fake progress messages in background (non-blocking)
      const startTime = Date.now()
      const progressInterval = setInterval(() => {
        const elapsedSeconds = (Date.now() - startTime) / 1000

        if (elapsedSeconds >= 5 && elapsedSeconds < 15) {
          updateStatus(t('extractingMetadata'))
        } else if (elapsedSeconds >= 15 && elapsedSeconds < 30) {
          updateStatus(t('analyzingArticle'))
        } else if (elapsedSeconds >= 30) {
          updateStatus(t('generatingQuizzes'))
        }
      }, 1000) // Check every second

      // Step 3: Poll quiz status immediately and continuously
      const maxAttempts = 40 // Increase attempts since we're polling faster

      try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          // Cookie is automatically sent by browser
          const statusResponse = await fetch(`/api/curiosity?q=${newSessionToken}`, {
            credentials: 'same-origin',
          })

          if (statusResponse.ok) {
            const payload = await statusResponse.json()
            if (payload.status === 'ready') {
              // Success! Quiz is ready - stop fake progress
              clearInterval(progressInterval)

              const quizUrl = `/quiz?q=${encodeURIComponent(newSessionToken)}`

              toaster.update(toastId, {
                title: t('quizReady'),
                description: openInNewTab ? t('clickToOpenNewTab') : t('clickToOpen'),
                type: 'success',
                duration: Infinity,
                closable: true,
              })

              makeToastClickable(toastId, quizUrl, openInNewTab)

              return { sessionToken: newSessionToken }
            }

            if (payload.status === 'failed' || payload.status === 'skip_by_failure') {
              clearInterval(progressInterval)
              throw new Error(payload.errorMessage || t('generationFailed'))
            }
          }

          // Wait 3 seconds before next poll
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }

        clearInterval(progressInterval)
        throw new Error(t('takingLonger'))
      } catch (err) {
        clearInterval(progressInterval)
        throw err
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)

      toaster.update(toastId, {
        title: t('generationFailed'),
        description: message,
        type: 'error',
        duration: Infinity,
        closable: true,
      })

      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  const reset = () => {
    setError(null)
    setIsSubmitting(false)
  }

  return {
    isSubmitting,
    error,
    submit,
    reset,
  }
}
