import type { PromptDefinitionV2 } from '../../types'
import type { Metadata } from './schemas'

/**
 * V2-specific prompt context for curiosity generation
 */
export type CuriosityGeneratorPromptContext = {
  metadata: Metadata
}

function rendercuriosityGeneratorPrompt(context: CuriosityGeneratorPromptContext): string {
  const language_code: string = context.metadata.language || 'en'
  const pedagogyJson: string = JSON.stringify({ pedagogy: context.metadata.pedagogy }, null, 2)

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

  #### Step 4: RULES for \`remediation\` (The Bridge)
  *   This appears AFTER the feedback to bridge the gap between the user's guess and the article's thesis.
  * **Tone:** Friendly, clear, and authoritative.
  * The structure is as follows:
    * **body** (The Synthesis):
      * This is the "Coach" speaking. Explain the *concept* clearly, in 1-2 sentences.
      * **Do NOT** say "The text says..." or "The author mentions..."
      * **DO** synthesize the insight. Explain the concept directly or *why* the correct answer is the truth, citing the article's logic.
      * Example: "Discipline fails because the friction is structural. You can't willpower your way through bad architecture."
    * **key_quote** (The Evidence):
      - Extract the most powerful sentence fragment that supports the body.
      - It MUST be verbatim from the source text.
      - Keep it short (under 20 words).
    * **go_read_anchor** (The Map):
        - Use the \`anchor_text\` from \`source_location\` as the pointer back to the article.

 #### Step 5: RULES FOR \`feedback\` (The Referee):
  * This appears IMMEDIATELY when the user clicks an option.
  * **Constraint:** Maximum 15 words.
  * **Tone:** Sharp, direct, and specific to the *option selected*.
  * **If Correct:** Validate the user's intuition (e.g., "Spot on. You grasped the core conflict.").
  * **If Incorrect:** debunk the specific misconception represented by *that* wrong answer (e.g., "That's the common myth, but the data says otherwise.").
  * **Do NOT** explain the full concept here. Just react to the click.

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
    key_quote: string; // Verbatim quote from source text
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

export const curiosityGeneratorPromptV2: PromptDefinitionV2<CuriosityGeneratorPromptContext> = {
  id: 'hook-generator-v2',
  version: 'v2.0.1',
  objective: 'Generate 3 curiosity-driven hook questions from extracted hook context',
  systemInstruction:
    "You are an expert educator. Generate hook questions that challenge assumptions and create curiosity by testing reader intuition against the article's counter-intuitive claims.",
  render: (context) => rendercuriosityGeneratorPrompt(context),
}
