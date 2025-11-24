import { supabase } from "@/lib/supabase";
import {
  QuestionContent,
  QuestionRow,
  QuestionType,
  QuizRow,
  QuizStatus,
} from "@/types/db";

export type SaveQuizQuestionInput = {
  question_type: QuestionType;
  content: QuestionContent;
  sort_order?: number;
};

export type SaveQuizInput = {
  quizId?: string;
  status?: QuizStatus;
  modelUsed?: string;
  questions: SaveQuizQuestionInput[];
};

export async function saveQuiz(
  articleId: number,
  quizData: SaveQuizInput
): Promise<{ quiz: QuizRow; questions: QuestionRow[] }> {
  const insertPayload: Record<string, unknown> = {
    article_id: articleId,
    status: quizData.status ?? "ready",
    model_used: quizData.modelUsed ?? null,
  };

  if (quizData.quizId) {
    insertPayload.quiz_id = quizData.quizId;
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert(insertPayload)
    .select("*")
    .single();

  if (quizError || !quiz) {
    throw new Error(`Failed to insert quiz: ${quizError?.message}`);
  }

  if (!quizData.questions.length) {
    return {
      quiz: quiz as QuizRow,
      questions: [],
    };
  }

  const questionsPayload = quizData.questions.map((question, index) => ({
    quiz_id: quiz.id,
    question_type: question.question_type,
    content: question.content,
    sort_order:
      typeof question.sort_order === "number" ? question.sort_order : index,
  }));

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .insert(questionsPayload)
    .select("*");

  if (questionsError || !questions) {
    await supabase.from("quizzes").delete().eq("id", quiz.id);
    throw new Error(`Failed to insert questions: ${questionsError?.message}`);
  }

  return {
    quiz: quiz as QuizRow,
    questions: questions as QuestionRow[],
  };
}
