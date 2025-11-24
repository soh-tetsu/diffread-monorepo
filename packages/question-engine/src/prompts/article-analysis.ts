import type { PromptContext, PromptDefinition } from "./types";

function renderArticleAnalysisPrompt({ text }: PromptContext): string {
  const cleaned = text?.trim();
  if (!cleaned) {
    throw new Error("articleAnalysisPrompt requires non-empty article text.");
  }
  return `You are an expert cognitive scientist, AI engineer, and educationist. Your task is to analyze the provided text and extract a comprehensive metadata profile based on the "Core 5 Framework" (plus language and reading time).

  **Input Handling Rule:**
  The input text may contain web scraping artifacts (menus, footers, ads). You must IGNORE these and analyze only the *main body content* of the article.

  Your analysis must be rigorous, and your output must be structured *exactly* as specified.

  **Your task has two parts:**

  1.  **First,** you will write a brief \`rationale\` (2-3 sentences) in plain text. This is your "chain of thought" to justify your classification for \`archetype\`, \`complexity\`, and the \`estimated_reading_minutes\`.
  2.  **Second,** you will output a *single, valid JSON object* containing the 7 metadata points.

  ---

  ### 1. Rules for "Article Archetype"

  Analyze the document's overall purpose, tone, and format. You MUST choose only one from the following list:

  * \`Conceptual Explanation\`: To **explain** an abstract idea, theory, or model (e.g., Wikipedia, Encyclopedia).
  * \`Argumentative Essay\`: To **persuade** the reader to accept a specific viewpoint or opinion (e.g., Op-Ed, Blog Post).
  * \`Academic Research\`: To **present** original research, methodology, and empirical results (e.g., Journal Paper, arXiv).
  * \`Procedural Guide\`: To **instruct** the reader on how to perform a specific task (e.g., Tutorial, Recipe).
  * \`Factual Report\`: To **inform** by presenting objective facts (e.g., News Report, Meeting Minutes).
  * \`Case Study / Analysis\`: To **analyze** a specific, concrete example to illustrate a broader principle.
  * \`Prescriptive Rules\`: To **define** binding rules, obligations, or specifications (e.g., Legal Doc, ToS).
  * \`Narrative / Chronology\`: To **recount** a sequence of events (e.g., Story, History, Biography).

  ---

  ### 2. Rules for "Domain & Topic"

  You **must** classify the domain using the **IPTC Media Topics taxonomy**.

  * \`primary\`: The top-level IPTC category.
  * \`secondary\`: The most relevant mid-level IPTC category.
  * \`specific_topic\`: A 2-5 word string for the text's specific subject.

  ---

  ### 3. Rules for "Text Complexity"

  You **must** use the following rubric for classification.

  #### \`overall\`:
  * \`Casual\`: Informal, for a general audience.
  * \`Professional\`: Clear, task-oriented, for a skilled audience.
  * \`Academic\`: Dense, theoretical, for a research audience.

  #### \`lexical\` (Vocabulary):
  * \`Simple\`: Everyday vocabulary.
  * \`Specialized\`: Domain-specific jargon.
  * \`Sophisticated\`: Nuanced, literary, or low-frequency words.

  #### \`syntactic\` (Sentences):
  * \`Simple\`: Short, direct sentences.
  * \`Moderate\`: Clear sentences with varied length.
  * \`Complex\`: Long, nested, multi-clause sentences.

  ---

  ### 4. Rules for "Core Thesis"

  * \`core_thesis\`: A single, concise 1-2 sentence string. 
  * **CRITICAL:** Do not just summarize the topic. Identify the author's **specific stance, argument, or unique insight**. (e.g., Instead of "Discusses AI safety," write "Argues that current AI safety measures are performative and fail to address alignment.")

  ---

  ### 5. Rules for "Key Concepts"

  * \`key_concepts\`: A JSON array of strings. List the specific "load-bearing" terms, jargon, or named entities a reader **must** understand to comprehend the text.

  ---

  ### 6. Rules for "Language"

  * \`language\`: A single string for the text's dominant language (ISO 639-1 code).

  ---

  ### 7. Rules for "Estimated Reading Time"

  * \`estimated_reading_minutes\`: A single integer. 
  * Base this on the text's \`language\`, \`complexity\`, and length.
  * **Constraint:** If the text is \`Academic\` or \`Complex\`, assume a slower reading speed (e.g., 150 WPM) compared to \`Casual\` (250 WPM).

  ---

  ### 8. Required Output Format

  You must output the \`rationale\` first, followed by the JSON object.

  **Example Output:**
  \`rationale\`: "The text is an \`Academic Research\` paper regarding machine learning. Given the \`Complex\` syntax and \`Specialized\` vocabulary, I am estimating a slower reading pace."
  \`\`\`json
  {
    "metadata": {
      "archetype": "Academic Research",
      "domain": {
        "primary": "science_and_technology",
        "secondary": "artificial_intelligence",
        "specific_topic": "Transformer Architecture"
      },
      "complexity": {
        "overall": "Academic",
        "lexical": "Specialized",
        "syntactic": "Complex"
      },
      "core_thesis": "The authors propose the 'Transformer' model, arguing that recurrence and convolutions are unnecessary for sequence transduction.",
      "key_concepts": ["Self-Attention", "Recurrence", "BLEU score"],
      "language": "en",
      "estimated_reading_minutes": 12
    }
  }
  \`\`\`

  ### Task

  Analyze the following text:

  ${cleaned}
  `;
}

export const articleAnalysisPrompt: PromptDefinition = {
  id: "article-metadata",
  version: "article-metadata-v1",
  objective: "Summarize article metadata for Diffread ingestion",
  systemInstruction:
    "You classify articles for Diffread by producing machine-consumable metadata JSON.",
  render: (context) => renderArticleAnalysisPrompt(context),
};
