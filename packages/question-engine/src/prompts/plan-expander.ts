import type { ArticleMetadata, ReadingPlanPart, TaskTemplate } from "../types";
import type { PromptContext, PromptDefinition } from "./types";

function assertArticleText(text?: string): string {
  const cleaned = text?.trim();
  if (!cleaned) {
    throw new Error("articleExpanderPrompt requires non-empty article text.");
  }
  return cleaned;
}

function assertMetadata(metadata?: ArticleMetadata): ArticleMetadata {
  if (!metadata) {
    throw new Error("articleExpanderPrompt requires metadata input.");
  }
  return metadata;
}

function assertTaskPool(taskPool?: TaskTemplate[] | null): TaskTemplate[] {
  if (!taskPool || taskPool.length === 0) {
    throw new Error("articleExpanderPrompt requires a non-empty task pool.");
  }
  return taskPool;
}

function assertReadingPlan(plan?: ReadingPlanPart[]): ReadingPlanPart[] {
  if (!plan || plan.length === 0) {
    throw new Error("articleExpanderPrompt requires a non-empty reading plan.");
  }
  return plan;
}

function renderPlanExpanderPrompt(context: PromptContext): string {
  const articleText = assertArticleText(context.text);
  const metadata = assertMetadata(context.metadata);
  const taskPool = assertTaskPool(context.taskPool);
  const readingPlan = assertReadingPlan(context.readingPlan);

  const metadataJson = JSON.stringify(metadata, null, 2);
  const planJson = JSON.stringify(readingPlan, null, 2);
  const legacyTaskPool = taskPool.map((task) => ({
    id: task.id,
    description: task.description,
    question_type: task.questionType,
  }));
  const taskPoolJson = JSON.stringify(legacyTaskPool, null, 2);

  return `You are an expert Text Analyst and Curriculum Deconstructor. Your sole task is to take a high-level \`[PLAN]\` and "expand" it by finding all corresponding evidence in the \`[FULL_TEXT]\`.

    You will be given four inputs:
    1.  \`[FULL_TEXT]\`: The complete article.
    2.  \`[PLAN]\`: A simple JSON array of *template IDs* to execute (e.g., \`["Task_Define", "Task_Example"]\`).
    3.  \`[TASK_POOL]\`: A JSON array of *template definitions* (the "menu" of tasks).
    4.  \`[METADATA]\`: The JSON metadata object (for context like \`key_concepts\`).

    Your goal is to find **all** possible instances that match the plan and generate a detailed "Expanded Plan" in JSON.

    ---

    ### 1. Core Logic (The 1:N Expansion)

    You **must** iterate through each \`task_id\` in the \`[PLAN]\`:
    1.  Find the corresponding task template in the \`[TASK_POOL]\`.
    2.  Analyze its instructions (e.g., "Define the key concepts: {key_concepts}").
    3.  Scan the \`[FULL_TEXT]\` to find **every single instance** that fulfills this instruction.
    4.  For *each* instance you find, you will generate one "instruction" object.

    * **Rule of Granularity:**
      * If \`[METADATA].key_concepts\` has 3 items, you MUST generate **3 separate instructions** for \`Task_Define\`.
      * If \`Task_Example\` is requested, find ALL distinct examples (up to 3 max) and generate separate instructions for each.

    ---

    ### 2. Output Schema & Field Rules

    You **must** output single JSON object with these 3 top-level keys: \`rationale\`, \`expanded_plan\`, and \`coverage_report\`.

    #### Part 1: Rationale (Your "Chain of Thought")
    You **must** first write a brief \`rationale\` in plain text. This is your internal monologue.
    * **Example:** "Rationale: The plan requires 'Task_Define' and 'Task_Example'. For 'Task_Define', I will use the 3 \`key_concepts\` from the metadata. I will now scan the text for their definitions... I found the definition for 'CLT' in paragraph 2 and 'Intrinsic Load' in paragraph 4. For 'Task_Example', I scanned the text and found two distinct examples: a 'worked example' in paragraph 7 and a 'bad example' in paragraph 9. I will now generate 5 total instructions (3 + 2). I estimate the article has 12 paragraphs total."

    #### Part 2: JSON Output (The \`expanded_plan\`)
    Your JSON **must** adhere to this structure:

    * \`expanded_plan\`: (Array) The root. An array of *objective* objects.
    * \`objective_id\`: (String) The parent template ID (e.g., \`Task_Define\`).
    * \`objective_description\`: (String) The human-readable description from the \`[TASK_POOL]\`, with placeholders like \`{key_concepts}\` filled in.
    * \`instructions\`: (Array) The 1:N array of *concrete* instruction objects you generated.

    #### Part 2.1: Instruction Object Fields (The "1" in 1:N)
    Each object in the \`instructions\` array **must** have these 6 keys:

    1.  \`instruction_id\`: (String) A brief, unique, kebab-case ID you invent for this item (e.g., \`def-clt\`, \`ex-math-problem\`).
    2.  \`task_instruction\`: (String) The final, 1:1 instruction for the Step 3 Generator (e.g., \`"Define the key concept: 'CLT'"\`).
    3.  \`question_type\`: (String) The type (e.g., "explicit", "implicit") copied *directly* from the \`[TASK_POOL]\` template.
    4.  \`relevant_context\`: (String) **CRITICAL:** The **full, self-contained text snippet** (1-3 paragraphs) that the Step 3 Generator will need to create a question. It must contain the answer and enough surrounding text for distractors. 
    5.  \`source_location\`: (Object)
        * \`anchor_text\`: (String) A **unique** 5-8 word string from the start of the relevant section. (Used for UI scrolling).
        * \`estimated_paragraph\`: (Integer) Your best guess of the paragraph number where this context is found.
    6.  \`estimated_difficulty\`: (String) Your expert rating of how hard this *specific* instruction is, based on the text. Must be one of: \`"easy"\`, \`"medium"\`, \`"hard"\`.

    #### Part 3: Coverage Report
    * \`coverage_report\`: (Object) An object with statistics.
        * \`total_paragraphs\`: (Integer) Your best estimate of the total number of paragraphs in the \`[FULL_TEXT]\`.
        * \`covered_paragraphs\`: (Array) A list of the unique \`estimated_paragraph\` numbers you cited in your instructions.
        * \`coverage_percent\`: (Float) The percentage of paragraphs covered (e.g., 3 covered / 12 total = \`0.25\`).

    ---

    ### 3. Example Output Format

    \`\`\`json
    {
      "rationale": "",
      "expanded_plan": [
        {
          "objective_id": "Task_Define",
          "objective_description": "Define the key concepts: ['CLT', 'Intrinsic Load']",
          "instructions": [
            {
              "instruction_id": "def-clt",
              "task_instruction": "Define the key concept: 'CLT'",
              "question_type": "explicit",
              "relevant_context": "Educational psychology offers many frameworks... [Pre-context] ...Cognitive Load Theory (CLT) is an instructional theory that suggests our working memory is limited... [Target] ...This has profound implications for UI design... [Post-context]",
              "source_location": {
                "anchor_text": "Cognitive Load Theory (CLT) is an instructional",
                "estimated_paragraph": 2
              },
              "estimated_difficulty": "easy"
            },
          ]
        },
      ],
      "coverage_report": {
        "total_paragraphs": 12,
        "covered_paragraphs": [2, 4, 7],
        "coverage_percent": 0.25
      }
    }
    \`\`\`

    ---

    ### Task
    1. \`rationale\`: (2-3 sentences) in plain text. This is your "chain of thought" to justify your final \`expanded_plan\`. 
    2. \`expanded_plan\`: You will then output a single JSON object adhering to the schema above.

    Now, generate the \`rationale\` and \`expanded_plan\` based on the inputs below.

  **[FULL_TEXT]**
  ${articleText}

  **[PLAN]**
  ${planJson}

  **[TASK_POOL]**
  ${taskPoolJson}

  **[METADATA]**
  ${metadataJson}

  `;
}

export const planExpanderPrompt: PromptDefinition = {
  id: "plan-expander",
  version: "plan-expander-v1",
  objective: "Expand high-level reading plan tasks into concrete instructions with coverage stats.",
  systemInstruction:
    "You expand Diffread reading plans by mapping each task to concrete instructions tied to the article text.",
  render: (context) => renderPlanExpanderPrompt(context),
};
