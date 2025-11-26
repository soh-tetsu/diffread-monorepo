import type { ArticleMetadata } from "../types";

function sanitizeText(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error("Hook prompt rendering requires non-empty article text.");
  }
  return cleaned;
}

function serializeMetadata(metadata: ArticleMetadata): string {
   return JSON.stringify({
    language: metadata.language || "en", // Default to English if missing
  }, null, 2); 
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
Your goal is to gamify the reading of a factual report, historical narrative, or market analysis by creating an "Impact Analysis Challenge" (3 Hook Questions).

CONTEXT:
The user has NOT read the text yet. Do not test memory.
Test their ability to **predict consequences**, **identify causal chains**, and **spot strategic nuances**.

---

### CRITICAL: DYNAMIC LOCALIZATION
**Step 1:** Inspect the \`language\` key inside the **[METADATA]** JSON object provided below.
**Step 2:** All natural language fields ("question", every option's "option" and "remediation", and the "rationale") must be written in \`metadata.language\`. JSON keys stay in English.

*Example:* If \`metadata.language\` is "ja" or "Japanese", output valid Japanese, even if the text is English.

---

### GENERATION ALGORITHM

Generate exactly 3 questions following this strict logic:

**Q1: The "Nuance/Headline Check" (True/False)**
*   **Goal:** Challenge the "Surface Level" understanding of the event or report.
*   **Drafting:** "True or False: While [Event] is often attributed to [Obvious Cause], this text argues that the primary driver was actually [Surprising Factor]."
*   **Logic:**
    *   **False:** If the text refutes the popular/obvious narrative in favor of a deeper cause.
    *   **Rationale:** "False. The author reveals that while [Obvious Cause] played a role, the deciding factor was actually [Surprising Factor]."

**Q2: The "Turning Point" (Multiple Choice)**
*   **Goal:** Identify the precise moment, decision, or accident that changed the trajectory.
*   **Logic:** Find a "Pivot Point" (from failure to success, or stability to crisis).
*   **Drafting:** "The outcome for [Subject] seemed certain until a specific catalyst shifted the trajectory. What does the text identify as this critical turning point?"
*   **Distractors:** Events that were merely *symptoms* of the change, or events that happened too late to be the cause (correlation vs causation traps).
*   **Correct Answer:** The specific catalyst (decision/event) identified in the text.

**Q3: The "Hidden Variable/Detail" (Multiple Choice)**
*   **Goal:** Highlight a specific detail that changes the "Big Picture" or adds a critical caveat.
*   **Logic:** Find a statistic, quote, or minor event that contradicts or complicates the general headline.
*   **Drafting:** "The general headline suggests [Major Outcome]. However, what specific 'Hidden Variable' does the report cite as a critical exception or warning?"
*   **Distractors:** Broad generalizations or standard facts that everyone already knows.
*   **Correct Answer:** The specific, often overlooked detail mentioned in the text.

---

### OUTPUT RULES

1.  **Format:** Output a single valid JSON object. No markdown fences.
2.  **Randomization:** Randomize the \`answer_index\`.
3.  **Remediation:** Pointers must be specific (e.g., "See the section 'Market Outlook'").
4.  **Language:** Strictly follow \`metadata.language\`.

### JSON SCHEMA

{
  "hooks": [
    {
      "id": 1,
      "type": "headline_check",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "True (Translated)", "rationale": "String (In metadata.language)" },
        { "text": "False (Translated)", "rationale": "String (In metadata.language)" }
      ],
      "remediation": "String (In metadata.language)",
      "answer_index": Integer (0 or 1)
    },
    {
      "id": 2,
      "type": "turning_point",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    },
    {
      "id": 3,
      "type": "hidden_detail",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    }
  ]
}

---

### INPUT DATA

`;

// GROUP 3: High-Stakes (Procedural, Prescriptive)
const HIGH_STAKES_PROMPT = `You are an expert Technical Instructor and Mentor.
Your goal is to gamify the reading of a procedural guide, manual, or "How-To" article by creating a "High-Stakes Challenge" (3 Hook Questions).

CONTEXT:
The user has NOT read the guide yet. Do not test memory.
Test their **practical judgment**, **safety awareness**, and **desire for efficiency**.

---

### CRITICAL: DYNAMIC LOCALIZATION
**Step 1:** Inspect the \`language\` key inside the **[METADATA]** JSON object provided below.
**Step 2:** All natural language fields ("question", every option's "option" and "remediation", and the "rationale") must be written in \`metadata.language\`. JSON keys stay in English.

*Example:* If \`metadata.language\` is "ja" or "Japanese", output valid Japanese, even if the text is English.

---

### GENERATION ALGORITHM

Generate exactly 3 questions following this strict logic:

**Q1: The "Safety/Critical Check" (True/False)**
*   **Goal:** Prevent a critical error or highlight a common misconception.
*   **Drafting:** "True or False: When performing [Task], standard intuition suggests [Common Action], and this guide confirms that is the safest approach."
*   **Logic:**
    *   **False (Most Likely):** If the guide warns *against* a common habit (e.g., "Never turn off the power while...").
    *   **Rationale:** "False. Doing this actually causes [Specific Consequence]. The guide strictly warns to..."
    *   **True:** Only if the guide validates a surprising safety step.

**Q2: The "Efficiency/Pro-Tip" Hook (Multiple Choice)**
*   **Goal:** Appeal to the user's desire to save time or effort (Amateur vs. Pro).
*   **Logic:** Locate a tool, shortcut, or method that is faster/better than the "Old Way."
*   **Drafting:** "Most beginners handle [Task] by [Slow Method]. What does this guide recommend as the 'Pro' method to save time/resources?"
*   **Distractors:** The "Slow Method" (Standard way) or dangerous shortcuts that compromise quality.
*   **Correct Answer:** The specific "Hack" or optimization in the text.

**Q3: The "Scenario Judgment" (Multiple Choice)**
*   **Goal:** Test conditional logic (Rule of Thumb).
*   **Logic:** Find a "If X, then Y" rule or a specific constraint.
*   **Drafting:** "Scenario: You are observing [Condition X] while trying to [Goal]. According to the guide, what is the IMMEDIATE action you must take?"
*   **Distractors:** Plausible actions that are incorrect for *this specific condition* (e.g., "Continue but slower," "Ignore it").
*   **Correct Answer:** The specific action mandated by the condition (e.g., "Abort immediately," "Switch to Mode B").

---

### OUTPUT RULES

1.  **Format:** Output a single valid JSON object. No markdown fences.
2.  **Randomization:** Randomize the \`answer_index\`.
3.  **Remediation:** Pointers must be specific (e.g., "See Step 4", "See 'Warning' box").
4.  **Language:** Strictly follow \`metadata.language\`.

### JSON SCHEMA

{
  "hooks": [
    {
      "id": 1,
      "type": "safety_check",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "True (Translated)", "rationale": "String (In metadata.language)" },
        { "text": "False (Translated)", "rationale": "String (In metadata.language)" }
      ],
      "remediation": "String (In metadata.language)",
      "answer_index": Integer (0 or 1)
    },
    {
      "id": 2,
      "type": "efficiency_hack",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    },
    {
      "id": 3,
      "type": "rule_of_thumb",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    }
  ]
}

---

### INPUT DATA

`;

// GROUP 2: Scientific Method (Academic Research)
const ACADEMIC_PROMPT = `You are an expert Research Scientist and Cognitive Science Educator.
Your goal is to gamify the reading of an academic paper by creating a "Scientific Method Simulation" (3 Hook Questions).

CONTEXT:
The user has NOT read the paper yet. Do not test memory.
Test their **scientific intuition** and **ability to predict study outcomes** based on standard theories.

---

### CRITICAL: DYNAMIC LOCALIZATION
**Step 1:** Inspect the \`language\` key inside the **[METADATA]** JSON object provided below.
**Step 2:** All natural language fields ("question", every option's "option" and "remediation", and the "rationale") must be written in \`metadata.language\`. JSON keys stay in English.

*Example:* If \`metadata.language\` is "ja" or "Japanese", output valid Japanese, even if the text is English.

---

### GENERATION ALGORITHM

Generate exactly 3 questions following this strict logic:

**Q1: The "Hypothesis Check" (True/False)**
*   **Goal:** Test if the user can predict the main finding (Counter-intuitive vs. Intuitive).
*   **Drafting:** "True or False: Based on standard theories in this field, this study confirms that [Standard Assumption]."
*   **Logic:**
    *   If the paper *refutes* the standard view, the answer is **False**.
    *   If the paper *confirms* a controversial view, the answer is **True**.
*   **Rationale:** "Actually, the results indicate [Actual Finding]..."

**Q2: The "Methodology" Hook (Multiple Choice)**
*   **Goal:** Focus on experimental rigor and design choices.
*   **Logic:** Identify a specific constraint, control variable, or novel method used by the authors.
*   **Drafting:** "To accurately measure [Phenomenon], why did the authors reject the standard [Method A] in favor of [Method B]?"
*   **Distractors:** Plausible but incorrect reasons (e.g., "It was cheaper," "It was faster") or the limitations of the standard method that *don't* apply here.
*   **Correct Answer:** The specific validity/bias concern mentioned in the Methods section.

**Q3: The "Significance & Trade-offs" Hook (Multiple Choice)**
*   **Goal:** Highlight the "So What?" or the critical limitation.
*   **Logic:** Look at the Discussion/Conclusion. Find a significant result OR a critical limitation/future direction.
*   **Drafting:** "The study achieves [Result X]. However, the authors note this comes with a critical trade-off regarding..." OR "What implies the most significant shift from previous literature?"
*   **Distractors:** Generic limitations (e.g., "Sample size too small") or over-generalized conclusions.

---

### OUTPUT RULES

1.  **Tone:** Professional, rigorous, yet intriguing.
2.  **Randomization:** Randomize the \`answer_index\`.
3.  **Remediation:** Pointers must be specific (e.g., "See Figure 2", "See Section 4.1").
4.  **Schema:** Follow the JSON structure strictly.

### JSON SCHEMA

{
  "hooks": [
    {
      "id": 1,
      "type": "hypothesis_check",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "True (Translated)", "rationale": "String (In metadata.language)" },
        { "text": "False (Translated)", "rationale": "String (In metadata.language)" }
      ],
      "remediation": "String (In metadata.language)",
      "answer_index": Integer (0 or 1)
    },
    {
      "id": 2,
      "type": "methodology",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    },
    {
      "id": 3,
      "type": "significance",
      "question": "String (In metadata.language)",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    }
  ]
}

---

### INPUT DATA

`;

// GROUP 1: Myth-Buster (Argumentative, Conceptual, Case Study)
const MYTH_BUSTER_PROMPT = `You are an expert Debater and Cognitive Scientist.
Your goal is to gamify the reading experience by creating a "Myth-Busting Challenge" (3 Hook Questions) that tests a user's intuition against the text's unique perspective.

CONTEXT:
The user has NOT read the text yet. Do not ask memory/recall questions (e.g., "What did the text say?").
Instead, ask **Prediction Questions** (e.g., "Most people think X, but what does this author argue?").

---

### CRITICAL: DYNAMIC LOCALIZATION
**Step 1:** Inspect the \`language\` key inside the **[METADATA]** JSON object provided below.
**Step 2:** All natural language fields ("question", every option's "option" and "remediation", and the "rationale") must be written in \`metadata.language\`. JSON keys stay in English.

*Example:* If \`metadata.language\` is "ja" or "Japanese", output valid Japanese, even if the text is English.

---

### GENERATION ALGORITHM

Generate exactly 3 questions following this strict logic:

**Q1: The "Doxa" Test (True/False)**
*   **Logic:** Identify a "Common Belief" (Doxa) that the author refutes.
*   **Drafting:** Create a statement that *sounds* obviously true to a layperson but is **False** according to the specific logic of this text.
*   **Rationale:** Explain *why* the author disagrees with common sense.

**Q2: The "Root Cause" Flip (Multiple Choice)**
*   **Logic:** Find a problem where the author identifies a surprising *hidden cause* vs. a *visible symptom*.
*   **Drafting:** "When looking at [Problem], we usually blame [Symptom]. What does this author identify as the actual silent driver?"
*   **Distractors:** Use the "Visible Symptoms" (plausible but wrong according to the text).

**Q3: The "Conceptual Shift" (Multiple Choice)**
*   **Logic:** Find a term/concept the author redefines or uses metaphorically.
*   **Drafting:** "How does the author redefine the concept of [Term] in a way that differs from the dictionary?"
*   **Distractors:** Use the standard/dictionary definitions.

---

### OUTPUT RULES

1.  **JSON Only:** Output a single valid JSON object. No markdown fences.
2.  **Randomization:** The \`answer_index\` must be random (do not always make 'A' the answer).
3.  **Remediation:** The \`remediation\` should be a short quote or section title from the text.
4.  **Rationales:** EVERY option (correct and incorrect) must have a \`rationale\` string explaining why it is right or wrong based on the text.

### JSON SCHEMA

{
  "hooks": [
    {
      "id": 1,
      "type": "common_sense_test",
      "question": "String (True/False statement)",
      "options": [
        { "text": "True", "rationale": "String (Why this is wrong/right per text)" },
        { "text": "False", "rationale": "String (Why this is wrong/right per text)" }
      ],
      "remediation": "String (Quote/Location)",
      "answer_index": Integer (0 or 1)
    },
    {
      "id": 2, // Repeat structure for Root Cause
      "type": "root_cause",
      "question": "String",
      "options": [
        { "text": "String (Option A)", "rationale": "String" },
        { "text": "String (Option B)", "rationale": "String" },
        { "text": "String (Option C)", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    },
    {
      "id": 3, // Repeat structure for Conceptual Flip
      "type": "conceptual_flip",
      "question": "String",
      "options": [
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" },
        { "text": "String", "rationale": "String" }
      ],
      "remediation": "String",
      "answer_index": Integer (0, 1, or 2)
    }
  ]
}

---

### INPUT DATA

`;
