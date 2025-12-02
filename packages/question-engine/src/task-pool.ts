import type { TaskTemplate } from './types'

const CONCEPTUAL_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description:
      'Locate the key terms: {key_concepts} and identify the specific section where each is introduced.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Concept',
    description:
      'Identify the core concept being explained and its primary category (e.g., is it a theory, a process, or a tool?).',
    questionType: 'explicit',
  },
  {
    id: 'Task_Components',
    description: 'Break down the concept into its key components or sub-parts.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Mechanism',
    description:
      'Analyze the mechanism: How do these components interact to make the concept work?',
    questionType: 'implicit',
  },
  {
    id: 'Task_Example',
    description: "Deconstruct the author's primary example to see how it illustrates the concept.",
    questionType: 'implicit',
  },
  {
    id: 'Task_Implication',
    description:
      "Evaluate the broader significance: Why does understanding '{core_thesis}' matter?",
    questionType: 'implicit',
  },
]

const ARGUMENTATIVE_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Contextualize the key terms: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Thesis',
    description: "Identify and paraphrase the author's central argument (the claim).",
    questionType: 'explicit',
  },
  {
    id: 'Task_Map_Arguments',
    description: 'Find the key supporting arguments (the reasons).',
    questionType: 'explicit',
  },
  {
    id: 'Task_Isolate_Evidence',
    description: 'Find the specific evidence for each argument (the proof).',
    questionType: 'explicit',
  },
  {
    id: 'Task_Find_Assumptions',
    description: 'Identify any unstated assumptions or logical leaps.',
    questionType: 'implicit',
  },
  {
    id: 'Task_Evaluate_Support',
    description: 'Critically judge the quality, bias, and sufficiency of the evidence.',
    questionType: 'implicit',
  },
  {
    id: 'Task_Formulate_Counterargument',
    description: "Generate a logical counterargument to the thesis that '{core_thesis}'",
    questionType: 'implicit',
  },
]

const PROCEDURAL_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Locate the tools or commands: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Goal',
    description: 'Identify the final goal or outcome of this procedure.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Verify_Prerequisites',
    description: 'List the prerequisites, materials, or setup needed before starting.',
    questionType: 'confirmative',
  },
  {
    id: 'Task_Confirm_Steps',
    description: 'Break down the procedure into its main, sequential steps or stages.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Check_Outcome',
    description: 'Identify the expected result or how to verify success after finishing.',
    questionType: 'explicit',
  },
]

const FACTUAL_REPORT_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Define key entities, people, or terms: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Main_Event',
    description: 'Identify the main event, topic, or announcement of the report.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Extract_Key_Facts',
    description: 'Extract the key facts (e.g., Who, What, Where, When, How many).',
    questionType: 'explicit',
  },
  {
    id: 'Task_Find_Result',
    description:
      "Summarize the primary outcome, key data, or 'so what' of the report: '{core_thesis}'",
    questionType: 'explicit',
  },
]

const CASE_STUDY_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Define key concepts: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Context',
    description:
      'Describe the context: Who/what is the case about, and what is the central problem?',
    questionType: 'explicit',
  },
  {
    id: 'Task_Analyze_Actions',
    description: 'What key actions were taken or events occurred in the case?',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Principle',
    description: 'Identify the broader lesson, concept, or principle the case illustrates.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Connect_Case_To_Principle',
    description:
      "Explain how the actions/outcomes demonstrate that principle (the core 'so what': '{core_thesis}').",
    questionType: 'implicit',
  },
]

const PRESCRIPTIVE_RULES_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Define the key binding terms: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Scope',
    description: 'Identify the parties or scope this document applies to.',
    questionType: 'explicit',
  },
  {
    id: 'Task_List_Obligations',
    description: "Identify the primary obligations or requirements (the 'must do's).",
    questionType: 'explicit',
  },
  {
    id: 'Task_List_Permissions',
    description: "Identify the key permissions or rights granted (the 'may do's).",
    questionType: 'explicit',
  },
  {
    id: 'Task_List_Prohibitions',
    description: "Identify the primary prohibitions or restrictions (the 'must not do's).",
    questionType: 'explicit',
  },
  {
    id: 'Task_Find_Consequences',
    description: 'Identify the consequences or penalties for non-compliance.',
    questionType: 'explicit',
  },
]

const NARRATIVE_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Define key people, places, or terms: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Establish_Setting',
    description: 'Identify the setting (time/place) and the main actors or characters.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Map_Plot',
    description: 'Outline the key events in chronological order.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Analyze_Causality',
    description: 'Analyze the cause-and-effect relationships. Why did key events happen?',
    questionType: 'implicit',
  },
  {
    id: 'Task_Identify_Theme',
    description:
      "Identify the main theme, lesson, or outcome from this sequence of events: '{core_thesis}'",
    questionType: 'implicit',
  },
]

const ACADEMIC_POOL: TaskTemplate[] = [
  {
    id: 'Task_Define',
    description: 'Locate and contextually define the technical terms: {key_concepts}',
    questionType: 'explicit',
  },
  {
    id: 'Task_Identify_Gap',
    description: 'Identify the research gap or specific problem the authors are trying to solve.',
    questionType: 'explicit',
  },
  {
    id: 'Task_Analyze_Methodology',
    description: 'Analyze the methodology. How did they test their hypothesis?',
    questionType: 'explicit',
  },
  {
    id: 'Task_Synthesize_Results',
    description: 'Summarize the key empirical findings (the data).',
    questionType: 'explicit',
  },
  {
    id: 'Task_Critique_Limitations',
    description: 'Identify the limitations or trade-offs acknowledged by the authors.',
    questionType: 'implicit',
  },
  {
    id: 'Task_Evaluate_Significance',
    description: "Evaluate the broader contribution of this paper: '{core_thesis}'",
    questionType: 'implicit',
  },
]

const ARCHETYPE_TASK_MAP: Record<string, TaskTemplate[]> = {
  'Conceptual Explanation': CONCEPTUAL_POOL,
  'Argumentative Essay': ARGUMENTATIVE_POOL,
  'Procedural Guide': PROCEDURAL_POOL,
  'Factual Report': FACTUAL_REPORT_POOL,
  'Case Study / Analysis': CASE_STUDY_POOL,
  'Prescriptive Rules': PRESCRIPTIVE_RULES_POOL,
  'Narrative / Chronology': NARRATIVE_POOL,
  'Academic Research': ACADEMIC_POOL,
}

export function getTaskPoolData(archetype: string): TaskTemplate[] | null {
  return ARCHETYPE_TASK_MAP[archetype] ?? null
}
