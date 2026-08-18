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

describe('priming awareness (ONENV_ACTIVE)', () => {
  function project(namespaces: unknown = ['stripe', 'aws'], extra: object = {}): string {
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, '.onenv.json'), JSON.stringify({ namespaces, ...extra }))
    return dir
  }

  it('reports NOT primed with run/shell instructions when the marker is absent', async () => {
    const result = await buildDetectedSection(project(), {})
    expect(result?.onenv_active).toBeNull()
    expect(result?.next_action).toMatch(/NOT primed/)
    expect(result?.next_action).toMatch(/onenv run -- <cmd>/)
    expect(result?.next_action).toMatch(/onenv shell/)
  })

  it('reports already primed when the marker covers every namespace', async () => {
    const env = { ONENV_ACTIVE: 'stripe,aws' }
    const result = await buildDetectedSection(project(), env)
    expect(result?.onenv_active).toBe('stripe,aws')
    expect(result?.next_action).toMatch(/already primed/)
    expect(result?.next_action).toMatch(/no onenv prefix needed/i)
  })

  it('reports partial priming and names the missing namespaces', async () => {
    const result = await buildDetectedSection(project(), { ONENV_ACTIVE: 'stripe' })
    expect(result?.next_action).toMatch(/PARTIALLY primed/)
    expect(result?.next_action).toMatch(/missing namespaces: aws/)
  })

  it('ignores fileOnlyNamespaces when judging priming', async () => {
    const dir = project(['stripe', 'oauth'], { fileOnlyNamespaces: ['oauth'] })
    const result = await buildDetectedSection(dir, { ONENV_ACTIVE: 'stripe' })
    expect(result?.next_action).toMatch(/already primed/)
  })
})

describe('rendering priming awareness', () => {
  it('XML detected block carries the ONENV_ACTIVE line and workflow has SESSION', async () => {
    const data = buildPrimer('test')
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    data.detected = await buildDetectedSection(dir, {})
    const xml = renderXml(data)
    expect(xml).toMatch(/ONENV_ACTIVE: not set \(environment not primed\)/)
    expect(xml).toMatch(/SESSION:/)
    expect(xml).toMatch(/onenv shell/)
  })

  it('Markdown detected block carries the ONENV_ACTIVE line and workflow has Session', async () => {
    const data = buildPrimer('test')
    const dir = fixture()
    writeFileSync(join(dir, 'package.json'), '{}')
    data.detected = await buildDetectedSection(dir, { ONENV_ACTIVE: 'aws' })
    const md = renderMarkdown(data)
    expect(md).toMatch(/`ONENV_ACTIVE`: `aws`/)
    expect(md).toMatch(/^### Session$/m)
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
