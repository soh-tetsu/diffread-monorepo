"use client";

import { Float, Box, Text, Button, Stack, VStack, Flex, Link } from "@chakra-ui/react";
import { Blockquote, BlockquoteIcon } from "@/components/ui/blockquote";
import { QuizOption, QuizQuestion } from "@/lib/quiz/normalize-question";

type Props = {
  question: QuizQuestion;
  selectedIndex: number | null;
  articleUrl?: string | null;
  onSelect: (optionIndex: number) => void;
};

function OptionButton({
  option,
  index,
  isSelected,
  isCorrect,
  onClick,
}: {
  option: QuizOption;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  onClick: () => void;
}) {
  const getBorderColor = () => {
    if (isSelected && isCorrect) return "blue.500";
    if (isSelected && !isCorrect) return "red.500";
    return "gray.200";
  };

  const getBgColor = () => {
    if (isSelected && isCorrect) return "blue.50";
    if (isSelected && !isCorrect) return "red.50";
    return "gray.50";
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      justifyContent="flex-start"
      height="auto"
      py={3}
      px={4}
      borderColor={getBorderColor()}
      bg={getBgColor()}
      borderWidth="1px"
      borderRadius="xl"
      _hover={{
        borderColor: isSelected ? undefined : "blue.500",
        shadow: isSelected ? undefined : "0 8px 20px rgba(37, 99, 235, 0.08)",
      }}
      cursor="pointer"
      textAlign="left"
      whiteSpace="normal"
      display="flex"
      gap={3}
      alignItems="center"
    >
      <Flex
        width="32px"
        height="32px"
        borderRadius="full"
        borderWidth="1px"
        borderColor="gray.200"
        alignItems="center"
        justifyContent="center"
        fontWeight="semibold"
        bg="white"
        flexShrink={0}
      >
        {String.fromCharCode(65 + index)}
      </Flex>
      <Text fontSize="md" color="gray.900">
        {option.text}
      </Text>
    </Button>
  );
}

export function QuestionCard({
  question,
  selectedIndex,
  articleUrl,
  onSelect,
}: Props) {
  const showFeedback = selectedIndex !== null;
  const isCorrect = selectedIndex === question.answerIndex;

  return (
    <Box
      as="article"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      shadow="0 15px 35px rgba(15, 23, 42, 0.08)"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
    >
      <VStack align="stretch" gap={{ base: 3, md: 4 }}>
        {/* Header */}
        <Box as="header">
          <Text fontSize="sm" color="gray.500" mb={1}>
            {question.category}
          </Text>
          <Text
            as="h2"
            fontSize={{ base: "lg", md: "xl" }}
            fontWeight="semibold"
            mt={2}
          >
            {question.prompt}
          </Text>
        </Box>

        {/* Options */}
        <Stack gap={{ base: 2, md: 3 }}>
          {question.options.map((option, idx) => (
            <OptionButton
              key={idx}
              option={option}
              index={idx}
              isSelected={selectedIndex === idx}
              isCorrect={question.answerIndex === idx}
              onClick={() => onSelect(idx)}
            />
          ))}
        </Stack>

        {/* Feedback */}
        {showFeedback && (
          <Box
            borderRadius="2xl"
            p={{ base: 3, md: 4 }}
            borderWidth="1px"
            borderColor={isCorrect ? "blue.200" : "red.300"}
            bg={isCorrect ? "blue.50" : "red.50"}
          >
            <Text fontWeight="semibold" color="gray.900" mb={2}>
              {isCorrect ? "Nice! Your intuition matches the source." : "Not quite right."}
            </Text>

            {selectedIndex !== null && question.options[selectedIndex]?.rationale && (
              <Text color="gray.900" lineHeight="1.5" mt={2}>
                {question.options[selectedIndex]?.rationale}
              </Text>
            )}

            {question.sourceLocation && articleUrl && (
              <Link
                href={`${articleUrl}#:~:text=${encodeURIComponent(
                  question.sourceLocation.anchorText
                )}`}
                target="_blank"
                rel="noreferrer"
                color="blue.600"
                display="inline-block"
                mt={3}
              >
                Jump to "{question.sourceLocation.anchorText}"
                {question.sourceLocation.estimatedParagraph
                  ? ` (para ${question.sourceLocation.estimatedParagraph})`
                  : ""}{" "}
                ↗
              </Link>
            )}

            {question.relevantContext && (
              <Box mt={4}>
                <Blockquote variant="plain" colorPalette="teal" showDash icon={
                  <Float placement="top-start" offsetY="2">
                    <BlockquoteIcon />
                  </Float>
                }>
                  <Text
                    textTransform="uppercase"
                    fontSize="xs"
                    letterSpacing="0.2em"
                    color="teal.600"
                    mb={2}
                  >
                    From the article
                  </Text>
                  <Text color="gray.700" fontStyle="italic">
                    {question.relevantContext}
                  </Text>
                </Blockquote>
              </Box>
            )}

            {question.remediationPointer && (
              <Box mt={4}>
                <Blockquote variant="plain" colorPalette="teal" showDash icon={
                  <Float placement="top-start" offsetY="2">
                    <BlockquoteIcon />
                  </Float>
                }>
                  <Text
                    textTransform="uppercase"
                    fontSize="xs"
                    letterSpacing="0.2em"
                    color="teal.600"
                    mb={2}
                  >
                    From the article
                  </Text>
                  <Text color="gray.700" fontStyle="italic">
                    {question.remediationPointer}
                  </Text>
                </Blockquote>
              </Box>
            )}
          </Box>
        )}
      </VStack>
    </Box>
  );
}
