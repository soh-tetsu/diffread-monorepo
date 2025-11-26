const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
const HOOK_DEFAULT = "gemini-2.5-flash-lite";

export const GEMINI_ANALYSIS_MODEL =
  process.env.GEMINI_ANALYSIS_MODEL ?? DEFAULT_MODEL ?? HOOK_DEFAULT;
export const GEMINI_HOOK_MODEL =
  process.env.GEMINI_HOOK_MODEL ?? DEFAULT_MODEL ?? HOOK_DEFAULT;
export const GEMINI_INSTRUCTION_MODEL = DEFAULT_MODEL;

export function requireGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for Gemini integration.");
  }
  return apiKey;
}
