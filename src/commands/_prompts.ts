import * as p from '@clack/prompts'
import { getNamespaces } from '../lib/manager-service.js'
import { validateNamespace } from '../lib/validation.js'

const NEW_NAMESPACE = '__new__'

/** Unwrap a @clack prompt result, exiting cleanly on Ctrl-C / Esc. */
export function expectValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  return value as T
}

/**
 * Subsequence match ("gthb" matches "GitHub"), the behaviour people expect
 * from a fuzzy finder. @clack's default filter is a plain substring test.
 */
export function fuzzyMatch(search: string, haystack: string): boolean {
  const needle = search.trim().toLowerCase()
  if (needle.length === 0) return true
  const target = haystack.toLowerCase()
  let at = 0
  for (const char of needle) {
    if (char === ' ') continue
    at = target.indexOf(char, at)
    if (at === -1) return false
    at += 1
  }
  return true
}

/** Fuzzy filter for p.autocomplete: matches against label + hint. */
export function optionFilter(
  search: string,
  option: { label?: string; hint?: string; value?: unknown },
): boolean {
  const haystack = [option.label ?? String(option.value ?? ''), option.hint ?? ''].join(' ')
  return fuzzyMatch(search, haystack)
}

export interface NamespacePromptOptions {
  message?: string
  /** Pre-filled name for the "create new" branch. */
  suggestion?: string
}

/** Fuzzy-searchable namespace picker with a "create new" escape hatch. */
export async function chooseNamespace(opts: NamespacePromptOptions = {}): Promise<string> {
  const message = opts.message ?? 'Select a namespace'
  const namespaces = await getNamespaces()

  if (namespaces.length > 0) {
    const selected = expectValue(
      await p.autocomplete<string>({
        message,
        placeholder: 'type to search',
        maxItems: 10,
        options: [
          ...namespaces.map((name) => ({ label: name, value: name })),
          { label: 'Create new namespace…', value: NEW_NAMESPACE },
        ],
        initialValue: namespaces[0],
        filter: optionFilter,
      }),
    )
    if (selected !== NEW_NAMESPACE) return validateNamespace(selected)
  }

  const created = expectValue(
    await p.text({
      message: 'Namespace name',
      placeholder: 'project-name',
      initialValue: opts.suggestion,
      validate(value) {
        return value && value.trim().length > 0 ? undefined : 'Namespace is required'
      },
    }),
  )
  return validateNamespace(created)
}
