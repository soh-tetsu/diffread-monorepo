import type { QuizCard } from '@diffread/question-engine'

type RawQuizCard = Partial<QuizCard>
type RawQuizOption = Partial<QuizCard['options'][number]>
type RawRemediation = Partial<QuizCard['remediation']>

export type QuizOption = {
  text: string
  rationale?: string
}

export type QuizSourceLocation = {
  anchorText: string
  estimatedParagraph?: number
}

export type QuizQuestion = {
  id: number
  category: string
  prompt: string
  options: QuizOption[]
  answerIndex: number
  sourceLocation?: QuizSourceLocation
  remediationPointer?: string
  relevantContext?: string
}

function isQuizCard(input: unknown): input is RawQuizCard {
  if (!input || typeof input !== 'object') {
    return false
  }

  const card = input as RawQuizCard
  return (
    typeof card.question === 'string' &&
    typeof card.format === 'string' &&
    Array.isArray(card.options)
  )
}

function normalizeOptions(options: RawQuizOption[] | undefined) {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      normalized: [],
      answerIndex: 0,
    }
  }

  const normalized = options.map((option) => ({
    text: typeof option?.text === 'string' ? option.text : '',
    rationale: typeof option?.feedback === 'string' ? option.feedback : undefined,
  }))

  const correctIndex = options.findIndex((option) => option?.is_correct === true)

  return {
    normalized,
    answerIndex: correctIndex >= 0 ? correctIndex : 0,
  }
}

function buildSourceLocation(
  remediation: RawRemediation | undefined
): QuizSourceLocation | undefined {
  if (!remediation || typeof remediation !== 'object') {
    return undefined
  }

  const anchorText =
    typeof remediation.go_read_anchor === 'string' ? remediation.go_read_anchor : ''

  if (!anchorText.trim()) {
    return undefined
  }

  return {
    anchorText,
  }
}

function buildRemediationPointer(remediation: RawRemediation | undefined): string | undefined {
  if (!remediation || typeof remediation !== 'object') {
    return undefined
  }

  const headline = typeof remediation.headline === 'string' ? remediation.headline.trim() : ''
  const body = typeof remediation.body === 'string' ? remediation.body.trim() : ''
  const parts = [headline, body].filter(Boolean)

  if (parts.length === 0) {
    return undefined
  }

  return parts.join('\n\n')
}

export function normalizeHookQuestions(hooks: unknown): QuizQuestion[] {
  if (!Array.isArray(hooks)) {
    return []
  }

  const quizCards = hooks.filter(isQuizCard)

  return quizCards.map((card, index) => {
    const { normalized: options, answerIndex } = normalizeOptions(card.options)

    return {
      id: -(index + 1),
      category: card.format?.toLowerCase() ?? 'hook',
      prompt: card.question ?? '',
      options,
      answerIndex,
      sourceLocation: buildSourceLocation(card.remediation),
      remediationPointer: buildRemediationPointer(card.remediation),
    }
  })
}
