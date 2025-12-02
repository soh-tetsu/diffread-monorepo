import type { PromptDefinitionV2 } from '../types'

type AnalysisPromptContext = {
  text: string
}

function renderAnalysisPrompt({ text }: AnalysisPromptContext): string {
  const cleaned = text?.trim()
  if (!cleaned) {
    throw new Error('analysisPromptV2 requires non-empty article text.')
  }

  return `You are an expert Cognitive Scientist and AI Content Strategist.

  **Objective:** Analyze the provided text to generate a "Cognitive Metadata Profile" optimized for educational quiz generation.

  **Input Context:**
  - The input text is provided in the variable \${cleaned}.
  - Ignore navigation, footers, ads, and UI noise. Focus on the main editorial content.

  ---
  ### 1. Analysis Standards (Strict Logic)

  **A. Article Archetype (Dominant Intent)**
  *   **CONCEPTUAL:** Explains/defines an abstract idea, theory, or framework.
  *   **ARGUMENTATIVE:** Persuades, critiques, or pushes an opinion/interpretation.
  *   **EMPIRICAL:** Reports objective facts, data, studies, or news (evidence-focused).
  *   **PROCEDURAL:** Teaches how to do something (steps, rules, tutorials).
  *   **NARRATIVE:** Tells a story, history, biography, or sequence of events.

  **B. Logical Schema (Reasoning Structure)**
  *   **SEQUENTIAL_PROCESS:** Step-by-step (A → B → C).
  *   **DIAGNOSTIC_FLOW:** Symptom → Cause → Solution.
  *   **PROBLEM_SOLUTION:** Broad problem + proposed fix.
  *   **COMPARATIVE_ANALYSIS:** A vs B evaluation.
  *   **THESIS_PROOF:** Claim first, then evidence.
  *   **HYPOTHESIS_EVIDENCE:** Scientific method flow.
  *   **INVERTED_PYRAMID:** Most important info first (journalism).
  *   **CHRONOLOGICAL:** Time-ordered events.
  *   **TOPICAL_GROUPING:** Loose list of topics/features.
  *   **INTERVIEW_Q_A:** Dialogue or Q&A format.

  **C. Structural Extraction Rules (The Skeleton)**
  Follow this priority list to generate the outline:
  1.  **Explicit Headers:** If the text has clear H1/H2/H3 headers, extract them verbatim.
  2.  **Steps:** If the text is a list/tutorial, extract the step titles.
  3.  **Virtual Labels:** If the text is dense prose without headers, create 3–5 word "virtual section labels" for each major paragraph block.
  *   *Constraint:* Max 10 items. Maintain the original flow.

  **D. Domain Classification (IPTC Media Topics)**
  You must classify the domain using the **IPTC Media Topics taxonomy**.
  *   **Primary:** Top-level category (e.g., "science and technology").
  *   **Secondary:** Mid-level category (e.g., "artificial intelligence").
  *   **Specific Topic:** A 2-5 word string for the specific subject.

  **E. Core Thesis (The Ground Truth)**
  Extract the single central argument or purpose of the text (1-2 sentences).
  *   **Constraint:** This must be the absolute summary. If a fact is not necessary to support this statement, it is considered "Trivia."

  **F. Pedagogical Extraction Algorithm (The Hooks)**
  You must identify ALL "Curiosity Hooks" by applying the following 6-step algorithm:

  1.  **Identify High-Stakes Subjects (\`focal_point\`):**
      *   **CAUSALITY**: The deep "Why", Root Cause, or Motivation.
      *   **OUTCOME**: The critical Result, Consequence, or Impact.
      *   **METHOD**: The specific Mechanism, Tool, or "How" it works.
      *   **ENTITY**: The Key Driver (Person, Group, or Variable that matters most).

  2. **The Thesis-Bridge Test:**
      *   Ask: "If I deleted this specific fact, would the \`Core Thesis\` still be accurate?"
      *   If YES -> It is Trivia. ** Discard it.**
      *   If NO -> It is Load-Bearing. **Keep it.**

  3. **Identify the Emotion Delta (\`dynamic_type\`)**
      How does the text interact with the reader's likely expectation regarding that Focal Point?
      * **DISRUPTION (Surprise)**: Reader expects X, Text proves Y. (Emotion: "I was wrong").
      * **VINDICATION (Validation)**: Reader suspects X (e.g., incompetence, hidden complexity), Text confirms it. (Emotion: "I knew it").
      * **SALIENCE (Focus)**: Reader expects general rule, Text highlights a specific exception/priority. (Emotion: "This matters most").
      * **VOID (Mystery)**: Reader expects answer, Text explicitly leaves it ambiguous/unanswered. (Emotion: "What are they hiding?").

  4. **Evaluate consensus level**
      *   *0.9 - 1.0 (Universal)*: Standard wisdom (e.g., "The earth is round", "Recursion is good").
      *   *0.7 - 0.8 (Industry Standard)*: Professional consensus.
      *   *0.4 - 0.6 (Vague)*: No strong consensus.
      *   *0.0 - 0.3 (None)*: No prior opinion.

  5.  **Score:** Calculate the **Cognitive Impact Score (-1 to 8)** for each surviving candidate using this formula:

      **Score = (Consensus) + (Emotion) + (Topic)**

      *   **A. Consensus Level (How strong is the belief?)**
          *   Universal Belief (0.9+) -> **+3 Points**
          *   Industry Standard (0.7+) -> **+2 Points**
          *   Vague/Mixed (0.4+) -> **+1 Point**
          *   None (<0.4) -> **0 Points**

      *   **B. Emotion Factor (How strong is the trigger?)**
          *   \`DISRUPTION\` -> **+3 Points**
          *   \`VINDICATION\` or \`VOID\` -> **+2 Points**
          *   \`SALIENCE\` -> **+1 Point**

      *   **C. Topic Factor (How deep is the logic?)**
          *   \`CAUSALITY\` or \`OUTCOME\` -> **+2 Points** (Deep Logic)
          *   \`METHOD\` -> **+1 Point** (Practical Application)
          *   \`ENTITY\` -> **-2 Points** (Surface Detail/Trivia)

  6. **Order and Select:** Rank and select up to 3 unique Curiosity Hooks based on their Cognitive Impact Score (highest first). You may select fewer than 3—but at least one—if the information density is insufficient to support more without dilution or repetition.

  **G. Capture The Semantic Block (Context Rule)**
     Extract \`relevant_context\` for selected hooks by \`Pedagogical Extraction Algorithm\`.
      When extracting \`relevant_context\`, do not just copy the fact. You MUST capture the full logical arc (approx. 3-5 sentences).
      *   **The Setup:** The sentence introducing the context or common assumption.
      *   **The Pivot:** The transition (e.g., "However," "But," "In reality").
      *   **The Reveal:** The sentence containing the core insight.
      *   *Reason:* This context allows external systems to generate questions without seeing the full text.

  ---
  ### 2. Output Structure (TypeScript Interface)

  You must output a single JSON object that matches this interface exactly:

  interface CognitiveProfile {
    metadata: {
      archetype: {
        label: "CONCEPTUAL" | "ARGUMENTATIVE" | "EMPIRICAL" | "PROCEDURAL" | "NARRATIVE";
      };
      logical_schema: {
        label: "SEQUENTIAL_PROCESS" | "DIAGNOSTIC_FLOW" | "PROBLEM_SOLUTION" | "COMPARATIVE_ANALYSIS" | "THESIS_PROOF" | "HYPOTHESIS_EVIDENCE" | "INVERTED_PYRAMID" | "CHRONOLOGICAL" | "TOPICAL_GROUPING" | "INTERVIEW_Q_A";
      };
      structural_skeleton: {
        outline: string[]; // Follow Rule C (Extraction Rules)
      };
      domain: {
        primary: string;       // IPTC Level 1
        secondary: string;     // IPTC Level 2
        specific_topic: string;
      };
      core_thesis: {
        content: string; // within 30 words
      };
      pedagogy: {
        hooks: Array<{
          focal_point: "CAUSALITY" | "OUTCOME" | "METHOD" | "ENTITY"; // See Rule F.1
          dynamic_type: "DISRUPTION" | "VINDICATION" | "SALIENCE" | "VOID"; // See Rule F.3
          reader_prediction: string; // The assumption being challenged/confirmed
          text_reality: string;      // The insight from the text
          relevant_context: string;  // The full Semantic Block (See Rule G)
          source_location: {
            section_index: number;
            anchor_text: string;
          };
          cognitive_impact_score: number; // See Rule F.5
        }>;
      };
      language: "en";
    }
  }

  ---

  ### 3. Execution Instructions (Two-Part Output)

  1. **Part 1: The Reasoning Trace (<rationale>)**
     - Start your response with a \`<rationale>\` block.
     - **Thesis Definition:** Write the Core Thesis.
     - Perform the "Pedagogical Extraction Algorithm" defined in Section F step by step.
     - Close the block with \`</rationale>\`.
     **Constraint:** Keep the Reasoning Trace **extremely concise**. Use bullet points. No paragraphs.

     **Format Template:**
     <rationale>
     *   Thesis: [1 sentence summary]
     *   Candidates:
          1. [Topic A] -> [DROP: Trivia]
          2. [Topic B] -> [KEEP] -> Score: 7/8 (Univ+Disr+Meth) -> **Rank #1**
          3. [Topic C] -> [KEEP] -> Score: 4/8 (Vague+Sal+Ent) -> **Rank #2**
     </rationale>


  2. **Part 2: The Data Payload (JSON)**
      - Follow your reasoning trace and tranform the results to a JSON object Immediately after the thinking block.
      - **CRITICAL:** You MUST wrap the JSON object in a Markdown code block like this:
        \`\`\`json
        {
          "metadata": ...
        }
        \`\`\`


  **Input Text:**

  ${cleaned}
`
}

export const analysisPromptV2: PromptDefinitionV2<AnalysisPromptContext> = {
  id: 'analysis-v2',
  version: 'v2.0.0',
  objective: 'Extract article metadata and hook context for curiosity question generation',
  systemInstruction:
    'You are an expert content analyst. Extract structured metadata AND specific content elements (claims, facts, counter-intuitive points) for generating curiosity-driven hook questions.',
  render: (context) => renderAnalysisPrompt(context),
}
