/**
 * V2 Scaffold Quiz Prompts
 *
 * Scaffold quizzes provide deep-dive learning questions.
 * Created on-demand after curiosity quiz is complete.
 *
 * Prompts use a multi-stage workflow:
 * 1. build-rst: Generate RST document structure
 * 2. extract-threads: Extract key conceptual threads
 * 3. extract-toulmin: Extract logical arguments
 * (These feed into instruction question generation)
 */

export { PROMPT_PHASE_2_MATRIX_SEGMENTATION } from './build-rst'
export { PROMPT_PHASE_1_EXTRACT_THREADS } from './extract-threads'
export { PROMPT_PHASE_3_TOULMIN_EXTRACTION } from './extract-toulmin'
