import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testRoot = path.dirname(fileURLToPath(import.meta.url))
const component = fs.readFileSync(path.resolve(testRoot, '../src/components/McpOnboardingDialog.vue'), 'utf8')
const authApi = fs.readFileSync(path.resolve(testRoot, '../src/api/auth.js'), 'utf8')

test('MCP onboarding requires explicit Host selection before prompt generation', () => {
  assert.match(component, /const selectedHost = ref\(''\)/)
  assert.match(component, /role="radiogroup"/)
  assert.match(component, /:disabled="!selectedHost"/)
  assert.match(component, /生成接入提示词/)
  assert.match(component, /await loadHosts\(\)/)
  assert.doesNotMatch(component, /selectedHost\.value\s*=\s*['"]workbuddy['"]/)
  assert.doesNotMatch(component.match(/async function openDialog\(\)[\s\S]*?\n}/)?.[0] || '', /loadPrompt/)
})

test('frontend sends the selected Host as the bootstrap source of truth', () => {
  assert.match(authApi, /getOnboardingHosts/)
  assert.match(authApi, /getAgentBootstrap\(host\)/)
  assert.match(authApi, /params:\s*{\s*host\s*}/)
  assert.doesNotMatch(authApi, /client:\s*['"]auto['"]/)
})
