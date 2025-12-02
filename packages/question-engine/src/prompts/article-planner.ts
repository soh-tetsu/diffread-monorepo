import type { ArticleMetadata } from '../types'
import type { PromptContext, PromptDefinition } from './types'

function assertMetadata(metadata?: ArticleMetadata): ArticleMetadata {
  if (!metadata) {
    throw new Error('articlePlannerPrompt requires metadata input.')
  }
  return metadata
}

function assertTaskPool(taskPool?: PromptContext['taskPool']): PromptContext['taskPool'] {
  if (!taskPool || taskPool.length === 0) {
    throw new Error('articlePlannerPrompt requires a non-empty task pool.')
  }
  return taskPool
}

function renderArticlePlannerPrompt(context: PromptContext): string {
  const metadata = assertMetadata(context.metadata)
  const taskPool = assertTaskPool(context.taskPool)

  const metadataJson = JSON.stringify(metadata, null, 2)
  const taskPoolJson = JSON.stringify(taskPool, null, 2)

  return `You are an expert Reading Plan Strategist and Cognitive Scientist.
Your goal is to generate a structured, pedagogical JSON reading plan based strictly on the provided metadata and a fixed pool of tasks.

INPUT DATA:
1. [METADATA]: Details about the specific text.
2. [TASK_POOL]: A menu of available tasks (you may only use these).

---

### ALGORITHM (Execution Logic)

Follow these steps in order to determine the plan structure:

STEP 1: ANALYZE COMPLEXITY (The Entry Ramp)
- Check \`complexity.lexical\` and \`complexity.overall\`.
- IF "Specialized" OR "Academic":
  - You MUST include a "Grounding Task" (e.g., Define terms, Concept Map) as the very first task.
- ELSE (Simple/Casual):
  - You MUST SKIP grounding tasks. Start directly with argument analysis.

STEP 2: ANALYZE TIME (The Pacing)
- Check \`estimated_reading_minutes\`.
- CASE < 4 mins ("The Sprint"):
  - Structure: Single Part (Title: "Quick Scan").
  - Volume: Select exactly 2 tasks total (1 Thesis-focused + 1 Implication-focused).
- CASE 4-8 mins ("The Standard"):
  - Structure: Two Parts (e.g., "Comprehension" -> "Application").
- CASE > 8 mins ("The Marathon"):
  - Structure: Three Parts (e.g., "Scouting", "Deep Dive", "Synthesis").

STEP 3: ADAPT TASKS (Contextualization)
- Select tasks from [TASK_POOL] that fit the structure defined in Step 2.
- You MUST perform string replacement on the chosen task descriptions:
  - Replace \`{core_thesis}\` with the specific string from [METADATA].
  - Replace \`{key_concepts}\` with the **Top 3** most complex concepts from [METADATA].
- You MUST preserve the exact \`task_id\` and \`question_type\` from the pool.

---

### OUTPUT SCHEMA

Return **ONLY** a valid, raw JSON object. Do not use Markdown code fences (\`\`\`json). Do not include conversational filler.

The JSON must match this structure:
{
  "rationale": "String. Explain your logic regarding Complexity and Time rules here (2-3 sentences).",
  "reading_plan": [
    {
      "part": Number,
      "title": "String (e.g., 'Phase 1: Grounding')",
      "tasks": [
        {
          "task_id": "String (Must exist in TASK_POOL)",
          "task_instruction": "String (The adapted description with placeholders filled)",
          "question_type": "String"
        }
      ]
    }
  ]
}

---

### DATA INJECTION

[METADATA]:
${metadataJson}

[TASK_POOL]:
${taskPoolJson}
`
}

export const articlePlannerPrompt: PromptDefinition = {
  id: 'article-planner',
  version: 'article-planner-v1',
  objective: 'Create a phased reading plan tailored to article metadata and task pool.',
  systemInstruction:
    'You select and adapt tasks from a predefined pool to generate a JSON reading plan for Diffread readers.',
  render: (context) => renderArticlePlannerPrompt(context),
}
