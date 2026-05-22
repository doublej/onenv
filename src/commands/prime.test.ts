import { describe, expect, it } from 'vitest'
import { buildPrimer } from './prime-data.js'
import { renderMarkdown } from './prime-md.js'
import { renderXml } from './prime-xml.js'

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
})
