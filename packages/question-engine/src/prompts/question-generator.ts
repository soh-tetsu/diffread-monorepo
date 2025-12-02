import type { PromptContext, PromptDefinition } from './types'

function assertNonEmpty(value: string | undefined, field: string): string {
  const cleaned = value?.trim()
  if (!cleaned) {
    throw new Error(`questionGeneratorPrompt requires non-empty ${field}.`)
  }
  return cleaned
}

function renderQuestionGeneratorPrompt(context: PromptContext): string {
  const relevantContext = assertNonEmpty(context.text, 'relevant context text')
  const taskInstruction = assertNonEmpty(context.taskInstruction, 'task instruction')
  const questionType = assertNonEmpty(context.questionType, 'question type')
  const language = assertNonEmpty(context.language ?? 'en', 'language')

  return `You are an expert Educator and Psychometrician. Your sole task is to generate **one single, high-quality Multiple Choice Question (MCQ)** based on a specific text snippet.

  **Goal:** Test the user's comprehension of the \`[TASK_INSTRUCTION]\` without being "tricky" or unfair.

  You will be given three inputs:
  1.  \`[RELEVANT_CONTEXT]\`: A specific, pre-selected snippet of text. This is your **only** source of truth.
  2.  \`[TASK_INSTRUCTION]\`: The specific pedagogical goal (e.g., "Define the key concept: 'CLT'").
  3.  \`[QUESTION_TYPE]\`: The cognitive level required ("confirmative", "explicit", or "implicit").

  Your output **must** be a single, valid JSON object. Do not output any other text. Use double quotes for every key/string, escape characters per RFC8259, and never emit a backslash-escaped apostrophe (\\').

  **Language Requirement:** All natural language fields ("question", every option's "option" and "remediation", and the "rationale") must be written in ${language}. JSON keys stay in English.

  ---

  ### 1. Rules for Question Type

  You **must** generate the question based on the \`[QUESTION_TYPE]\`:

  * **IF \`confirmative\`:**
      * **Goal:** A low-load "checkpoint" to confirm basic understanding.
      * **Format:** Often a "Which of the following is true/false?" or "Did the author...?" question.

  * **IF \`explicit\`:**
      * **Goal:** To test "Remembering" or "Understanding."
      * **Format:** The answer **must be directly stated** in the \`[RELEVANT_CONTEXT]\`.
      * **Constraint:** You **MUST PARAPHRASE** the answer. Do not copy-paste the sentence from the text. The user must recognize the *meaning*, not just the words.


  * **IF \`implicit\`:**
      * **Goal:** To test "Analysis" or "Inference."
      * **Format:** The answer **must be inferred by connecting two or more ideas** *within* the \`[RELEVANT_CONTEXT]\`.

  ### 2. Rules for Distractors (The "Plausibility" Rule)
  You must generate 3 distractors that are **diagnostic**:
  1.  **The "Near Miss":** A concept mentioned in the text but used incorrectly here.
  2.  **The "Over-Generalization":** A statement that is too broad (e.g., uses "always" or "all") compared to the text's nuance.
  3.  **The "Misinterpretation":** A conclusion a careless reader might draw.

    **CRITICAL VISUAL CONSTRAINT:**
  All 4 options (correct + distractors) must be of **roughly equal length and grammatical structure**. Do not make the correct answer significantly longer or more detailed than the wrong ones.


  ### 3. Rules for Content and JSON Fields

  * **\`type\`:** Must exactly match the \`[QUESTION_TYPE]\` input (e.g., "Explicit").
  * **\`question\`:** The text of the question. It must be clear and directly target the \`[TASK_INSTRUCTION]\`.
  * **\`answer\` (Correct Option):** There must be **one** demonstrably correct answer based *only* on the \`[RELEVANT_CONTEXT]\`.
  * **\`distractors\` (Incorrect Options):** This is critical. The 3 incorrect options **must be plausible, tempting, and diagnostic**.
      * Do **not** use "joke" answers or options that are trivially wrong.
      * Your 3 distractors **must** be a mix of the following types:
          1.  **The "Almost Right":** Plausible or partially true, but not the *best* answer.
          2.  **The Common Misconception:** Reflects a likely misunderstanding of the text.
          3.  **The Factual Mismatch:** Uses keywords *from the context* but combines them incorrectly.
          4.  **The Over/Under-Generalization:** Takes a specific point and makes it too general ("all," "always") or vice versa.
  * **\`options\`:** Must be an array of **four** objects.
  * **\`options.option\`:** The text for that choice.
  * **\`options.remediation\`:** A **brief (1-2 sentence)** explanation for *why this specific option is correct or incorrect*, based *only* on the \`[RELEVANT_CONTEXT]\`.
  * **\`answer_index\`:** The 0-based index (0, 1, 2, or 3) of the correct option.
  * **\`rationale\`:** A brief (1-2 sentence) *meta-explanation* of *why this question was generated* to fulfill the \`[TASK_INSTRUCTION]\`.

  ### 4. Internal Thought Process (Most Important Rule)

  Before you generate the JSON, you **must** follow this internal thought process:
  1.  **Analyze Task:** Read the \`[TASK_INSTRUCTION]\`.
  2.  **Formulate Rationale:** Decide *how* you will test that instruction using *only* the \`[RELEVANT_CONTEXT]\`. (This will be your \`rationale\`).
  3.  **Draft Question:** *Using that rationale*, draft the \`question\`.
  4.  **Create Options:** Generate one correct \`answer\` and three \`distractors\` using the taxonomy from section 2.
  5.  **Write Remediation:** Write the \`remediation\` for all four options.
  6.  **Assemble JSON:** Assemble all the generated pieces into the final JSON format.

  ### 5. Required Output Format (JSON)

  Your entire output **must** be a single JSON object in this format:
  \`\`\`json
  {
    "type": "Explicit",
    "question": "The text of your generated question...",
    "options": [
      {
        "option": "Text for option A",
        "remediation": "Explanation for why A is correct or incorrect."
      },
      {
        "option": "Text for option B",
        "remediation": "Explanation for why B is correct or incorrect."
      },
      {
        "option": "Text for option C",
        "remediation": "Explanation for why C is correct or incorrect."
      },
      {
        "option": "Text for option D",
        "remediation": "Explanation for why D is correct or incorrect."
      }
    ],
    "answer_index": 0,
    "rationale": "My reasoning for creating this question to meet the task instruction..."
  }
  \`\`\`

  ---

  ### Task

  Now, generate the single MCQ JSON object for the following inputs.

  **[RELEVANT_CONTEXT]**
  ${relevantContext}

  **[TASK_INSTRUCTION]**
  ${taskInstruction}

  **[QUESTION_TYPE]**
  ${questionType}

  **[TARGET_LANGUAGE]**
  ${language}

  Produce only the JSON object described above.`
}

export const questionGeneratorPrompt: PromptDefinition = {
  id: 'question-generator',
  version: 'question-generator-v1',
  objective: 'Generate a single MCQ from a snippet/task pairing for Diffread.',
  systemInstruction:
    'You create diagnostic MCQs by reading the provided snippet and fulfilling the given task instruction.',
  render: (context) => renderQuestionGeneratorPrompt(context),
}
