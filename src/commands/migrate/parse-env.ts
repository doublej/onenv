import type { ParsedEnvEntry } from './types.js'

// Parses a .env file. Supports KEY=value, KEY="value", KEY='value',
// `export KEY=value`, blank lines and `#` comment lines.
// Strips inline `#` comments when the value is unquoted.
// Does NOT handle multiline values — uncommon in .env, deferred.
export function parseEnvFile(content: string): ParsedEnvEntry[] {
  const entries: ParsedEnvEntry[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLine(lines[i], i + 1)
    if (parsed) entries.push(parsed)
  }
  return entries
}

const LINE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/

function parseLine(line: string, lineNum: number): ParsedEnvEntry | null {
  if (!line.trim() || line.trim().startsWith('#')) return null
  const match = LINE_PATTERN.exec(line)
  if (!match) return null
  const [, key, rawValue] = match
  return { key, value: unquote(rawValue), line: lineNum }
}

function unquote(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0]
    const last = raw[raw.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = raw.slice(1, -1)
      return first === '"' ? unescapeDouble(inner) : inner
    }
  }
  return stripInlineComment(raw)
}

function stripInlineComment(value: string): string {
  const hashIdx = value.indexOf(' #')
  if (hashIdx === -1) return value.trim()
  return value.slice(0, hashIdx).trim()
}

function unescapeDouble(value: string): string {
  return value.replace(/\\(n|r|t|"|\\)/g, (_, esc) => {
    if (esc === 'n') return '\n'
    if (esc === 'r') return '\r'
    if (esc === 't') return '\t'
    if (esc === '"') return '"'
    return '\\'
  })
}
