import {
  type ArticleMetadata,
  type HookWorkflowResult,
  type InstructionWorkflowResult,
  runHookWorkflow,
  runInstructionWorkflow,
} from '@diffread/question-engine'
import { GEMINI_HOOK_MODEL, GEMINI_INSTRUCTION_MODEL, requireGeminiApiKey } from '@/lib/quiz/gemini'
import type { ArticleRow } from '@/types/db'

function extractTitle(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }
  const maybeTitle = (metadata as Record<string, unknown>).title
  return typeof maybeTitle === 'string' ? maybeTitle : null
}

function buildArticlePayload(article: ArticleRow, articleText: string) {
  return {
    normalizedUrl: article.normalized_url,
    title: extractTitle(article.metadata),
    text: articleText,
    metadata: article.metadata,
  }
}

export async function generateInstructionWorkflow(
  article: ArticleRow,
  articleText: string,
  metadata: ArticleMetadata
): Promise<{ workflow: InstructionWorkflowResult; model: string }> {
  const apiKey = requireGeminiApiKey()
  const workflow = await runInstructionWorkflow(
    buildArticlePayload(article, articleText),
    metadata,
    {
      apiKey,
      model: GEMINI_INSTRUCTION_MODEL,
    }
  )

  return {
    workflow,
    model: GEMINI_INSTRUCTION_MODEL,
  }
}

export async function generateHookWorkflow(
  article: ArticleRow,
  articleText: string,
  metadata: ArticleMetadata
): Promise<{ workflow: HookWorkflowResult; model: string }> {
  const apiKey = requireGeminiApiKey()
  const hookModel = GEMINI_HOOK_MODEL
  const workflow = await runHookWorkflow(buildArticlePayload(article, articleText), metadata, {
    apiKey,
    model: hookModel,
  })

  return {
    workflow,
    model: hookModel,
  }
}
