import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPrimer } from './prime-data.js'
import { buildDetectedSection } from './prime-detect.js'
import { renderMarkdown } from './prime-md.js'
import { renderXml } from './prime-xml.js'

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'onenv-prime-detect-'))
}

describe('prime safety section', () => {
  const data = buildPrimer('test')

  it('exposes safety rules in PrimerData', () => {
    expect(data.safety.rules.length).toBeGreaterThan(0)
    expect(data.safety.description).toMatch(/sensitive metadata/i)
  })

  it('flags item titles as metadata, scoped listings, raw op avoidance', () => {
    const joined = data.safety.rules.join(' ')
    expect(joined).toMatch(/raw `op`|raw op/)
    expect(joined).toMatch(/onenv list <namespace>/)
    expect(joined).toMatch(/never echo raw secret values/i)
  })

  it('renders safety in XML with critical priority', () => {
    const xml = renderXml(data)
    expect(xml).toMatch(/<safety priority="critical">/)
    expect(xml).toMatch(/sensitive metadata/i)
    expect(xml).toMatch(/onenv list <namespace>/)
  })

  it('renders safety as ## Safety in Markdown', () => {
    const md = renderMarkdown(data)
    expect(md).toMatch(/^## Safety$/m)
    expect(md).toMatch(/sensitive metadata/i)
    expect(md).toMatch(/onenv list <namespace>/)
  })

  it('detected is null by default', () => {
    expect(data.detected).toBeNull()
  })
})

describe('buildDetectedSection', () => {
  it('returns null when there is no project marker', async () => {
    const result = await buildDetectedSection(fixture())
    expect(result).toBeNull()
  })

  it('summarizes a project with env files and no .onenv.json', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.env'), 'API_KEY=secret\n')
    const result = await buildDetectedSection(dir)
    expect(result).not.toBeNull()
    expect(result?.project_marker.kind).toBe('node')
    expect(result?.env_files).toHaveLength(1)
    expect(result?.onenv_json).toBe('absent')
    expect(result?.next_action).toMatch(/migrate scan/)
  })

  it('reports namespaces when .onenv.json is present', async () => {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.onenv.json'), JSON.stringify({ namespaces: ['stripe', 'aws'] }))
    const result = await buildDetectedSection(dir)
    expect(result?.onenv_json).toBe('present')
    expect(result?.namespaces_referenced).toEqual(['stripe', 'aws'])
  })
})

describe('rendering detected block', () => {
  it('XML includes <detected> tag only when present', async () => {
    const data = buildPrimer('test')
    expect(renderXml(data)).not.toMatch(/<detected/)
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    data.detected = await buildDetectedSection(dir)
    expect(renderXml(data)).toMatch(/<detected priority="critical">/)
  })

  it('Markdown includes ## Detected only when present', async () => {
    const data = buildPrimer('test')
    expect(renderMarkdown(data)).not.toMatch(/^## Detected/m)
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    data.detected = await buildDetectedSection(dir)
    expect(renderMarkdown(data)).toMatch(/^## Detected/m)
  })
})
