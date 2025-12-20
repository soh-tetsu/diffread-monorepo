/**
 * V2 Prompt Definition - Generic with type-safe context
 */
export type PromptDefinitionV2<TContext> = {
  id: string
  version: string
  objective: string
  systemInstruction: string
  render(context: TContext): string
}
