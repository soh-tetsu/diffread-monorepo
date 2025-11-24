import type { QuizArticleInput } from "../types";

export function buildArticleContext(article: QuizArticleInput): string {
  const lines: string[] = [`Article URL: ${article.normalizedUrl}`];

  if (article.title) {
    lines.push(`Title: ${article.title}`);
  }

  if (article.metadata && typeof article.metadata === "object") {
    const metadata = article.metadata as Record<string, unknown>;
    const excerpt = metadata["excerpt"];
    if (typeof excerpt === "string" && excerpt.trim().length > 0) {
      lines.push(`Excerpt: ${excerpt.trim()}`);
    }
  }

  return lines.join("\n");
}
