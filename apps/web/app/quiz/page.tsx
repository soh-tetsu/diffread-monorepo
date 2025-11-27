"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { QuizView } from "@/components/quiz/QuizView";
import { normalizeHookQuestions } from "@/lib/quiz/normalize-hook-questions";
import type { HookStatus, QuizStatus } from "@/types/db";
import type { QuizQuestion } from "@/lib/quiz/normalize-question";
import "./quiz.css";

type QuizMetaResponse = {
  session: {
    session_token: string;
    status: "pending" | "ready" | "completed" | "errored";
    article_url: string | null;
  };
  article: {
    id: number;
    status: string;
    metadata: {
      title: string | null;
    };
  } | null;
};

type HooksResponse = {
  status: HookStatus;
  hooks: unknown;
  errorMessage: string | null;
};

type InstructionsResponse = {
  status: QuizStatus;
  questions: QuizQuestion[];
  failureReason: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
});

export default function QuizPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("q");
  const showInstructions = searchParams.get("show") === "instructions";

  if (!token) {
    return (
      <main className="quiz-container">
        <div className="quiz-error">
          <h1>Missing session token</h1>
          <p>
            Use a link shared from Diffread that includes the <code>?q=token</code> parameter.
          </p>
        </div>
      </main>
    );
  }

  // Fetch quiz metadata (session + article info)
  const { data: quizMeta, error: metaError } = useSWR<QuizMetaResponse>(
    `/api/quiz?q=${token}`,
    fetcher
  );

  // Fetch hook questions
  const { data: hooksData, error: hooksError } = useSWR<HooksResponse>(
    `/api/hooks?q=${token}`,
    fetcher
  );

  // Fetch instruction questions (only if session is ready or if user explicitly wants to see them)
  const { data: instructionsData, error: instructionsError } = useSWR<InstructionsResponse>(
    quizMeta?.session.status === "ready" || showInstructions
      ? `/api/instructions?q=${token}`
      : null,
    fetcher
  );

  // Handle loading state
  if (!quizMeta || !hooksData) {
    return (
      <main className="quiz-container">
        <div className="quiz-loading">Loading quiz…</div>
      </main>
    );
  }

  // Handle errors
  if (metaError || hooksError) {
    return (
      <main className="quiz-container">
        <div className="quiz-error">
          <h1>Something went wrong.</h1>
          <p>{metaError?.message || hooksError?.message || "Unknown error."}</p>
        </div>
      </main>
    );
  }

  // Normalize questions
  const hookQuestions = normalizeHookQuestions(hooksData.hooks);
  const questions = instructionsData?.questions || [];

  return (
    <main className="quiz-container" id="quiz-top">
      <QuizView
        sessionToken={token}
        articleUrl={quizMeta.session.article_url}
        articleTitle={quizMeta.article?.metadata?.title ?? null}
        initialInstructionsVisible={showInstructions}
        hookQuestions={hookQuestions}
        hookStatus={hooksData.status}
        questions={questions}
      />
    </main>
  );
}
