#!/usr/bin/env node

/**
 * Test script for question-engine prompts
 *
 * Usage:
 *   bun scripts/test-prompt.ts curiosity --text "article content here"
 *   bun scripts/test-prompt.ts analysis --text "article content here"
 *   bun scripts/test-prompt.ts hook --metadata '{"archetype":"CONCEPTUAL",...}'
 *
 * Loads API key from .env.local
 */

import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  AnalysisResponseSchema,
  analysisPromptV2,
  CuriosityGeneratorV2ResponseSchema,
  createLLMClient,
  curiosityGeneratorPromptV2,
} from '../src/index'

// Load environment variables from .env.local
const envPath = resolve(process.cwd(), '.env.local')
try {
  config({ path: envPath })
} catch {
  console.warn(`Note: Could not load ${envPath}`)
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env.local')
  process.exit(1)
}

type PromptType = 'curiosity' | 'analysis' | 'hook'

interface TestOptions {
  text?: string
  metadata?: string
}

function parseArgs(): [PromptType, TestOptions] {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: bun scripts/test-prompt.ts <prompt-type> [options]')
    console.error('\nPrompt types:')
    console.error('  curiosity  - Full curiosity quiz (analysis + hook generation)')
    console.error('  analysis   - Just the analysis prompt')
    console.error('  hook       - Just the hook generator prompt')
    console.error('\nOptions:')
    console.error('  --text <text>         Article text for analysis')
    console.error('  --metadata <json>     Metadata for hook generator')
    console.error('\nExamples:')
    console.error('  bun scripts/test-prompt.ts analysis --text "The quick brown fox..."')
    console.error(
      '  bun scripts/test-prompt.ts hook --metadata \'{"archetype":{"label":"CONCEPTUAL"},..}\''
    )
    process.exit(1)
  }

  const promptType = args[0] as PromptType
  const options: TestOptions = {}

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--text' && args[i + 1]) {
      options.text = args[i + 1]
      i++
    } else if (args[i] === '--metadata' && args[i + 1]) {
      options.metadata = args[i + 1]
      i++
    }
  }

  return [promptType, options]
}

async function testAnalysis(text: string) {
  console.log('🔍 Testing Analysis Prompt...')
  console.log(`📝 Input text length: ${text.length} characters\n`)

  const executor = createLLMClient({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    responseMimeType: 'text/plain',
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 0,
    },
  })

  const response = await executor.execute(analysisPromptV2, { text }, AnalysisResponseSchema)

  console.log('✅ Analysis Response:')
  console.log(JSON.stringify(response, null, 2))
}

async function testHookGenerator(metadataStr: string) {
  console.log('🎣 Testing Hook Generator Prompt...')
  console.log(`📊 Input metadata: ${metadataStr.substring(0, 100)}...\n`)

  const metadata = JSON.parse(metadataStr)

  const executor = createLLMClient({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    temperature: 0.1,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
    thinkingConfig: {
      includeThoughts: false,
      thinkingBudget: 0,
    },
  })

  const response = await executor.execute(
    curiosityGeneratorPromptV2,
    { metadata },
    CuriosityGeneratorV2ResponseSchema
  )

  console.log('✅ Hook Generator Response:')
  console.log(JSON.stringify(response, null, 2))
}

async function testCuriosityFull(text: string) {
  console.log('🎯 Testing Full Curiosity Quiz Workflow...')
  console.log(`📝 Input text length: ${text.length} characters\n`)

  // Step 1: Analysis
  console.log('Step 1️⃣ Running Analysis...')
  const executor = createLLMClient({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    responseMimeType: 'text/plain',
  })

  const analysisResponse = await executor.execute(
    analysisPromptV2,
    { text },
    AnalysisResponseSchema
  )

  console.log('✅ Analysis complete')
  console.log(`   Archetype: ${analysisResponse.metadata.archetype.label}`)
  console.log(`   Domain: ${analysisResponse.metadata.domain.primary}`)
  console.log()

  // Step 2: Hook Generation
  console.log('Step 2️⃣ Generating Hook Questions...')
  const hookExecutor = createLLMClient({
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    temperature: 0.1,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
  })

  const hookResponse = await hookExecutor.execute(
    curiosityGeneratorPromptV2,
    { metadata: analysisResponse.metadata },
    CuriosityGeneratorV2ResponseSchema
  )

  console.log('✅ Hook generation complete')
  console.log(`   Generated ${hookResponse.quiz_cards.length} questions`)
  console.log()

  // Step 3: Combined Result
  console.log('📋 Final Result:')
  console.log(JSON.stringify({ analysis: analysisResponse, hooks: hookResponse }, null, 2))
}

async function main() {
  const [promptType, options] = parseArgs()

  console.log(`🚀 Question Engine Prompt Tester`)
  console.log(`📦 Model: ${GEMINI_MODEL}`)
  console.log(`🔑 API Key: ${GEMINI_API_KEY.substring(0, 10)}...`)
  console.log()

  try {
    if (promptType === 'analysis') {
      if (!options.text) {
        console.error('❌ --text is required for analysis')
        process.exit(1)
      }
      await testAnalysis(options.text)
    } else if (promptType === 'hook') {
      if (!options.metadata) {
        console.error('❌ --metadata is required for hook generator')
        process.exit(1)
      }
      await testHookGenerator(options.metadata)
    } else if (promptType === 'curiosity') {
      if (!options.text) {
        console.error('❌ --text is required for curiosity workflow')
        process.exit(1)
      }
      await testCuriosityFull(options.text)
    } else {
      console.error(`❌ Unknown prompt type: ${promptType}`)
      process.exit(1)
    }

    console.log('\n✨ Done!')
  } catch (error) {
    console.error('\n❌ Error:')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
