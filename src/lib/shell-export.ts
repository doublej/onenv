// Render env vars as POSIX `export KEY='value'` lines, safe to `eval` in a
// shell. Single-quoting makes every character literal; an embedded single
// quote is closed, escaped, and reopened ('\'').
export function renderShellExports(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((key) => `export ${key}=${quoteForShell(values[key])}\n`)
    .join('')
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
