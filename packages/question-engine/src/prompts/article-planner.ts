import type { ArticleMetadata } from "../types";
import type { PromptDefinition, PromptContext } from "./types";

function assertMetadata(metadata?: ArticleMetadata): ArticleMetadata {
  if (!metadata) {
    throw new Error("articlePlannerPrompt requires metadata input.");
  }
  return metadata;
}

function assertTaskPool(taskPool?: PromptContext["taskPool"]): PromptContext["taskPool"] {
  if (!taskPool || taskPool.length === 0) {
    throw new Error("articlePlannerPrompt requires a non-empty task pool.");
  }
  return taskPool;
}

function renderArticlePlannerPrompt(context: PromptContext): string {
  const metadata = assertMetadata(context.metadata);
  const taskPool = assertTaskPool(context.taskPool);

  const metadataJson = JSON.stringify(metadata, null, 2);
  const taskPoolJson = JSON.stringify(taskPool, null, 2);

  return `You are an expert cognitive scientist and master educator. Your sole task is to act as a "Reading Plan Strategist."

    You will be given two inputs:
    1.  A \`[METADATA]\` JSON object about a text.
    2.  A \`[TASK_POOL]\` JSON array (a "menu" of possible tasks).
    
    Your job is to build a custom \`reading_plan\` by selecting and adapting tasks *only* from the provided \`[TASK_POOL]\`.

    Your output **must** be a single, valid JSON object with a root key of \`reading_plan\`. Do not output any other text.

    ---

    ### Universal Pedagogical Principles (Your Logic)

    You **must** follow these 3 principles to build the plan:

    **1. Principle of Entry Ramp (Complexity Rule):**
    * **IF** \`complexity.lexical == "Specialized"\` OR \`complexity.overall == "Academic"\`:
      * You MUST starts with a **"Grounding Task"** (e.g., \`Task_Concept_Map\` or \`Task_Jargon_Check\`) to ensure the user understands the vocabulary *before* tackling the argument.
    * **ELSE** (if the text is Simple/Casual):
      * You MUST **SKIP** definition/grounding tasks. Start immediately with the **"Core Argument Task"** (e.g., \`Task_Identify_Thesis\`), as defining simple terms is patronizing.

    **2. Principle of Pacing (Time Rule):**
    * **IF** \`estimated_reading_minutes < 4\` (The Sprint):
        * Select ONLY the **2 most critical tasks**:
          1. The task that covers the \`core_thesis\`.
          2. The task that covers the \`key_takeaway\` or \`implication\`.
        * *Do not create multiple "Parts".*
    * **IF** \`estimated_reading_minutes > 8\` (The Marathon):
        * You MUST "chunk" the plan into **3 distinct Parts** (e.g., "Phase 1: Scouting", "Phase 2: Analysis", "Phase 3: Synthesis").
    * **ELSE** (4-8 mins):
        * Create a standard 2-Part plan (e.g., "Understanding" -> "Applying").

    **3. Principle of Contextualization (Templating Rule):**
    * **Placeholder Replacement:** You MUST replace \`{core_thesis}\` with the actual string from metadata.
    * **Concept Limiting:** When replacing \`{key_concepts}\`, select only the **Top 3** most difficult/important concepts from the metadata list. Do not list more than 3.
    * **Preservation:** You MUST copy the \`task_id\` and \`question_type\` exactly from the \`[TASK_POOL]\`.
    
    ---
    ### Example: Short Sprint (High Complexity)
    **Input [METADATA]:**
    \`\`\`json
    {
      "complexity": {"overall": "Academic"},
      "estimated_reading_minutes": 3,
      "core_thesis": "Quantum entanglement challenges local realism.",
      "key_concepts": ["Entanglement", "Local Realism", "Bell's Theorem", "Spin"]
    }
    \`\`\`

    **Input [TASK_POOL]:**
    \`\`\`json
    [
      {"id": "Task_Define", "description": "Define: {key_concepts}", "question_type": "explicit"},
      {"id": "Task_Thesis", "description": "Analyze the thesis: {core_thesis}", "question_type": "implicit"},
      {"id": "Task_Critique", "description": "Critique the methodology.", "question_type": "implicit"}
    ]
    \`\`\`

    **Output (Rationale + JSON):**
    \`\`\`json
    {
      "rationale": "The text is Academic, so I usually need grounding. However, it is a 3-minute Sprint. I will prioritize the Definition task (for grounding) and the Thesis task. I limited concepts to the top 3.",
      "reading_plan": [
        {
          "part": 1,
          "title": "Mission: Rapid Analysis",
          "tasks": [
            {
              "task_id": "Task_Define",
              "task_instruction": "Define: ['Entanglement', 'Local Realism', 'Bell's Theorem']",
              "question_type": "explicit"
            },
            {
              "task_id": "Task_Thesis",
              "task_instruction": "Analyze the thesis: Quantum entanglement challenges local realism.",
              "question_type": "implicit"
            }
          ]
        }
      ]
    }
    \`\`\`
    ---

    ### Task

    Now, generate the single JSON object for the following inputs.
    
    Your task has two parts (output must be valid JSON only—use double quotes everywhere, escape only per RFC8259 rules, never emit \\' for apostrophes, and do not wrap the JSON in markdown fences or add commentary outside the JSON object):

    1.  \`rationale\`: (2-3 sentences) in plain text. This is your "chain of thought" to justify your final \`reading_plan\`. You **must** explain how you applied the 'Universal Pedagogical Principles' to the \`[METADATA]\` (e.g., "Because \`time\` was 12 mins, I chunked the plan. Because \`complexity\` was 'Specialized', I included \`Task_Define\`...").
    2.  \`"reading_plan"\`: (Array) The final reading plan, in **English**. Each \`part\` object must contain a \`tasks\` array. Each task in *that* array **must** be a JSON object with three keys: \`task_id\`, \`task_instruction\`, and \`question_type\`.
  
  ---
  **[METADATA]**
  ${metadataJson}

  **[TASK_POOL]**
  ${taskPoolJson}
`;
}

export const articlePlannerPrompt: PromptDefinition = {
  id: "article-planner",
  version: "article-planner-v1",
  objective: "Create a phased reading plan tailored to article metadata and task pool.",
  systemInstruction:
    "You select and adapt tasks from a predefined pool to generate a JSON reading plan for Diffread readers.",
  render: (context) => renderArticlePlannerPrompt(context),
};
