# Theory

* Rhetorical Structure Theory (RST)
  - https://gucorpling.org/erst/
* Toulmin Model

**The Toulmin Model**: This model breaks an argument into core parts. Every argument starts with a *claim* (the conclusion). This claim is supported by *grounds* (evidence or data). The *warrant* is the often-unstated assumption that logically connects the grounds to the claim. For example, in the argument "It rained (grounds), so the grass is wet (claim)," the warrant is "Rain makes things wet." Three other components add nuance: *backing* supports the warrant, the *qualifier* (e.g., "probably") limits the claim's strength, and the *rebuttal* acknowledges exceptions. This model is excellent for probing the strength of a specific argument's logic.

**Rhetorical Structure Theory (RST)**: Rather than judging logic, RST describes how a text is built. It assumes a text is coherent when each part has a clear function relative to others. The theory analyzes texts by identifying *rhetorical relations* (like Evidence, Contrast, Elaboration) between spans of text. A key concept is ***nuclearity***: in a relation like Evidence, the **nucleus** (the claim) is central, while the **satellite** (the supporting evidence) is secondary. These relations build recursively into a hierarchical tree that covers the entire text, explaining its overall organization and flow. As you learned earlier, modern adaptations like Enhanced RST (eRST) have made this framework more flexible for analyzing complex texts.

Comparision Table

| Feature | **Toulmin Model** | **Rhetorical Structure Theory (RST)** |
| :--- | :--- | :--- |
| **Level of analysis** | Micro-level. The internal logic, structure, and strength of a single, specific argument. It breaks an argument down into its core components (claim, grounds, warrant, etc.) to examine its validity. | Macro-level. The overall organization and coherence of an entire text or discourse. It maps how different parts of a text (paragraphs, sections) relate to each other to form a unified whole for the reader. |
| **Primary Focus** | Validity and strength of a single **argument**. | Coherence and functional organization of an entire **text**. |
| **Analytical Unit** | A **claim** and its supporting components (grounds, warrant, etc.). | **Spans of text** (sentences, clauses) connected by rhetorical relations. |
| **Core Structure** | A set of six components working to justify a claim. | A hierarchical tree of **nucleus-satellite** and multinuclear relations. |
| **Main Purpose** | To analyze, construct, and test the soundness of an argument. | To describe how parts of a text work together to create a unified whole for the reader. |
| **Typical Application** | Debate, legal reasoning, persuasive essays, argument critique. | Discourse analysis, text summarization, natural language processing. |


# The Correction:
Atomics must link Laterally and Globally.
Local Link (Upward): Atom A (Data) → → belongs to → → RST Block 1 (Evidence).
Global Link (The Scaffold): Atom A (Data) → → supports → → The Main Thesis Node (which sits at the root).
Lateral Link (The Braid): Atom A (Data in History Block) → → contradicts → → Atom B (Claim in Method Block).

# Your Final Graph Topology
If you code this, your graph database (Neo4j / NetworkX) schema should look exactly like this:
1. NODES
  * Type: THESIS (The Root)
  * Type: BLOCK (The RST Containers)
  * Type: ATOM (The Content)

2. ATTRIBUTES (The Metadata)
  * BLOCK.Topic = "History" (The Color)
  * BLOCK.RST_Role = "Background"

3. EDGES (The Structure)
  * CONTAINS: Block → → Atom (The Hierarchy)
  * NEXT: Block → → Block (The Narrative Spine)
  * SUPPORTS/ATTACKS: Atom → → Atom/Thesis (The Logical DAG)

# Verdict
This is a solid architecture. It avoids "Unknown Unknowns" because:
1. Topics ensure you don't miss sub-plots.
2. RST ensures you know the author's intent.
3. Toulmin ensures you verify the logic.
4. Mismatches between these layers reveal the hidden gaps in the paper.
