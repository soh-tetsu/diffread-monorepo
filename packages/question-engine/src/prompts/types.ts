import type {
  QuizArticleInput,
  ArticleMetadata,
  ReadingPlanPart,
  TaskTemplate,
} from "../types";

export type PromptContext = {
  article?: QuizArticleInput;
  metadata?: ArticleMetadata;
  text?: string;
  taskPool?: TaskTemplate[] | null;
  readingPlan?: ReadingPlanPart[];
  taskInstruction?: string;
  questionType?: string;
  language?: string;
};

export type PromptDefinition = {
  id: string;
  version: string;
  objective: string;
  systemInstruction: string;
  render(context: PromptContext): string;
};
