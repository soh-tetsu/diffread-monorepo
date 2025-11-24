"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { QuizQuestion } from "@/lib/quiz/normalize-question";
import { trackQuizSelection } from "@/lib/analytics/client";
import { toaster } from "@/components/ui/toaster";

type Props = {
  sessionToken: string;
  articleUrl?: string | null;
  articleTitle?: string | null;
  questions: QuizQuestion[];
};

export function QuizView({ sessionToken, articleUrl, articleTitle, questions }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [visibleCount, setVisibleCount] = useState(Math.min(3, questions.length));
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollTargetId = useRef<number | null>(null);
  const pollErrorNotified = useRef(false);
  const [queuedSessions, setQueuedSessions] = useState<
    Array<{
      token: string;
      articleUrl: string;
      status: string;
      failureReason?: string | null;
    }>
  >([]);

  const progress = useMemo(() => {
    const answered = Object.keys(answers).length;
    return `${answered}/${questions.length} answered`;
  }, [answers, questions.length]);

  const visibleQuestions = useMemo(
    () => questions.slice(0, visibleCount),
    [questions, visibleCount]
  );
  const canShowMore = visibleCount < questions.length;

  const allVisibleAnswered = visibleQuestions.every(
    (question) => answers[question.id] !== undefined && answers[question.id] !== null
  );

  const handleSelect = (questionId: number, optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    const question = questions.find((q) => q.id === questionId);
    if (question) {
      trackQuizSelection({
        sessionToken,
        questionId,
        selectedIndex: optionIndex,
        correct: optionIndex === question.answerIndex,
        timestamp: Date.now(),
      });
    }
  };

  const handleShowMore = () => {
    setVisibleCount((prev) => {
      const next = Math.min(prev + 3, questions.length);
      const targetQuestion = questions[Math.min(prev, questions.length - 1)];
      scrollTargetId.current = targetQuestion?.id ?? null;
      return next;
    });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (scrollTargetId.current !== null) {
      const target = questionRefs.current[scrollTargetId.current];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      scrollTargetId.current = null;
    }
  }, [visibleCount]);

  useEffect(() => {
    const completed = queuedSessions.filter(
      (session) => session.status === "ready" || session.status === "errored"
    );

    if (!completed.length) {
      return;
    }

    completed.forEach((session) => {
      if (session.status === "ready") {
        toaster.create({
          type: "success",
          title: "New quiz ready",
          description: "Tap to open the quiz.",
          action: {
            label: "Open",
            onClick: () => router.push(`/quiz?q=${session.token}`),
          },
        });
      } else {
        toaster.create({
          type: "error",
          title: "Quiz generation failed",
          description: session.failureReason ?? "Unknown error.",
        });
      }
    });

    setQueuedSessions((prev) =>
      prev.filter(
        (session) =>
          session.status !== "ready" && session.status !== "errored"
      )
    );
  }, [queuedSessions, router]);

  useEffect(() => {
    const pendingSessions = queuedSessions.filter(
      (session) => session.status === "pending"
    );
    if (!pendingSessions.length) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updates = await Promise.all(
          pendingSessions.map(async (session) => {
            const response = await fetch(
              `/api/sessions?token=${session.token}`
            );
            if (!response.ok) {
              return null;
            }
            const payload = await response.json();
            return {
              token: session.token,
              status: payload.status,
              failureReason: payload.failureReason ?? null,
            };
          })
        );

        setQueuedSessions((prev) =>
          prev.map((session) => {
            const update = updates.find((u) => u?.token === session.token);
            if (!update) {
              return session;
            }
            return {
              ...session,
              status: update.status,
              failureReason: update.failureReason,
            };
          })
        );
        pollErrorNotified.current = false;
      } catch {
        if (!pollErrorNotified.current) {
          pollErrorNotified.current = true;
          toaster.create({
            type: "error",
            title: "Queue unreachable",
            description: "We'll keep retrying automatically.",
          });
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [queuedSessions]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  const handleSubmitNewArticle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const submissionPromise = fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentToken: sessionToken,
          articleUrl: formUrl,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "Failed to queue article.");
        }
        return response.json();
      });

      toaster.promise(submissionPromise, {
        loading: {
          title: "Queuing your quiz…",
          description: "Please wait",
        },
        success: {
          title: "Quiz queued!",
          description: "You'll get a toast when it's ready.",
        },
        error: {
          title: "Failed to queue quiz.",
          description: "Please try again later.",
        },
      });

      const payload = await submissionPromise;

      setQueuedSessions((prev) => {
        if (prev.some((item) => item.token === payload.sessionToken)) {
          return prev;
        }
        return [
          ...prev,
          {
            token: payload.sessionToken,
            articleUrl: formUrl,
            status: payload.status ?? "pending",
          },
        ];
      });

      setShowForm(false);
      setFormUrl("");
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <section className="quiz-shell">
      <header className="quiz-header">
        <div>
          <p className="eyebrow">Quiz guided reading</p>
          <h1>Verify your intuition</h1>
          {articleTitle && <p className="article-title">{articleTitle}</p>}
          {articleUrl && (
            <a
              href={articleUrl}
              className="article-link"
              target="_blank"
              rel="noreferrer"
            >
              {articleUrl}
            </a>
          )}
        </div>
        <div className="progress-chip">{progress}</div>
      </header>

      {questions.length === 0 ? (
        <div className="empty-state">
          <p>No quiz ready yet. Check back once the worker finishes generating questions.</p>
        </div>
      ) : (
        <div className="questions-grid">
          {visibleQuestions.map((question) => (
            <div
              key={question.id}
              ref={(el) => {
                questionRefs.current[question.id] = el;
              }}
            >
              <QuestionCard
                question={question}
                articleUrl={articleUrl}
                selectedIndex={answers[question.id] ?? null}
                onSelect={(index) => handleSelect(question.id, index)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="actions-row">
        <div>
          {canShowMore && allVisibleAnswered && (
            <button
              type="button"
              className="load-more"
              onClick={handleShowMore}
            >
              More Quizzes
            </button>
          )}
        </div>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            if (!showForm) {
              setShowForm(true);
            }
          }}
        >
          Try another article
        </button>
      </div>

      {showForm && (
        <form
          className="inline-form"
          onSubmit={handleSubmitNewArticle}
          ref={formRef}
        >
          <label htmlFor="new-article-url">URL</label>
          <input
            id="new-article-url"
            type="url"
            required
            placeholder="https://example.com/article"
            value={formUrl}
            onChange={(event) => setFormUrl(event.target.value)}
          />
          <div className="inline-form-actions">
            <button type="submit" disabled={formLoading}>
              {formLoading ? "Queuing…" : "Start quiz"}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setShowForm(false);
                setFormUrl("");
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {formError && <p className="form-error">{formError}</p>}
        </form>
      )}
    </section>
  );
}
