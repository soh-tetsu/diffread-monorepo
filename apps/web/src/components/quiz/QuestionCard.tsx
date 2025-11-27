"use client";

import "./QuestionCard.css";
import { Float, Box, Text } from "@chakra-ui/react";
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
  return (
    <button
      type="button"
      className={[
        "option",
        isSelected ? "selected" : "",
        isSelected && isCorrect ? "correct" : "",
        isSelected && !isCorrect ? "wrong" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <span className="option-prefix">{String.fromCharCode(65 + index)}</span>
      <span className="option-text">{option.text}</span>
    </button>
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
    <article className="question-card">
      <header>
        <p className="question-meta">{question.category}</p>
        <h2>{question.prompt}</h2>
      </header>

      <div className="options">
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
      </div>

      {showFeedback && (
        <div
          className={[
            "feedback",
            isCorrect ? "success" : "danger",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className="feedback-title">
            {isCorrect ? "Nice! Your intuition matches the source." : "Not quite right."}
          </p>
          {selectedIndex !== null &&
            question.options[selectedIndex]?.rationale && (
              <p className="feedback-body">
                {question.options[selectedIndex]?.rationale}
              </p>
            )}
          <div className="feedback-links">
            {question.sourceLocation && articleUrl && (
              <a
                className="feedback-link"
                href={`${articleUrl}#:~:text=${encodeURIComponent(
                  question.sourceLocation.anchorText
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Jump to “{question.sourceLocation.anchorText}”
                {question.sourceLocation.estimatedParagraph
                  ? ` (para ${question.sourceLocation.estimatedParagraph})`
                  : ""}{" "}
                ↗
              </a>
            )}
          </div>
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
        </div>
      )}
    </article>
  );
}
