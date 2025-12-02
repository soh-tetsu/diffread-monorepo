import type { ArticleMetadata, ReadingPlanPart, TaskTemplate } from '../types'
import type { PromptContext, PromptDefinition } from './types'

function assertArticleText(text?: string): string {
  const cleaned = text?.trim()
  if (!cleaned) {
    throw new Error('articleExpanderPrompt requires non-empty article text.')
  }
  return cleaned
}

function assertMetadata(metadata?: ArticleMetadata): ArticleMetadata {
  if (!metadata) {
    throw new Error('articleExpanderPrompt requires metadata input.')
  }
  return metadata
}

function assertTaskPool(taskPool?: TaskTemplate[] | null): TaskTemplate[] {
  if (!taskPool || taskPool.length === 0) {
    throw new Error('articleExpanderPrompt requires a non-empty task pool.')
  }
  return taskPool
}

function assertReadingPlan(plan?: ReadingPlanPart[]): ReadingPlanPart[] {
  if (!plan || plan.length === 0) {
    throw new Error('articleExpanderPrompt requires a non-empty reading plan.')
  }
  return plan
}

function renderPlanExpanderPrompt(context: PromptContext): string {
  const articleText = assertArticleText(context.text)
  const metadata = assertMetadata(context.metadata)
  const taskPool = assertTaskPool(context.taskPool)
  const readingPlan = assertReadingPlan(context.readingPlan)

  const metadataJson = JSON.stringify(metadata, null, 2)
  const planJson = JSON.stringify(readingPlan, null, 2)
  const legacyTaskPool = taskPool.map((task) => ({
    id: task.id,
    description: task.description,
    question_type: task.questionType,
  }))
  const taskPoolJson = JSON.stringify(legacyTaskPool, null, 2)

  return `
  You are an expert Text Analyst and Curriculum Designer.
  Your goal is to "Expand" a high-level reading plan into a granular list of concrete instruction objects by mapping tasks to specific evidence in the text.

  INPUT DATA:
  1. [FULL_TEXT]: The content to analyze.
  2. [PLAN]: A list of abstract Task IDs (e.g., ["Task_Define", "Task_Critique"]).
  3. [TASK_POOL]: The definitions of those tasks.
  4. [METADATA]: Context (Key concepts, author, etc.).

  ---

  ### 1. THE EXPANSION ALGORITHM (Execution Logic)

  You must iterate through every \`task_id\` in the \`[PLAN]\` and execute this loop:

  **STEP A: Template Lookup**
     - Retrieve the specific definition from \`[TASK_POOL]\`.
     - Note the \`question_type\` (explicit vs. implicit).

  **STEP B: Instance Discovery (The 1:N Expansion)**
     - **IF** the task targets \`{key_concepts}\`:
       - Iterate through the \`key_concepts\` list in \`[METADATA]\`.
       - Find the best definition/explanation for *each* concept in the text.
       - Create 1 Instruction Object per concept.
     - **IF** the task is generic (e.g., "Find an example", "Identify the thesis"):
       - Scan the text for *distinct* instances.
       - Create 1 Instruction Object per distinct instance found (limit to Top 3 best instances).

  **STEP C: Context Extraction (Critical)**
     - For every Instruction Object, extract the \`relevant_context\`.
     - **Rule:** The context must be a **self-contained snippet (100-300 words)**.
     - **Requirement:** It MUST contain the "Answer" AND the surrounding sentences (to allow generation of wrong answer distractors later).

  ---

  ### 2. OUTPUT SCHEMA

  Return a **single JSON object**.

  **Top-Level Keys:**
  1.  \`rationale\`: (String) Your internal monologue explaining how you mapped the plan to the text (e.g., "I found 3 concepts for Task_Define...").
  2.  \`expanded_plan\`: (Array) The structure defined below.
  3.  \`coverage_report\`: (Object) Statistics on text usage.

  **JSON Structure:**
  {
    "rationale": "String",
    "expanded_plan": [
      {
        "objective_id": "String (Parent Task ID)",
        "objective_description": "String (Readable description from POOL)",
        "instructions": [
          {
            "instruction_id": "String (Unique kebab-case ID, e.g., 'def-entropy')",
            "task_instruction": "String (Specific command, e.g., 'Define the concept: Entropy')",
            "question_type": "String (Copied from POOL)",
            "relevant_context": "String (VERBATIM quote from text, 2-3 paragraphs)",
            "source_location": {
              "anchor_text": "String (Unique 5-8 word sentence fragment from start of context)",
              "estimated_paragraph": Integer (Approximate number)"
            }
          }
        ]
      }
    ],
    "coverage_report": {
      "total_paragraphs": Integer (Estimated total in text),
      "covered_paragraphs": [Integer, Integer],
      "coverage_percent": Float (0.0 to 1.0)
    }
  }

  ---

  ### 3. DATA INJECTION

  **[FULL_TEXT]**
  ${articleText}

  **[PLAN]**
  ${planJson}

  **[TASK_POOL]**
  ${taskPoolJson}

  **[METADATA]**
  ${metadataJson}
  `
}

export const planExpanderPrompt: PromptDefinition = {
  id: 'plan-expander',
  version: 'plan-expander-v2',
  objective: 'Expand high-level reading plan tasks into concrete instructions with coverage stats.',
  systemInstruction:
    'You expand Diffread reading plans by mapping each task to concrete instructions tied to the article text.',
  render: (context) => renderPlanExpanderPrompt(context),
}
