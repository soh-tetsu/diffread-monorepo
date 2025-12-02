import type { Metadata } from '../../workflows/curiosity-question-workflow'
import type { PromptDefinitionV2 } from '../types'

/**
 * V2-specific prompt context for hook generation
 */
export type HookGeneratorPromptContext = {
  metadata: Metadata
}

function renderHookGeneratorPrompt(context: HookGeneratorPromptContext): string {
  const language_code = context.metadata.language || 'en'
  const pedagogyJson = JSON.stringify({ pedagogy: context.metadata.pedagogy }, null, 2)

  return `You are an expert Instructional Designer and Copywriter.
  **Task:** Convert the provided "Cognitive Metadata Profile" (JSON) into a high-engagement Pre-Test Quiz.

  **Input:**
  1. A JSON object containing \`pedagogy.hooks\` which is an array contains multiple hook.
  2. **Target Language:** "${language_code}" (e.g., en for English,  ja for Japanese, zh for Chinese).


  **The Goal:**
  Generate one quiz card per hook in the input JSON.
  *   **Do NOT test for mastery.** (The user hasn't read the text yet).
  *   **DO test for intuition.** Challenge their assumptions, habits, or predictions.

  ---
  ### Quiz Generation Steps
  Iterate through **EVERY  Hooks** in \`pedagogy.hooks\`. For each hook, apply the following algorithm step by step.

  #### Step 1: Format Selection (The Waterfall)

  **Priority 1: Is it Actionable? (Format: SCENARIO)**
  *   **Trigger:** IF \`focal_point\` is **METHOD**.
  *   **Why:** Methods are "How-To" knowledge. Users must apply them in a simulation.
  *   **Structure:** A/B Decision ("What would you do?").

  **Priority 2: Is it a Binary Conflict? (Format: CONFIRMATIVE)**
  *   **Trigger:** IF \`dynamic_type\` is **DISRUPTION** or **VINDICATION**.
  *   **Why:** Strong beliefs require a sharp "True or False" challenge.
  *   **Structure:** Verify a statement.

  **Priority 3: Is it Nuanced? (Format: MCQ)**
  *   **Trigger:** All other cases (\`CAUSALITY\`, \`OUTCOME\`, \`SALIENCE\`, \`VOID\`).
  *   **Why:** These require distinguishing between specific drivers or missing links.
  *   **Structure:** 3-Option Selector.


  #### Step 2: Distractor Generation Rules (The Trap)
  You must design **Option B (The Trap)** to be the most tempting wrong answer.
  Use the \`reader_prediction\` and \`focal_point\` to craft the trap:

  *   **IF METHOD:** Trap = **"The Standard Habit."**
      *   *Logic:* The industry-standard approach that this article rejects.
  *   **IF CAUSALITY:** Trap = **"The Proximate Cause."**
      *   *Logic:* The obvious, surface-level trigger (correlation) rather than the root cause.
  *   **IF OUTCOME:** Trap = **"The Linear Projection."**
      *   *Logic:* The assumption that current trends will continue unchanged.
  *   **IF ENTITY:** Trap = **"The Incumbent."**
      *   *Logic:* The most famous or obvious name/group in the domain.


  #### Step 3: Content Generation Rules (The Script)
  Draft the content based on the Format selected in Step 1.

  **A. If Format is SCENARIO (The Simulation):**
  *   **Question:** "You are [Role] trying to [Goal]. According to this text, what should you do instead?"
  *   **Option A (Correct):** The specific action from \`text_reality\`.
  *   **Option B (Trap):** The action from \`reader_prediction\`.

  **B. If Format is CONFIRMATIVE (True/False):**
  *   **Question:** State the \`reader_prediction\` as a fact.
      *   *Example:* "True or False: [Reader Prediction] is the safest way to handle X."
  *   **Option A:** "True"
  *   **Option B:** "False"
  *   **Logic:**
      *   If DISRUPTION: The statement is the Myth. Correct Answer is **FALSE**.
      *   If VINDICATION: The statement is the Suspicion. Correct Answer is **TRUE**.

  **C. If Format is MCQ (The Selector):**
  *   **Question:** Ask a specific "Which," "What," or "Why" question focusing on the \`focal_point\`.
  *   **Option A (Correct):** Derived from \`text_reality\`.
  *   **Option B (Trap):** Derived from \`reader_prediction\`.
  *   **Option C (Noise):** A plausible alternative from \`relevant_context\`.

  ---

  #### Step 4: Remediation Rules (The Bridge)
  This is the most critical part. You must bridge the user's curiosity to the text.
  *   **Formula:** "Actually..." + [The Pivot] + "Read [Anchor Text] to learn more."
  *   **The Pivot:** Acknowledge the trap ("While [Option B] is common...") then deliver the insight ("...the author argues [Option A] is necessary because [Rationale]").
  *   **The Link:** You **MUST** use the \`anchor_text\` from the JSON input.

  ---

  ### Output Format
  Output a single JSON object that strictly adheres to this **TypeScript Interface**:

  \`\`\`typescript
  interface QuizOutput {
    quiz_cards: QuizCard[];
  }

  interface QuizCard {
    // The format selected based on the Waterfall logic in Step 1
    format: "SCENARIO" | "CONFIRMATIVE" | "MCQ";

    // The specific rhetorical strategy used (e.g., "The Simulation", "The Myth-Buster")
    strategy_used: string;

    // The main question text in ${language_code}
    question: string;

    // Exactly 2 options for CONFIRMATIVE/SCENARIO, 3 for MCQ
    options: QuizOption[];

    // The bridge back to the article
    remediation: Remediation;
  }

  interface QuizOption {
    id: string; // e.g., "opt_a", "opt_b"
    text: string; // The answer text in ${language_code}
    is_correct: boolean;
    // Immediate feedback shown after clicking this option in ${language_code}
    feedback: string;
  }

  interface Remediation {
    headline: string; // Short, punchy title in ${language_code}
    body: string; // Explanation in ${language_code}
    // MUST match the source text verbatim (no translation)
    go_read_anchor: string;
  }
  \`\`\`

  ---

  ### Execution Instructions

  1. **Part 1: The Reasoning Trace (<rationale>)**
     - Start your response with a \`<rationale>\` block.
     - Perform the "Quiz Generation Steps" step by step for **ALL** hooks in \`pedagogy.hooks\` from input.
     - Close the block with \`</rationale>\`.
       **Constraint:** Keep the Reasoning Trace **extremely concise**. Use bullet points. No paragraphs.


  2. **Part 2: The Data Payload (JSON)**
        - Follow your reasoning trace and transform **ALL** results into the JSON array.
        - **Language:** Write all user-facing strings in **${language_code}**.
        - **CRITICAL:** You MUST wrap the JSON object in a Markdown code block like this:
          \`\`\`json
          {
            "quiz_card": ...
          }
          \`\`\`

  ---

  ### INPUT JSON

  ${pedagogyJson}
`
}

export const hookGeneratorPromptV2: PromptDefinitionV2<HookGeneratorPromptContext> = {
  id: 'hook-generator-v2',
  version: 'v2.0.0',
  objective: 'Generate 3 curiosity-driven hook questions from extracted hook context',
  systemInstruction:
    "You are an expert educator. Generate hook questions that challenge assumptions and create curiosity by testing reader intuition against the article's counter-intuitive claims.",
  render: (context) => renderHookGeneratorPrompt(context),
}
