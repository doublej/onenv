// Commands whose output is a single scalar secret meant for piping — never
// auto-wrap these in JSON. Only an explicit --json switches them.
const RAW_OUTPUT_COMMANDS = new Set(['get'])

export interface OutputModeInput {
  explicitJson: boolean
  isTty: boolean
  commandName: string
}

export function shouldUseJsonOutput({
  explicitJson,
  isTty,
  commandName,
}: OutputModeInput): boolean {
  if (explicitJson) return true
  if (RAW_OUTPUT_COMMANDS.has(commandName)) return false
  return !isTty
}
