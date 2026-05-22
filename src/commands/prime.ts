import { getPackageVersion } from '../lib/version.js'
import { buildPrimer, type PrimerData } from './prime-data.js'
import { buildDetectedSection } from './prime-detect.js'
import { LOGO } from './prime-logo.js'
import { renderMarkdown } from './prime-md.js'
import { renderXml } from './prime-xml.js'

export type PrimeFormat = 'xml' | 'md' | 'json'

export interface PrimeOptions {
  detect: boolean
}

export async function printPrime(format: PrimeFormat, options: PrimeOptions): Promise<void> {
  const data = buildPrimer(getPackageVersion())
  if (options.detect) data.detected = await buildDetectedSection(process.cwd())
  const body = renderBody(format, data)
  const text = format === 'json' ? body : `${LOGO}\n\n${body}`
  process.stdout.write(`${text}\n`)
}

function renderBody(format: PrimeFormat, data: PrimerData): string {
  if (format === 'json') return JSON.stringify(data, null, 2)
  if (format === 'md') return renderMarkdown(data)
  return renderXml(data)
}
