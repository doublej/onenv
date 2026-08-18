// Render env vars as POSIX `export KEY='value'` lines, safe to `eval` in a
// shell. Single-quoting makes every character literal; an embedded single
// quote is closed, escaped, and reopened ('\''). When namespaces are given,
// an ONENV_ACTIVE marker line is included so the eval'd environment is
// recognizable as primed (see injectedEnv).
export function renderShellExports(values: Record<string, string>, namespaces?: string[]): string {
  const all = namespaces?.length ? { ...values, ONENV_ACTIVE: namespaces.join(',') } : values
  return Object.keys(all)
    .sort()
    .map((key) => `export ${key}=${quoteForShell(all[key])}\n`)
    .join('')
}

// Child-process env with secrets injected. ONENV_ACTIVE carries the
// comma-joined namespaces so nested tools and `onenv prime` can tell the
// environment is already primed.
export function injectedEnv(
  values: Record<string, string>,
  namespaces: string[],
): NodeJS.ProcessEnv {
  return { ...process.env, ...values, ONENV_ACTIVE: namespaces.join(',') }
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
