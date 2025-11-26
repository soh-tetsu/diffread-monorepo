"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { QuizQuestion } from "@/lib/quiz/normalize-question";
import { trackQuizSelection } from "@/lib/analytics/client";
import { toaster } from "@/components/ui/toaster";

import type { HookStatus } from "@/types/db";

type Props = {
  sessionToken: string;
  articleUrl?: string | null;
  articleTitle?: string | null;
  hookQuestions: QuizQuestion[];
  hookStatus: HookStatus | null;
  questions: QuizQuestion[];
};

export function QuizView({
  sessionToken,
  articleUrl,
  articleTitle,
  hookQuestions,
  hookStatus,
  initialInstructionsVisible = false,
  questions,
}: Props) {
  const router = useRouter();
  const [hookAnswers, setHookAnswers] = useState<Record<number, number | null>>({});
  const [instructionAnswers, setInstructionAnswers] = useState<Record<number, number | null>>({});
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [requestingInstructions, setRequestingInstructions] = useState(false);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const CHUNK_SIZE = 3;
  const [visibleHookCount, setVisibleHookCount] = useState(() =>
    Math.min(CHUNK_SIZE, hookQuestions.length)
  );
  const [visibleInstructionCount, setVisibleInstructionCount] = useState(() =>
    Math.min(CHUNK_SIZE, questions.length)
  );
  const [instructionsVisible, setInstructionsVisible] = useState(
    initialInstructionsVisible && questions.length > 0
  );

  const hookAnswered = useMemo(
    () => Object.values(hookAnswers).filter((value) => value !== null && value !== undefined).length,
    [hookAnswers]
  );

  const instructionAnswered = useMemo(
    () =>
      Object.values(instructionAnswers).filter(
        (value) => value !== null && value !== undefined
      ).length,
    [instructionAnswers]
  );

  useEffect(() => {
    if (initialInstructionsVisible && questions.length > 0) {
      setInstructionsVisible(true);
      setVisibleInstructionCount(Math.min(CHUNK_SIZE, questions.length));
    }
  }, [initialInstructionsVisible, questions.length]);

  useEffect(() => {
    setVisibleHookCount(Math.min(CHUNK_SIZE, hookQuestions.length));
  }, [hookQuestions.length]);

  useEffect(() => {
    setVisibleInstructionCount(Math.min(CHUNK_SIZE, questions.length));
  }, [questions.length]);

  const progress = useMemo(() => {
    if (instructionsVisible && questions.length > 0) {
      return `${instructionAnswered}/${questions.length} instruction answered`;
    }
    if (hookQuestions.length > 0) {
      return `${hookAnswered}/${hookQuestions.length} hook answered`;
    }
    return "0 answered";
  }, [
    hookAnswered,
    hookQuestions.length,
    instructionAnswered,
    questions.length,
    instructionsVisible,
  ]);

  const handleHookSelect = (questionId: number, optionIndex: number) => {
    setHookAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    const question = hookQuestions.find((q) => q.id === questionId);
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

  const handleInstructionSelect = (questionId: number, optionIndex: number) => {
    setInstructionAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
      const submissionPromise = fetch("/api/hooks", {
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
          throw new Error(payload.message || "Failed to register article.");
        }
        return response.json();
      });

      toaster.promise(submissionPromise, {
        loading: {
          title: "Analyzing hooks…",
          description: "This usually takes a few seconds.",
        },
        success: {
          title: "Hook quiz ready!",
          description: "Opening the quiz now.",
        },
        error: {
          title: "Hook generation failed",
          description: "Please try again later.",
        },
      });

      const payload = await submissionPromise;

      setShowForm(false);
      setFormUrl("");
      setFormError(null);
      router.push(`/quiz?q=${payload.sessionToken}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setFormLoading(false);
    }
  };

  const handleRequestInstructions = async () => {
    if (!articleUrl) {
      setInstructionsError("Missing article URL for this quiz.");
      return;
    }
    setInstructionsError(null);

    const enableInstructionView = () => {
      setInstructionsVisible(true);
      setVisibleInstructionCount(Math.min(CHUNK_SIZE, Math.max(questions.length, CHUNK_SIZE)));
      const params = new URLSearchParams();
      params.set("q", sessionToken);
      params.set("show", "instructions");
      router.replace(`/quiz?${params.toString()}`, { scroll: false });
    };

    if (questions.length > 0) {
      enableInstructionView();
      return;
    }

    setRequestingInstructions(true);
    try {
      const instructionPromise = (async () => {
        const response = await fetch("/api/instructions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentToken: sessionToken,
            articleUrl,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || "Failed to generate instructions.");
        }

        // Poll session status until instructions are ready (or errored).
        const maxAttempts = 20;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const statusResponse = await fetch(
            `/api/instructions?token=${sessionToken}`
          );
          if (statusResponse.ok) {
            const payload = await statusResponse.json();
            if (payload.status === "ready") {
              return payload;
            }
            if (payload.status === "errored") {
              throw new Error(
                payload.failureReason || "Instruction generation failed."
              );
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        throw new Error(
          "Instructions are taking longer than expected. Please check back shortly."
        );
      })();

      await toaster.promise(instructionPromise, {
        loading: {
          title: "Generating deeper quiz…",
          description: "Sit tight while we prepare more questions.",
        },
        success: {
          title: "Instruction quiz ready!",
          description: "Refreshing with new questions.",
        },
        error: {
          title: "Instruction generation failed",
          description: "Please try again later.",
        },
      });

      enableInstructionView();
      router.refresh();
    } catch (error) {
      setInstructionsError(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setRequestingInstructions(false);
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

      <section className="hook-section">
        <h2>Hook Questions</h2>
      {hookQuestions.length === 0 ? (
        <div className="empty-state">
          <p>
            {hookStatus === "pending"
              ? "Hooks are still generating. Refresh in a few seconds."
              : "No hook questions available for this quiz."}
          </p>
        </div>
      ) : (
        <div className="questions-grid">
          {hookQuestions.slice(0, visibleHookCount).map((question) => (
            <div
              key={`hook-${question.id}`}
              ref={(el) => {
                questionRefs.current[question.id] = el;
              }}
            >
              <QuestionCard
                question={question}
                articleUrl={articleUrl}
                selectedIndex={hookAnswers[question.id] ?? null}
                onSelect={(index) => handleHookSelect(question.id, index)}
              />
            </div>
          ))}
          {visibleHookCount < hookQuestions.length && (
            <button
              type="button"
              className="load-more subtle"
              onClick={() =>
                setVisibleHookCount((prev) =>
                  Math.min(prev + CHUNK_SIZE, hookQuestions.length)
                )
              }
            >
              More hook quizzes
            </button>
          )}
        </div>
      )}
      </section>

      <section className="instruction-section">
        <div className="instruction-header">
          <h2>Instruction Questions</h2>
          {instructionsVisible && questions.length > 0 && (
            <span className="chip">
              {instructionAnswered}/{questions.length} answered
            </span>
          )}
        </div>
        {instructionsVisible && questions.length > 0 ? (
          <div className="questions-grid">
            {questions.slice(0, visibleInstructionCount).map((question) => (
              <div
                key={`instruction-${question.id}`}
                ref={(el) => {
                  questionRefs.current[question.id] = el;
                }}
              >
                <QuestionCard
                  question={question}
                  articleUrl={articleUrl}
                  selectedIndex={instructionAnswers[question.id] ?? null}
                  onSelect={(index) =>
                    handleInstructionSelect(question.id, index)
                  }
                />
              </div>
            ))}
            {visibleInstructionCount < questions.length && (
              <button
                type="button"
                className="load-more subtle"
                onClick={() =>
                  setVisibleInstructionCount((prev) =>
                    Math.min(prev + CHUNK_SIZE, questions.length)
                  )
                }
              >
                More instruction quizzes
              </button>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <p>
              {questions.length > 0
                ? "Instruction questions are hidden until you opt in."
                : "Ready for a deeper quiz? Generate instruction questions."}
            </p>
            <button
              type="button"
              className="load-more"
              disabled={requestingInstructions || !articleUrl}
              onClick={handleRequestInstructions}
            >
              {requestingInstructions ? "Generating…" : "More Quizzes"}
            </button>
            {instructionsError && <p className="form-error">{instructionsError}</p>}
          </div>
        )}
      </section>

      <div className="actions-row">
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
