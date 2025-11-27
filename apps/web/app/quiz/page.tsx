"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Box, Heading, Text } from "@chakra-ui/react";
import { QuizView } from "@/components/quiz/QuizView";
import { normalizeHookQuestions } from "@/lib/quiz/normalize-hook-questions";
import type { HookStatus, QuizStatus } from "@/types/db";
import type { QuizQuestion } from "@/lib/quiz/normalize-question";

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

function QuizPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("q");
  const showInstructions = searchParams.get("show") === "instructions";

  // Fetch quiz metadata (session + article info)
  const { data: quizMeta, error: metaError } = useSWR<QuizMetaResponse>(
    token ? `/api/quiz?q=${token}` : null,
    fetcher
  );

  // Fetch hook questions
  const { data: hooksData, error: hooksError } = useSWR<HooksResponse>(
    token ? `/api/hooks?q=${token}` : null,
    fetcher
  );

  // Fetch instruction questions (only if session is ready or if user explicitly wants to see them)
  const { data: instructionsData } = useSWR<InstructionsResponse>(
    token && (quizMeta?.session.status === "ready" || showInstructions)
      ? `/api/instructions?q=${token}`
      : null,
    fetcher
  );

  if (!token) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading as="h1" size="xl" mb={3} color="gray.900">
            Missing session token
          </Heading>
          <Text color="gray.700">
            Use a link shared from Diffread that includes the <code>?q=token</code> parameter.
          </Text>
        </Box>
      </Box>
    );
  }

  // Handle loading state
  if (!quizMeta || !hooksData) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Text color="gray.700" fontSize="lg">
            Loading quiz…
          </Text>
        </Box>
      </Box>
    );
  }

  // Handle errors
  if (metaError || hooksError) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="720px"
          w="full"
          p={8}
          bg="white"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading as="h1" size="xl" mb={3} color="gray.900">
            Something went wrong.
          </Heading>
          <Text fontSize="md" color="fg.muted">
            {metaError?.message || hooksError?.message || "Unknown error."}
          </Text>
        </Box>
      </Box>
    );
  }

  // Handle failed hook generation
  if (hooksData.status === "failed" && hooksData.errorMessage) {
    return (
      <Box
        minH="100vh"
        bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
        py={8}
        px={4}
        display="flex"
        justifyContent="center"
        color="gray.900"
      >
        <Box
          maxW="450px"
          w="full"
          p={10}
          bg="white"
          borderWidth="1px"
          borderColor="red.200"
          borderRadius="2xl"
          textAlign="center"
          shadow="lg"
          alignSelf="flex-start"
          mt={8}
        >
          <Heading size="4xl">
            Quiz generation failed
          </Heading>
          <Text fontSize="md" color="fg.muted">
            {hooksData.errorMessage}
          </Text>
        </Box>
      </Box>
    );
  }

  // Normalize questions
  const hookQuestions = normalizeHookQuestions(hooksData.hooks);
  const questions = instructionsData?.questions || [];

  return (
    <Box
      as="main"
      id="quiz-top"
      minH="100vh"
      bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
      py={8}
      px={4}
      display="flex"
      justifyContent="center"
      color="gray.900"
    >
      <QuizView
        sessionToken={token}
        articleUrl={quizMeta.session.article_url}
        articleTitle={quizMeta.article?.metadata?.title ?? null}
        initialInstructionsVisible={showInstructions}
        hookQuestions={hookQuestions}
        hookStatus={hooksData.status}
        questions={questions}
      />
    </Box>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <Box
          minH="100vh"
          bg="radial-gradient(circle at top, #ffffff, #f4f7fb 70%)"
          py={8}
          px={4}
          display="flex"
          justifyContent="center"
          color="gray.900"
        >
          <Box
            maxW="720px"
            w="full"
            p={8}
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="2xl"
            textAlign="center"
            shadow="lg"
            alignSelf="flex-start"
            mt={8}
          >
            <Text color="gray.700" fontSize="lg">
              Loading quiz…
            </Text>
          </Box>
        </Box>
      }
    >
      <QuizPageContent />
    </Suspense>
  );
}
