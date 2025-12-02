
```
packages/question-engine/src/
├── prompts/
│   ├── v2/                          # New V2 prompts (isolated from v1)
│   │   ├── analysis.ts              # Analysis prompt definition
│   │   ├── hook-generator.ts        # Hook generator prompt definition
│   │   └── types.ts                 # V2-specific types
│   ├── executor.ts                  # PromptExecutor class (NEW)
│   ├── pipeline.ts                  # Pipeline class + step types (NEW)
│   └── types.ts                     # Base PromptDefinition
│
├── workflows/
│   ├── hook-workflow-v2.ts          # V2 workflow using pipeline (NEW)
│   ├── steps/                       # Reusable step definitions (NEW)
│   │   ├── analysis-steps.ts
│   │   ├── hook-generation-steps.ts
│   │   └── notification-steps.ts
│   └── types.ts                     # Workflow-specific types
│
├── lib/
│   ├── notifier.ts                  # Notifier class (NEW)
│   └── db-client.ts                 # Database client interface (NEW)
│
└── types.ts                         # Shared types (extend existing)
```
