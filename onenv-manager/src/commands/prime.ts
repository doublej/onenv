import { getPackageVersion } from '../lib/version.js'
import { buildPrimer } from './prime-data.js'
import { renderMarkdown } from './prime-md.js'
import { renderXml } from './prime-xml.js'

export type PrimeFormat = 'xml' | 'json' | 'md'

export function printPrime(format: PrimeFormat): void {
  const data = buildPrimer(getPackageVersion())
  const text =
    format === 'json'
      ? JSON.stringify(data, null, 2)
      : format === 'md'
        ? renderMarkdown(data)
        : renderXml(data)
  process.stdout.write(`${text}\n`)
}
