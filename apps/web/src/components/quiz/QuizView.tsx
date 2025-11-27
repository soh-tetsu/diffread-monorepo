"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionCard } from "@/components/quiz/QuestionCard";
import { QuizQuestion } from "@/lib/quiz/normalize-question";
import { trackQuizSelection } from "@/lib/analytics/client";
import { toaster } from "@/components/ui/toaster";
import { Button, Box, Flex, Heading, Text, Link, Badge } from "@chakra-ui/react";

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
          let errorMessage = payload.message || "Failed to register article.";

          // Try to parse nested error object if message contains JSON
          try {
            const parsed = JSON.parse(errorMessage);
            if (parsed.error && parsed.error.message) {
              errorMessage = parsed.error.message;
            }
          } catch {
            // Not JSON, use original message
          }

          throw new Error(errorMessage);
        }
        return response.json();
      });

      try {
        let toastId: string | undefined;

        toaster.promise(submissionPromise, {
          loading: {
            title: "Analyzing quizzes…",
            description: "This usually takes a few seconds.",
          },
          success: (data) => {
            const quizUrl = `/quiz?q=${data.sessionToken}`;

            // Create a toast with custom behavior
            setTimeout(() => {
              toastId = toaster.create({
                title: "Quiz ready!",
                description: "Click anywhere to open in new tab",
                type: "success",
                duration: Infinity,
                closable: true,
                onStatusChange: (details) => {
                  if (details.status === 'visible') {
                    setTimeout(() => {
                      // Find the toast element
                      const toastElements = document.querySelectorAll('[role="status"]');
                      const toastEl = Array.from(toastElements).find(el =>
                        el.textContent?.includes("Quiz ready!")
                      );

                      if (toastEl) {
                        // Style the toast to look clickable
                        (toastEl as HTMLElement).style.cursor = 'pointer';

                        // Add click handler
                        const clickHandler = (e: Event) => {
                          const target = e.target as HTMLElement;
                          // Don't trigger if clicking close button
                          if (!target.closest('[data-part="close-trigger"]')) {
                            window.open(quizUrl, '_blank');
                            if (toastId) toaster.dismiss(toastId);
                          }
                        };

                        toastEl.addEventListener('click', clickHandler, { once: true });
                      }
                    }, 50);
                  }
                },
              });
            }, 0);

            // Return null to prevent default success toast
            return null as any;
          },
          error: (error) => ({
            title: "Quiz generation failed",
            description: error instanceof Error ? error.message : "Please try again later.",
            closable: true,
          }),
        });

        const payload = await submissionPromise;

        setShowForm(false);
        setFormUrl("");
        setFormError(null);
        // Don't auto-navigate, let user click the toast
      } catch (error) {
        // Promise errors are already shown in toast by toaster.promise()
        // This catch is just to prevent unhandled promise rejection
      }
    } catch (error) {
      // Catch any unexpected errors outside the promise flow
      toaster.create({
        title: "Unexpected error",
        description: error instanceof Error ? error.message : "Something went wrong.",
        type: "error",
        duration: Infinity,
        closable: true,
      });
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
          let errorMessage = payload.message || "Failed to generate instructions.";

          // Try to parse nested error object if message contains JSON
          try {
            const parsed = JSON.parse(errorMessage);
            if (parsed.error && parsed.error.message) {
              errorMessage = parsed.error.message;
            }
          } catch {
            // Not JSON, use original message
          }

          throw new Error(errorMessage);
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

      try {
        toaster.promise(instructionPromise, {
          loading: {
            title: "Generating more quizzes…",
            description: "Sit tight while we prepare more questions.",
          },
          success: {
            title: "More quizzes ready!",
            description: "Refreshing with new questions.",
            duration: Infinity,
            closable: true,
          },
          error: (error) => ({
            title: "More quiz generation failed",
            description: error instanceof Error ? error.message : "Please try again later.",
            closable: true,
          }),
        });

        await instructionPromise;

        enableInstructionView();
        router.refresh();
      } catch (error) {
        // Promise errors are already shown in toast by toaster.promise()
        // This catch is just to prevent unhandled promise rejection
      }
    } catch (error) {
      // Catch any unexpected errors outside the promise flow
      toaster.create({
        title: "Unexpected error",
        description: error instanceof Error ? error.message : "Something went wrong.",
        type: "error",
        duration: Infinity,
        closable: true,
      });
    } finally {
      setRequestingInstructions(false);
    }
  };

  return (
    <section className="quiz-shell">
      <Flex
        as="header"
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align="flex-start"
        gap={4}
        p={6}
        borderRadius="2xl"
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
      >
        <Box flex="1">
          <Text
            textTransform="uppercase"
            letterSpacing="wider"
            fontSize="xs"
            color="gray.500"
            mb={2}
          >
            Quiz guided reading
          </Text>
          <Heading
            size="6xl"
          >
            {articleTitle || "Verify your intuition"}
          </Heading>
          {articleUrl && (
            <Link
              href={articleUrl}
              color="blue.600"
              fontSize="sm"
              wordBreak="break-all"
              target="_blank"
              rel="noreferrer"
            >
              Oringial Article
            </Link>
          )}
        </Box>
        <Badge
          px={4}
          py={2.5}
          borderRadius="full"
          borderWidth="1px"
          borderColor="gray.200"
          fontSize="sm"
          colorPalette="gray"
          variant="outline"
          alignSelf={{ base: "stretch", md: "flex-start" }}
          textAlign={{ base: "center", md: "left" }}
        >
          {progress}
        </Badge>
      </Flex>

      <section className="questions-section">
        {hookQuestions.length === 0 && questions.length === 0 ? (
          <div className="empty-state">
            <p>
              {hookStatus === "pending"
                ? "Questions are still generating. Refresh in a few seconds."
                : "No questions available for this quiz."}
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
            {instructionsVisible && questions.length > 0 && questions.slice(0, visibleInstructionCount).map((question) => (
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
            {(() => {
              // Determine if we can load more hook questions
              const canLoadMoreHooks = visibleHookCount < hookQuestions.length;
              // Determine if we can load more instruction questions
              const canLoadMoreInstructions = instructionsVisible && visibleInstructionCount < questions.length;
              // Check if instructions need to be generated or shown
              const needMoreQuestions = !instructionsVisible;

              let buttonLabel = "That's all";
              let buttonDisabled = true;
              let buttonOnClick = () => { };

              if (requestingInstructions) {
                buttonLabel = "Generating…";
                buttonDisabled = true;
              } else if (canLoadMoreHooks) {
                buttonLabel = "Load more";
                buttonDisabled = false;
                buttonOnClick = () => setVisibleHookCount((prev) => Math.min(prev + CHUNK_SIZE, hookQuestions.length));
              } else if (canLoadMoreInstructions) {
                buttonLabel = "Load more";
                buttonDisabled = false;
                buttonOnClick = () => setVisibleInstructionCount((prev) => Math.min(prev + CHUNK_SIZE, questions.length));
              } else if (needMoreQuestions) {
                buttonLabel = "More Quizzes";
                buttonDisabled = !articleUrl;
                buttonOnClick = handleRequestInstructions;
              }

              return (
                <Button
                  type="button"
                  variant="subtle"
                  disabled={buttonDisabled}
                  onClick={buttonOnClick}
                  width="100%"
                >
                  {buttonLabel}
                </Button>
              );
            })()}
          </div>
        )}
      </section>

      <div className="actions-row" style={{ marginTop: '2rem' }}>
        <Button
          type="button"
          colorPalette="teal"
          onClick={() => {
            if (!showForm) {
              setShowForm(true);
            }
          }}
        >
          Try another article
        </Button>
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
            <Button type="submit" disabled={formLoading} colorPalette="teal">
              {formLoading ? "Queuing…" : "Start quiz"}
            </Button>
            <Button
              type="button"
              colorPalette="teal"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setFormUrl("");
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {formError && <p className="form-error">{formError}</p>}
        </form>
      )}
    </section>
  );
}
