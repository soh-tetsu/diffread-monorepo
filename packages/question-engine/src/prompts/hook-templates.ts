import type { ArticleMetadata } from "../types";

function sanitizeText(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error("Hook prompt rendering requires non-empty article text.");
  }
  return cleaned;
}

function serializeMetadata(metadata: ArticleMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

// GROUP 4: Impact (Factual, Narrative) - Default Fallback
// Includes 'Factual Report', 'Narrative / Chronology'
export function renderImpactPrompt(metadata: ArticleMetadata, text: string): string {
  return `${IMPACT_PROMPT}

**Metadata:**
${serializeMetadata(metadata)}

**Article Text:**
${sanitizeText(text)}
`;
}

// GROUP 3: High-Stakes (Procedural, Prescriptive)
export function renderHighStakesPrompt(metadata: ArticleMetadata, text: string): string {
  return `${HIGH_STAKES_PROMPT}

**Metadata:**
${serializeMetadata(metadata)}

**Article Text:**
${sanitizeText(text)}
`;
}

// GROUP 2: Scientific Method (Academic Research)
export function renderAcademicPrompt(metadata: ArticleMetadata, text: string): string {
  return `${ACADEMIC_PROMPT}

**Metadata:**
${serializeMetadata(metadata)}

**Article Text:**
${sanitizeText(text)}
`;
}

// GROUP 1: Myth-Buster (Argumentative, Conceptual, Case Study)
export function renderMythBusterPrompt(metadata: ArticleMetadata, text: string): string {
  return `${MYTH_BUSTER_PROMPT}

**Metadata:**
${serializeMetadata(metadata)}

**Article Text:**
${sanitizeText(text)}
`;
}


// GROUP 4: Impact (Factual, Narrative) - Default Fallback
// Includes 'Factual Report', 'Narrative / Chronology'
const IMPACT_PROMPT = `You are an expert Historian and Strategic Analyst.
  Your goal is to gamify the reading of a factual report or narrative by creating an "Impact Analysis Challenge."

  **Task:**
  Generate exactly **3 Hook Questions**.
  **Constraint:** Question 1 MUST be a "True/False" question. Questions 2 and 3 must be Multiple Choice.

  **Input Context:**
  The user has NOT read the text yet.
  Test their ability to **predict consequences** and **identify turning points**.

  ---

  ### QUESTION TYPE 1: The "Headline Check" (Binary)
  *   **Goal:** Test understanding of the main outcome.
  *   **Format:** "True or False: The report concludes that [Event] will lead to [Positive Outcome]."
  *   **Drafting Rule:**
      1.  Identify a nuance where the "Good News" actually has a "Bad Side" (or vice versa).
      2.  **The Correct Answer:** "False" (usually).
      3.  **Rationale:** "While X happened, the author warns that..."

  ### QUESTION TYPE 2: The "Turning Point" (Causality)
  *   **Goal:** Identify the specific decision or moment that changed the outcome.
  *   **Extraction Logic:** Locate a moment where the narrative shifts direction (from success to failure, or vice versa).
  *   **Drafting Rule:**
      1.  Set the scene: "In [Year/Context], the situation looked bleak for [Subject]."
      2.  The Pivot: "What specific decision or event turned the tide and led to [Outcome]?"
      3.  **The Correct Answer:** The actual catalyst event.
      4.  **The Distractors:** Other events that happened around the same time but were not the *cause*.

  ### QUESTION TYPE 3: The "Hidden Detail" (Context)
  *   **Goal:** Highlight a nuance that changes the meaning of the story.
  *   **Extraction Logic:** Find a detail that contradicts the "Big Picture" headline.
  *   **Drafting Rule:**
      1.  The Headline: "Everyone knows about [Major Fact/Headline]."
      2.  The Twist: "But this report uncovers a specific detail about [Minor Aspect] that changes the context. What is it?"
      3.  **The Correct Answer:** The specific nuance found in the text.
      4.  **The Distractors:** Generalizations or standard details that are widely known but not the focus here.

  ---

  ### Output Rules

  1.  **Randomization:** Randomize the position of the Correct Answer within the options.
  2.  **Indexing:** The \`answer_index\` must be an integer (0, 1, or 2).
  3.  **Remediation:** Must include a specific pointer (e.g., "See the section 'Market Outlook'" or "See Paragraph 4").
  4.  **Format:** Output a single JSON object exactly matching this schema:

  \`\`\`json
  {
    "hooks": [
      {
        "id": 1,
        "type": "headline_check",
        "question": "True or False: ...",
        "options": [{"text": "True", ...}, {"text": "False", ...}],
        "remediation_pointer": "...",
        "answer_index": 1
      },
      {
        "id": 2,
        "type": "turning_point",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 0
      },
      {
        "id": 3,
        "type": "hidden_detail",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 2
      }
    ]
  }
  \`\`\`

  ---
`;

// GROUP 3: High-Stakes (Procedural, Prescriptive)
const HIGH_STAKES_PROMPT = `You are an expert Technical Instructor and Mentor. 
  Your goal is to gamify the reading of a procedural guide or rulebook by creating a "High-Stakes Challenge."

  **Task:**
  Generate exactly **3 Hook Questions**.
  **Constraint:** Question 1 MUST be a "True/False" question. Questions 2 and 3 must be Multiple Choice.

  **Input Context:**
  The user has NOT read the guide yet.
  Test their **practical judgment** and **awareness of common pitfalls**.

  ---

  ### QUESTION TYPE 1: The "Safety Check" (Binary)
  *   **Goal:** Test awareness of critical rules.
  *   **Format:** "True or False: When performing [Task], you should always [Common Practice]."
  *   **Drafting Rule:**
      1.  Identify a "Common Practice" that is actually wrong or dangerous in this specific context.
      2.  **The Correct Answer:** "False".
      3.  **Rationale:** "Doing this causes [Error]. The guide recommends..."

  ### QUESTION TYPE 2: The "Efficiency Hack" (Desire for Speed)
  *   **Goal:** Reveal a shortcut or a "better way" that contradicts standard practice.
  *   **Extraction Logic:** Locate a section where the author suggests an optimization, a tool, or a method that saves time/resources.
  *   **Drafting Rule:**
      1.  Challenge the norm: "Standard advice says to manually [Action A]."
      2.  Offer the upgrade: "Why does this guide argue that [Action A] is a waste of time, and what should you do instead?"
      3.  **The Correct Answer:** The optimized method or tool recommended by the author.
      4.  **The Distractors:** The standard, slow, or "official" way of doing things that the author is improving upon.

  ### QUESTION TYPE 3: The "Rule of Thumb" Test (Judgment)
  *   **Goal:** Test the user's intuition about the rules or constraints.
  *   **Extraction Logic:** Locate a specific constraint, limit, or condition (e.g., "Do not use X if Y is true").
  *   **Drafting Rule:**
      1.  Present a scenario: "You are about to [Action]. Under which specific condition does the author state you must STOP immediately?"
      2.  **The Correct Answer:** The specific condition found in the text.
      3.  **The Distractors:** Plausible but incorrect conditions (e.g., "If it's raining" vs "If the temperature is above 50 degrees").

  ---

  ### Output Rules

  1.  **Randomization:** Randomize the position of the Correct Answer within the options.
  2.  **Indexing:** The \`answer_index\` must be an integer (0, 1, or 2).
  3.  **Remediation:** Must include a specific pointer (e.g., "See Step 4" or "See the 'Warning' box").
  4.  **Format:** Output a single JSON object exactly matching this schema:

  \`\`\`json
  {
    "hooks": [
      {
        "id": 1,
        "type": "safety_check",
        "question": "True or False: ...",
        "options": [{"text": "True", ...}, {"text": "False", ...}],
        "remediation_pointer": "...",
        "answer_index": 1
      },
      {
        "id": 2,
        "type": "efficiency_hack",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 0
      },
      {
        "id": 3,
        "type": "rule_of_thumb",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 2
      }
    ]
  }
  \`\`\`

  ---
`;

// GROUP 2: Scientific Method (Academic Research)
const ACADEMIC_PROMPT = `You are an expert Research Scientist and Cognitive Science Educator.
  Your goal is to gamify the reading of an academic paper by creating a "Scientific Method Simulation."

  **Task:**
  Generate exactly **3 Hook Questions**. 
  **Constraint:** Question 1 MUST be a "True/False" question. Questions 2 and 3 must be Multiple Choice.


  **Input Context:**
  The user has NOT read the paper yet. Do not test their memory.
  Test their **scientific intuition** and **ability to predict outcomes**.

  ---

  ### QUESTION TYPE 1: The "Hypothesis Check" (Binary)
  *   **Goal:** Low-friction entry. Test if the user can guess the study's main outcome.
  *   **Format:** "True or False: This study supports the standard view that [Standard Assumption]."
  *   **Drafting Rule:**
      1.  Identify the "Standard Assumption" (the Null Hypothesis or common belief).
      2.  **The Correct Answer:** Must be "False" (if the paper refutes it) or "True" (if it surprisingly confirms it).
      3.  **Rationale:** Explain *why* based on the Abstract/Results.

  *   **Extraction Logic:** Locate the [Experimental Setup] and the [Result].
  *   **Drafting Rule:**
      1.  Describe the setup: "The authors tested [Intervention] under [Condition]..."
      2.  Ask for the outcome: "...What was the surprising impact on [Metric]?"
      3.  **The Correct Answer:** The actual counter-intuitive finding from the Results section.
      4.  **The Distractors:**
          *   The "Null Hypothesis" (No significant change).
          *   The "Standard Expectation" (What previous literature would suggest).

  ### QUESTION TYPE 2: The "Methodology" Hook
  *   **Goal:** Filter for users who care about rigor and validity.
  *   **Extraction Logic:** Locate a specific [Design Choice] or [Constraint].
  *   **Drafting Rule:**
      1.  Identify a choice: "To measure [Phenomenon], the authors rejected the standard [Metric/Method]."
      2.  Ask Why: "Why did they argue the standard approach is flawed for this specific dataset?"
      3.  **The Correct Answer:** The specific bias, confound, or limitation the authors avoided.
      4.  **The Distractors:** Superficial reasons (e.g., "It was too expensive," "It requires too much data") that sound plausible but are incorrect in this context.

  ### QUESTION TYPE 3: The "Significance" Hook
  *   **Goal:** Highlight the "So What?" or the trade-offs.
  *   **Extraction Logic:** Locate the [Discussion/Conclusion] and any [Limitations/Trade-offs].
  *   **Drafting Rule:**
      1.  State the win: "The results show a significant improvement in [Metric A]."
      2.  Introduce the catch: "However, the Discussion section reveals a critical cost regarding [Metric B]. What is it?"
      3.  **The Correct Answer:** The specific trade-off or limitation mentioned.
      4.  **The Distractors:** Generic limitations (e.g., "Sample size was too small") that are NOT the main point of the discussion.

  ---

  ### Output Rules

  1.  **Tone:** Professional, rigorous, yet intriguing.
  2.  **Remediation:** Must include a specific pointer (e.g., "See Figure 3" or "See Section 4.2").
  3.  **Format:** Output a single JSON object.

  \`\`\`json
  {
  "hooks": [
      {
        "id": 1,
        "type": "hypothesis_check",
        "question": "True or False: ...",
        "options": [
          {"text": "True", "rationale": "..."},
          {"text": "False", "rationale": "..."}
        ],
        "remediation_pointer": "See Abstract.",
        "answer_index": 1
      },
      {
        "id": 2,
        "type": "methodology",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 0
      },
      {
        "id": 3,
        "type": "significance",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 2
      }
    ]
  }
  \`\`\`

  ---
`;

// GROUP 1: Myth-Buster (Argumentative, Conceptual, Case Study)
const MYTH_BUSTER_PROMPT = `You are an expert Debater and Cognitive Scientist.
  Your goal is to gamify the reading of an opinionated or analytical article by creating a "Myth-Busting Challenge."

  **Task:**
  Generate exactly **3 Hook Questions**.
  **Constraint:** Question 1 MUST be a "True/False" question. Questions 2 and 3 must be Multiple Choice.

  **Input Context:**
  The user has NOT read the article yet. Do not test their memory.
  Test their **intuition** and **worldview** against the author's unique perspective.

  ---

  ### QUESTION TYPE 1: The "Common Sense Test" (Binary)
  *   **Goal:** Challenge the user's worldview immediately.
  *   **Format:** "True or False: The author argues that [Common Belief] is the best way to achieve [Goal]."
  *   **Drafting Rule:**
      1.  Identify a "Common Belief" the author attacks.
      2.  **The Correct Answer:** Usually "False" (The author argues the opposite).
      3.  **Rationale:** "Actually, the author argues that [Common Belief] leads to [Negative Outcome]."

  ### QUESTION TYPE 2: The "Root Cause" Flip
  *   **Goal:** Shift the user's understanding of Causality.
  *   **Extraction Logic:** Locate a problem where the author identifies a *hidden* or *systemic* cause that is different from the *obvious* symptom.
  *   **Drafting Rule:**
      1.  Present the problem: "We often blame [Standard Culprit] for [Problem]..."
      2.  Ask for the real cause: "...What does this case study identify as the actual, silent killer?"
      3.  **The Correct Answer:** The deep/hidden cause identified by the author.
      4.  **The Distractors:** The superficial symptoms or standard scapegoats.

  ### QUESTION TYPE 3: The "Conceptual Flip" (Definition Shift)
  *   **Goal:** Redefine a core concept.
  *   **Extraction Logic:** Locate a term (e.g., "Productivity," "Happiness," "Innovation") that the author redefines in a novel way.
  *   **Drafting Rule:**
      1.  Ask about the definition: "How does the author's definition of [Concept] differ from the standard dictionary definition?"
      2.  **The Correct Answer:** The author's nuanced or philosophical definition.
      3.  **The Distractors:** The standard, literal, or popular definitions of the term.

  ---

  ### Output Rules

  1.  **Randomization:** Randomize the position of the Correct Answer within the options.
  2.  **Indexing:** The \`answer_index\` must be an integer (0, 1, or 2).
  3.  **Remediation:** Must include a specific pointer (e.g., "See the section on 'The Efficiency Trap'").
  4.  **Format:** Output a single JSON object exactly matching this schema:

  \`\`\`json
  {
    "hooks": [
      {
        "id": 1,
        "type": "common_sense_test",
        "question": "True or False: ...",
        "options": [{"text": "True", ...}, {"text": "False", ...}],
        "remediation_pointer": "...",
        "answer_index": 1
      },
      {
        "id": 2,
        "type": "root_cause",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 0
      },
      {
        "id": 3,
        "type": "conceptual_flip",
        "question": "...",
        "options": [
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."},
          {"text": "...", "rationale": "..."}
        ],
        "remediation_pointer": "...",
        "answer_index": 2
      }
    ]
  }
  \`\`\`

  ---
`;
