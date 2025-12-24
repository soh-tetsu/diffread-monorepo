import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useNotification } from '@/components/ui/NotificationBanner'

type SubmissionOptions = {
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
  const notification = useNotification()
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
            notification.dismiss(toastId)
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
    const { currentToken, openInNewTab = false } = options

    setIsSubmitting(true)
    setError(null)

    const toastId = `quiz-submit-${Date.now()}`

    notification.show({
      id: toastId,
      title: t('submittingUrl'),
      type: 'loading',
      duration: Infinity,
    })

    try {
      // Step 1: Submit URL to create session
      // Cookie is automatically sent by browser (contains guestId)
      // currentToken is optional - if provided, validates it belongs to this guest
      const response = await fetch('/api/curiosity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ url, currentToken }),
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

      const data = (await response.json()) as {
        sessionToken: string
        status: string
        queueStatus: {
          total: number
          sessionTokens: string[]
        }
        errorMessage: string | null
      }
      const newSessionToken = data.sessionToken

      // Handle queue full case - status is still bookmarked means queue is full
      if (data.status === 'bookmarked') {
        // Check if there are ready quizzes in the queue
        if (data.queueStatus.total >= 2) {
          notification.show({
            title: t('queueFull'),
            description: t('readyQuizzesAvailable', { count: data.queueStatus.total }),
            type: 'info',
            duration: Infinity,
            action: {
              label: t('goToQueue'),
              onClick: () => {
                window.location.href = '/bookmarks'
                notification.dismiss(toastId)
              },
            },
          })
        } else {
          notification.show({
            title: t('queueFull'),
            description: t('queueFullDescription'),
            type: 'info',
            duration: 10000,
          })
        }

        return { sessionToken: newSessionToken }
      }

      // Step 2: Poll session status immediately and continuously
      const maxAttempts = 40 // Increase attempts since we're polling faster

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        // Cookie is automatically sent by browser
        const statusResponse = await fetch(`/api/session-status?q=${newSessionToken}`, {
          credentials: 'same-origin',
        })

        if (statusResponse.ok) {
          const payload = await statusResponse.json()

          // Update toast based on real status
          if (payload.status === 'pending') {
            notification.show({
              id: toastId,
              title: t('willStartSoon'),
              type: 'loading',
              duration: Infinity,
            })
          } else if (payload.status === 'processing') {
            notification.show({
              id: toastId,
              title: t('workingOnIt'),
              type: 'loading',
              duration: Infinity,
            })
          } else if (payload.status === 'ready') {
            const quizUrl = `/quiz?q=${encodeURIComponent(newSessionToken)}`

            notification.show({
              id: toastId,
              title: t('quizReady'),
              type: 'success',
              duration: Infinity,
              action: {
                label: openInNewTab ? t('openInNewTab') : t('open'),
                onClick: () => {
                  window.location.href = quizUrl
                  notification.dismiss(toastId)
                },
              },
            })

            makeToastClickable(toastId, quizUrl, openInNewTab)

            return { sessionToken: newSessionToken }
          } else if (
            payload.status === 'failed' ||
            payload.status === 'skip_by_failure' ||
            payload.status === 'errored' ||
            payload.status === 'skip_by_admin'
          ) {
            throw new Error(payload.errorMessage || t('generationFailed'))
          }
        }

        // Wait 3 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      throw new Error(t('takingLonger'))
    } catch (_err) {
      const message = _err instanceof Error ? _err.message : 'Unknown error'
      setError(message)

      notification.show({
        id: toastId,
        title: t('generationFailed'),
        description: message,
        type: 'error',
        duration: Infinity,
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
