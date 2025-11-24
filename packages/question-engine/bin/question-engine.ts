#!/usr/bin/env bun

import { config as loadEnv } from "dotenv";

import { generateQuizQuestions } from "../src/question-generator";

loadEnv();

type CliOptions = {
  url?: string;
  title?: string;
  model?: string;
};

function printUsage(): void {
  console.error(
    [
      "Usage: diffread-question-engine --url <normalized_url> [--title \"Article title\"]",
      "",
      "Environment:",
      "  GEMINI_API_KEY   Google Generative AI key (required)",
      "  GEMINI_MODEL     Optional model override (defaults to gemini-1.5-flash)",
    ].join("\n")
  );
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--url" && i + 1 < argv.length) {
      opts.url = argv[i + 1];
      i += 1;
    } else if (current === "--title" && i + 1 < argv.length) {
      opts.title = argv[i + 1];
      i += 1;
    } else if (current === "--model" && i + 1 < argv.length) {
      opts.model = argv[i + 1];
      i += 1;
    } else if (current === "--help") {
      printUsage();
      process.exit(0);
    }
  }

  return opts;
}

function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return Promise.resolve("");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    process.stdin.on("error", reject);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (!args.url) {
    printUsage();
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY in environment.");
    process.exit(1);
  }

  const articleText = (await readStdin()).trim();
  if (!articleText) {
    console.error(
      "No article text provided. Pipe the article body via STDIN (e.g., curl ... | diffread-question-engine --url ...)."
    );
    process.exit(1);
  }

  const workflow = await generateQuizQuestions(
    {
      normalizedUrl: args.url,
      title: args.title ?? null,
      text: articleText,
      metadata: null,
    },
    { apiKey, model: args.model ?? process.env.GEMINI_MODEL }
  );

  console.log(JSON.stringify(workflow, null, 2));
}

main().catch((error) => {
  console.error("Question generation failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
