// Returns argv after the `--` terminator (commander stops option parsing
// there): null when there is no `--`, [] when `--` is present but empty.
export function argsAfterDoubleDash(): string[] | null {
  const dashIndex = process.argv.indexOf('--')
  return dashIndex === -1 ? null : process.argv.slice(dashIndex + 1)
}
