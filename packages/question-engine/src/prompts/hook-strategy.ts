import type { ArticleMetadata } from '../types'
import {
  renderAcademicPrompt,
  renderHighStakesPrompt,
  renderImpactPrompt,
  renderMythBusterPrompt,
} from './hook-templates'
import type { PromptContext, PromptDefinition } from './types'

type StrategyGroup = {
  archetypes: string[]
  definition: PromptDefinition
}

function assertHookContext(context: PromptContext): asserts context is PromptContext & {
  metadata: NonNullable<PromptContext['metadata']>
  text: string
} {
  if (!context.metadata) {
    throw new Error('strategy prompt requires metadata from analyzeArticleMetadata')
  }
  if (!context.text || !context.text.trim()) {
    throw new Error('strategy prompt requires article text')
  }
}

type TemplateRenderer = (metadata: ArticleMetadata, text: string) => string

function createDefinition(
  id: string,
  renderer: TemplateRenderer,
  objective: string
): PromptDefinition {
  return {
    id,
    version: 'v1',
    objective,
    systemInstruction:
      "You craft counter-intuitive prediction quizzes for Diffread's Knowledge IDE.",
    render: (context) => {
      assertHookContext(context)
      return renderer(context.metadata, context.text)
    },
  }
}

function loadStrategyTemplates(): StrategyGroup[] {
  const mythBuster = createDefinition(
    'strategy-myth-buster',
    renderMythBusterPrompt,
    'Generate hook questions using the Myth-Buster strategy for argumentative/conceptual articles.'
  )

  const academic = createDefinition(
    'strategy-academic',
    renderAcademicPrompt,
    'Generate hook questions for academic research articles.'
  )

  const highStakes = createDefinition(
    'strategy-high-stakes',
    renderHighStakesPrompt,
    'Generate hook questions for procedural/prescriptive content.'
  )

  const impact = createDefinition(
    'strategy-impact',
    renderImpactPrompt,
    'Generate hook questions for impact-driven factual/narrative articles.'
  )

  return [
    {
      archetypes: ['Argumentative Essay', 'Conceptual Explanation', 'Case Study / Analysis'],
      definition: mythBuster,
    },
    {
      archetypes: ['Academic Research'],
      definition: academic,
    },
    {
      archetypes: ['Procedural Guide', 'Prescriptive Rules'],
      definition: highStakes,
    },
    {
      archetypes: [
        'Factual Report',
        'Narrative / Chronology',
        'Conceptual Explanation',
        'Case Study / Analysis',
      ],
      definition: impact,
    },
  ]
}

const STRATEGY_TEMPLATES = loadStrategyTemplates()

export function getHookStrategyPrompt(archetype: string): PromptDefinition {
  const group = STRATEGY_TEMPLATES.find((entry) => entry.archetypes.includes(archetype))
  return group?.definition ?? STRATEGY_TEMPLATES[STRATEGY_TEMPLATES.length - 1].definition
}
