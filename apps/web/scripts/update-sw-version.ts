#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Read package.json to get current version
const packageJsonPath = join(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const version = packageJson.version

// Update sw.js with current version
const swPath = join(process.cwd(), 'public', 'sw.js')
let swContent = readFileSync(swPath, 'utf-8')

// Replace APP_VERSION line
swContent = swContent.replace(
  /const APP_VERSION = ['"][\d.]+['"] \/\/ Updated during build/,
  `const APP_VERSION = '${version}' // Updated during build`
)

writeFileSync(swPath, swContent, 'utf-8')

console.log(`✓ Updated service worker version to ${version}`)
