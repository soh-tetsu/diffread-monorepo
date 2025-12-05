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
      // Step 1: Submit URL to create session (run in parallel with fake delay)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (guestId) {
        headers['X-Diffread-Guest-Id'] = guestId
      }

      const endpoint = currentToken ? '/api/curiosity' : '/api/sessions'
      const body = currentToken ? { currentToken, url } : { userId: guestId, url }

      const [response] = await Promise.all([
        fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
        // Simulate: Scraping URL (min 5 seconds)
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])

      updateStatus(t('extractingMetadata'))

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

      // Wait 10 seconds for "extracting metadata" phase, then move to analyzing
      await new Promise((resolve) => setTimeout(resolve, 10000))
      updateStatus(t('analyzingArticle'))

      // Step 2: Poll quiz status until ready or failed
      const maxAttempts = 20
      let hasShownGenerating = false
      const startTime = Date.now()

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const elapsedSeconds = (Date.now() - startTime) / 1000

        // Show "Generating quizzes" after 30 seconds total elapsed time
        if (elapsedSeconds >= 30 && !hasShownGenerating) {
          updateStatus(t('generatingQuizzes'))
          hasShownGenerating = true
        }

        const statusHeaders: HeadersInit = guestId ? { 'X-Diffread-Guest-Id': guestId } : {}
        const statusResponse = await fetch(`/api/curiosity?q=${newSessionToken}`, {
          headers: statusHeaders,
        })

        if (statusResponse.ok) {
          const payload = await statusResponse.json()
          if (payload.status === 'ready') {
            // Success! Quiz is ready
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
            throw new Error(payload.errorMessage || t('generationFailed'))
          }
        }

        // Wait 3 seconds before next attempt
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      throw new Error(t('takingLonger'))
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
