// It is designed to be run recursively for every block generated in Phase 2.
// This prompt asks the LLM to not just list atoms, but to link them (relates_to_atom_id). This creates the mini-graph inside the block immediately.
//
export const PROMPT_PHASE_3_TOULMIN_EXTRACTION = `
You are a Logic Engineer and Cognitive Scientist.
You are performing the "Atomic Extraction" phase on a specific segment of text.

### INPUT DATA DEFINITIONS
You will be provided with four specific inputs. Here is how to interpret them:
1. **Global Thesis**: The central claim of the entire document. Use this to determine if an atom supports the *local* argument or connects directly to the *main* argument.
2. **Block Role (Rhetoric)**: The intended function of this text block (e.g., "EVIDENCE", "REBUTTAL").
   - *Hint*: If the Role is "EVIDENCE", expect to find many "DATA" atoms. If "REBUTTAL", expect "COUNTER-CLAIMS".
3. **Active Threads**: The semantic themes (e.g., "History", "Math") active in this block. Use this to understand the context of ambiguous words.
4. **Block Text**: The raw content you must analyze.

### THE DEFINITIONS: TOULMIN LOGIC TYPES
Classify every atomic unit using these functional roles:
- **CLAIM**: A statement the author wants the reader to accept as true (the conclusion of a local argument).
- **DATA**: Specific facts, statistics, citations, or empirical evidence used to support a Claim.
- **WARRANT**: A statement explaining *why* the Data proves the Claim (the logical bridge/rule).
- **BACKING**: Evidence that supports the Warrant itself.
- **QUALIFIER**: A word or phrase that limits the scope of a claim (e.g., "usually," "under these conditions").
- **REBUTTAL**: A counter-argument or exception to a claim.

### YOUR TASK
1. **Deconstruct**: Break the **Block Text** into "Atomic Units" (irreducible propositions, usually sentences or independent clauses).
2. **Classify**: Assign a Toulmin Type to each atom.
3. **Link (The Logic Chain)**: Identify which *other* atom in this block this unit supports.
   - If Atom B (Data) supports Atom A (Claim), set B's target to A's ID.
   - If an atom supports the **Global Thesis** directly (skipping local claims), set target to "TARGET_GLOBAL_THESIS".
   - If an atom is a standalone statement with no clear parent in this block, set target to null.

### OUTPUT FORMAT
Return valid JSON only. An array of Atom objects.
IDs should be sequential relative to this block (e.g., "atom_1", "atom_2").

\`\`\`json
[
  {
    "id": "atom_1",
    "text": "The algorithm achieved 95% accuracy.",
    "toulmin_type": "DATA",
    "relates_to_target_id": "atom_2"
  },
  {
    "id": "atom_2",
    "text": "Our method is superior to previous approaches.",
    "toulmin_type": "CLAIM",
    "relates_to_target_id": "TARGET_GLOBAL_THESIS"
  }
]
\`\`\`

---
### ACTUAL INPUTS
**Global Thesis**:
"""{{MAIN_THESIS}}"""

**Block Role (Rhetoric)**:
{{BLOCK_RST_ROLE}}

**Active Threads**:
{{BLOCK_ACTIVE_THREADS}}

**Block Text**:
"""{{BLOCK_TEXT}}"""

`
