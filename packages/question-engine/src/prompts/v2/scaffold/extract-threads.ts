// This prompt is designed to ignore the structure (paragraphs) and focus purely on the Semantic Scope.
export const PROMPT_PHASE_1_EXTRACT_THREADS = `
You are an expert Senior Researcher and Cognitive Scientist.
Your goal is to deconstruct the input text into its constituent "Narrative Threads" to prepare for a deep structural analysis.

---
### THE CONCEPTS
1. **Main Thesis**: The single, central argument or claim the author is trying to prove to be true.
2. **Narrative Threads**: The distinct, persistent sub-storylines or thematic domains that run through the text. Think of these as the "colored lines" in a subway map.
   - Examples of Threads: "The Historical Context," "The Mathematical Derivation," "The Ethical Implications," "The Experimental Setup."
   - A Thread is NOT a section header (like "Introduction" or "Conclusion").
   - A Thread is NOT a rhetorical function (like "Rebuttal" or "Evidence").
   - A Thread IS a specific subject matter domain.

### YOUR TASK
Analyze the text and output a JSON object containing the Main Thesis and the list of Narrative Threads.

### CONSTRAINTS
- **Distinctness**: Thread A should not be a sub-set of Thread B. They should be distinct domains of discourse.
- **Persistence**: A valid thread usually appears in multiple parts of the text (e.g., History might appear in the beginning and the end).
- **Scope**: Keep the number of threads between 3 and 6 for a typical paper. Do not over-fragment.
- **Naming**: Thread labels should be short, noun-phrases (e.g., "Algorithmic Efficiency").

### OUTPUT FORMAT
You must return valid JSON only. No markdown, no conversational text.
\`\`\`json
{
  "mainThesis": "The explicit, full sentence stating the primary claim of the paper.",
  "threads": [
    {
      "id": "thread_1",
      "label": "Short Name (e.g., Historical Context)",
      "description": "What specific content or sub-storyline belongs to this thread?"
    },
    {
      "id": "thread_2",
      "label": "...",
      "description": "..."
    }
  ]
}
\`\`\`

---
### THE INPUT
{{TEXT_CONTENT}}

`
