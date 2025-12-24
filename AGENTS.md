# Commands
- `bun run dev` (apps/web) - Start dev server
- `bun run lint` - Check Biome linting
- `bun run lint:fix` - Auto-fix Biome issues
- `bun run test` - Run vitest tests
- `bun run test path/to/test.test.ts` - Run single test file
- `bun run test:watch` - Watch mode for tests

# Code Style
- **Formatting**: 2 spaces, 100 char line width, single quotes, semicolons as needed
- **Imports**: Use `@/*` path aliases; group external then internal imports
- **Types**: Strict mode enabled; prefer explicit types; custom error classes extend Error
- **Naming**: camelCase for variables/functions; PascalCase for components/classes; UPPER_SNAKE_CASE for constants
- **Error Handling**: Throw descriptive errors; use custom error classes; wrap with retry logic for transient failures
- **Patterns**: Separate functional core (pure logic) from imperative shell (side effects); constants in dedicated files
- **Testing**: Use vitest; tests in `**/*.test.ts` or `**/__tests__/**/*.test.ts`
