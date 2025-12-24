# Question Engine Test Script

Local testing tool for question-engine prompts. Loads API keys from `.env.local` and executes prompts with real Gemini API.

## Setup

1. **Create `.env.local` in the package root:**

```bash
cd packages/question-engine
cat > .env.local << EOF
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.0-flash
EOF
```

Or in the root directory:
```bash
cat > .env.local << EOF
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.0-flash
EOF
```

2. **Install dependencies** (if not already done):
```bash
bun install
```

## Usage

### Test Analysis Prompt Only

Extract metadata (archetype, domain, thesis, pedagogy) from article text:

```bash
bun scripts/test-prompt.ts analysis --text "The quick brown fox jumps over the lazy dog..."
```

### Test Hook Generator Prompt Only

Generate 3 hook questions using article metadata:

```bash
# First, get metadata from analysis (or manually provide)
bun scripts/test-prompt.ts hook --metadata '{
  "archetype": { "label": "CONCEPTUAL" },
  "domain": { "primary": "literature" },
  "pedagogy": { "hooks": ["What is symbolism?"] }
}'
```

### Test Full Curiosity Workflow

Run complete workflow: analysis → hook generation → combined result:

```bash
bun scripts/test-prompt.ts curiosity --text "article content here..."
```

## Examples

### Example 1: Analyze a Real Article

```bash
bun scripts/test-prompt.ts analysis --text "$(cat /path/to/article.md)"
```

### Example 2: Test with Sample Text

```bash
bun scripts/test-prompt.ts curiosity --text "
Climate change refers to long-term shifts in temperatures and weather patterns.
These shifts may be natural, such as through variations in the solar cycle.
But since the 1800s, human activities have been the main driver of climate change,
primarily due to the burning of fossil fuels like coal, oil and gas.
"
```

### Example 3: Pretty Print Full Workflow Output

```bash
bun scripts/test-prompt.ts curiosity --text "Your article text..." | jq .
```

## Output

Responses are printed as JSON for easy inspection:

```json
{
  "rationale": "The article discusses climate science fundamentals...",
  "metadata": {
    "archetype": {
      "label": "CONCEPTUAL"
    },
    "domain": {
      "primary": "science",
      "secondary": "climatology"
    },
    "pedagogy": {
      "hooks": ["What causes climate change?", "How do we measure climate?"]
    }
  }
}
```

## Troubleshooting

### "GEMINI_API_KEY not found"

Ensure `.env.local` exists and contains `GEMINI_API_KEY=your-key`:

```bash
# Check file exists
ls -la .env.local

# Check it has the key
cat .env.local | grep GEMINI_API_KEY
```

### "Model not found"

Ensure the model name in `.env.local` is valid:
- `gemini-2.0-flash` (recommended, latest)
- `gemini-1.5-flash`
- `gemini-1.5-pro`

### Script Timeout

Increase the timeout if running on slower connection:

```bash
timeout 120 bun scripts/test-prompt.ts curiosity --text "..."
```

## Development Tips

- **Update prompts**: Edit `src/prompts/v2/curiosity/analysis.ts` or `hook-generator.ts`
- **Change model**: Update `GEMINI_MODEL` in `.env.local`
- **Debug responses**: Pipe to `jq` for pretty printing: `... | jq .`
- **Save output**: Redirect to file: `... > output.json`

## Next Steps

Once testing is working, you can:

1. **Test scaffold prompts** (when implemented):
   ```bash
   bun scripts/test-prompt.ts build-rst --text "..."
   bun scripts/test-prompt.ts extract-threads --text "..."
   bun scripts/test-prompt.ts extract-toulmin --text "..."
   ```

2. **Modify prompts** in `src/prompts/v2/` and re-run tests

3. **Integrate into CI/CD** for automated testing
