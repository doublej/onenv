import { getPackageVersion } from '../lib/version.js'
import { buildPrimer } from './prime-data.js'
import { renderXml } from './prime-xml.js'

export function printPrime(jsonMode: boolean): void {
  const data = buildPrimer(getPackageVersion())
  const text = jsonMode ? JSON.stringify(data, null, 2) : renderXml(data)
  process.stdout.write(`${text}\n`)
}
