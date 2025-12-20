# Worker Queue System Tests

Comprehensive unit tests for the worker queue system refactoring.

## Overview

This test suite covers the complete worker pipeline with 5 main test files:

1. **process-result.test.ts** - Result type helper functions
2. **process-article.test.ts** - Article state machine and scraping
3. **process-quiz.test.ts** - Quiz container creation
4. **process-curiosity-quiz.test.ts** - Curiosity quiz creation
5. **process-session-coordinator.test.ts** - Orchestration and error propagation

## Setup

### Install Dependencies

First, install the required test dependencies:

```bash
cd apps/web
bun add -d vitest @vitest/ui @types/bun
```

### Add Test Scripts

Add these scripts to `apps/web/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

## Running Tests

### Run All Tests

```bash
bun run test
```

### Watch Mode (re-run on file changes)

```bash
bun run test:watch
```

### Interactive UI

```bash
bun run test:ui
```

### Generate Coverage Report

```bash
bun run test:coverage
```

### Run Specific Test File

```bash
bun run test process-result.test.ts
bun run test process-article.test.ts
bun run test process-quiz.test.ts
bun run test process-curiosity-quiz.test.ts
bun run test process-session-coordinator.test.ts
```

### Run Tests Matching Pattern

```bash
bun run test -t "article state machine"
bun run test -t "error handling"
```

## Test Structure

### process-result.test.ts

Tests the pure helper functions that create ProcessResult objects:

- **successResult()** - Creates success results
- **skippedResult()** - Creates skipped results (with optional error)
- **failedResult()** - Creates failed results (with required error)
- Type discrimination and validation

**Coverage:**
- All resource types (article, quiz, curiosityQuiz, generation)
- Status variations (success, skipped, failed)
- Error field presence/absence
- Runtime type discrimination

### process-article.test.ts

Tests the article processing pipeline including the state machine:

**Coverage:**
- Article creation via `ensure_article_exists` RPC
- State machine transitions:
  - `ready` (fresh) → skip scraping
  - `ready` (stale >30 days) → re-scrape
  - `pending` → scrape
  - `failed` → retry scraping
  - `skip_by_failure` → terminal, do nothing
- Claiming articles for scraping (atomic lock)
- Retry logic (maxAttempts: 2)
- Error handling:
  - `ArticleTerminalError` → mark failed
  - `ArticleRetryableError` → mark failed (for retry)
  - `ArticleInvalidStateError` → mark failed
  - Generic errors → mark failed
- RPC error handling
- Missing data validation

**Key Scenarios:**
- Fresh article: skip scraping, return immediately
- Stale article: claim and re-scrape
- Scraping failure: retry once, then fail
- Not claimable: another worker processing

### process-quiz.test.ts

Tests quiz container creation (stateless, simple create-if-absent):

**Coverage:**
- Quiz creation via `ensure_quiz_exists` RPC
- Returning existing quiz (idempotent)
- RPC error handling (database errors, empty response)
- Concurrency handling (multiple simultaneous requests)
- Unexpected errors and data format issues
- Structure validation (all required fields)
- Idempotency verification

**Key Scenarios:**
- New quiz: create and return
- Existing quiz: return without modification
- Concurrent requests: all get same quiz
- Database error: return failed result

### process-curiosity-quiz.test.ts

Tests curiosity quiz creation (upsert pattern, initialized with pending status):

**Coverage:**
- Curiosity quiz creation via `ensure_curiosity_quiz_exists` RPC
- Initial status: `pending`
- Null field initialization (questions, pedagogy, model_version, error_message)
- Retry count initialization: 0
- Status preservation from RPC
- RPC error handling
- Concurrency handling
- Different quiz inputs (multiple quizzes)
- Idempotency verification

**Key Scenarios:**
- New curiosity quiz: create with pending status
- Existing curiosity quiz: return as-is
- Different status values preserved
- Concurrent creation: all get same curiosity quiz

### process-session-coordinator.test.ts

Tests the orchestration of all worker steps:

**Coverage:**
- Full pipeline execution: article → quiz → curiosity quiz → generation
- Execution order validation
- Early termination on failure at any step
- Session status updates:
  - Article/quiz level errors → `updateSession()`
  - Generation level errors → `updateSessionStatus()`
  - Success → `updateSessionStatus(quiz.id, 'ready')`
- Result status handling:
  - `failed` → mark errored, stop pipeline
  - `skipped` → mark skip_by_failure, stop pipeline
  - `success` → continue to next step
- Missing data validation (article, quiz, curiosityQuiz)
- Dynamic import for generation (avoid circular deps)
- Unexpected exceptions at any step

**Key Scenarios:**
- Happy path: all steps succeed → session ready
- Article fails → mark errored, stop
- Article skipped → mark skip_by_failure, stop
- Quiz fails → mark errored, stop
- Curiosity quiz fails → mark errored, stop
- Generation fails → mark errored
- Generation skipped → mark skip_by_failure
- Exception thrown anywhere → mark errored

## Test Patterns and Conventions

### Mocking Strategy

**External Dependencies Mocked:**
- `@/lib/supabase` - Supabase client and RPC calls
- `@/lib/logger` - Logger (tslog)
- `@/lib/db/*` - Database access functions
- `@/lib/workflows/*` - Workflow orchestration
- `@/lib/workers/process-generation` - Generation worker (to avoid circular deps)

**What We DON'T Mock:**
- Pure functions (ProcessResult helpers, state determination)
- Type definitions
- Error classes

**Why:**
- Mock at boundaries (external services, database, APIs)
- Test real logic (state machines, orchestration, error handling)
- Keep mocks minimal and explicit

### Test Organization

Each test file follows this structure:

```typescript
describe('functionName', () => {
  // Mock setup
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    it('specific scenario', () => {
      // Arrange - set up mocks and data
      // Act - call function
      // Assert - verify behavior
    })
  })

  describe('error handling', () => {
    // Error scenarios
  })

  describe('edge cases', () => {
    // Boundary conditions
  })
})
```

### Assertion Style

We use explicit assertions with clear expectations:

```typescript
// Good: Explicit field checks
expect(result).toEqual({
  resourceType: 'article',
  resourceId: 123,
  status: 'success',
})

// Good: Verify specific behaviors
expect(updateSession).toHaveBeenCalledWith(session.id, { status: 'errored' })
expect(processQuiz).not.toHaveBeenCalled()

// Good: Type-safe assertions
const quiz = result.quiz as QuizRow
expect(quiz.id).toBe(200)
```

### Mock Verification

Always verify:
1. **Functions called** - Which functions were invoked
2. **Call order** - Execution sequence matters
3. **Arguments** - Correct data passed
4. **Not called** - Functions that should be skipped

```typescript
// Verify call order
expect(processArticle).toHaveBeenCalledWith(mockSession)
expect(processQuiz).toHaveBeenCalledWith(mockArticle)

// Verify not called on early termination
expect(processCuriosityQuiz).not.toHaveBeenCalled()
```

## Coverage Goals

Target coverage metrics:

- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

Key coverage areas:
- All status transitions in state machines
- All error paths (terminal, retryable, invalid)
- All RPC error handling
- All result status types (success, failed, skipped)
- Orchestration early termination paths

## Common Issues and Solutions

### Issue: Mock not working

**Problem:** Mock function not being called or returning undefined

**Solution:**
```typescript
// Ensure mock is set up before test runs
beforeEach(() => {
  vi.clearAllMocks()
})

// Verify mock is configured
vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [...], error: null })
```

### Issue: Type errors in tests

**Problem:** TypeScript complains about mock types

**Solution:**
```typescript
// Use type assertion for mocked functions
vi.mocked(processArticle).mockResolvedValueOnce(...)

// Cast result data when needed
const quiz = result.quiz as QuizRow
```

### Issue: Tests timing out

**Problem:** Async tests never complete

**Solution:**
```typescript
// Ensure all async operations are awaited
await processSession(mockSession)

// Check that mocks resolve (not hang)
vi.mocked(fn).mockResolvedValueOnce(...) // not mockResolvedValue()
```

### Issue: Flaky tests

**Problem:** Tests pass sometimes, fail others

**Solution:**
```typescript
// Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

// Use deterministic data (no Date.now(), Math.random())
const mockDate = '2024-01-01T00:00:00.000Z'
```

## Integration with CI/CD

Add to GitHub Actions workflow:

```yaml
- name: Run tests
  run: bun run test

- name: Generate coverage
  run: bun run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./apps/web/coverage/coverage-final.json
```

## Future Enhancements

Potential additions:

1. **Integration tests** - Test with real Supabase (local)
2. **E2E tests** - Full worker pipeline with test database
3. **Performance tests** - Measure retry timing, concurrency
4. **Snapshot tests** - Verify result structures don't change
5. **Property-based tests** - Generate random inputs (fast-check)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Diffread Architecture](../../../../../CLAUDE.md)
