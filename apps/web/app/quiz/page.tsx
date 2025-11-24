import { Suspense } from "react";
import { unstable_noStore as noStore } from "next/cache";
import { getSessionQuizPayload } from "@/lib/quiz/get-session-quiz";
import { QuizView } from "@/components/quiz/QuizView";
import "./quiz.css";

type Props = {
  searchParams: { q?: string };
};

async function QuizContent({ token }: { token: string }) {
  noStore();
  try {
    const data = await getSessionQuizPayload(token);
    return (
      <QuizView
        sessionToken={token}
        articleUrl={data.article?.original_url ?? data.session.article_url}
        articleTitle={data.article?.title ?? null}
        questions={data.questions}
      />
    );
  } catch (error) {
    return (
      <div className="quiz-error">
        <h1>Something went wrong.</h1>
        <p>{error instanceof Error ? error.message : "Unknown error."}</p>
      </div>
    );
  }
}

export default async function QuizPage({ searchParams }: Props) {
  const token = searchParams.q;

  if (!token) {
    return (
      <main className="quiz-container">
        <div className="quiz-error">
          <h1>Missing session token</h1>
          <p>Use a link shared from Diffread that includes the <code>?q=token</code> parameter.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="quiz-container" id="quiz-top">
      <Suspense fallback={<div className="quiz-loading">Loading quiz…</div>}>
        <QuizContent token={token} />
      </Suspense>
    </main>
  );
}
