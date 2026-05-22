type ErrorCategory = 'user_error' | 'transient' | 'upstream' | 'internal'

interface StructuredError {
  error: {
    code: string
    message: string
    hint?: string
    suggestion?: string
    category: ErrorCategory
    retryable: boolean
  }
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly category: ErrorCategory = 'user_error',
    readonly hint?: string,
    readonly suggestion?: string,
  ) {
    super(message)
    this.name = 'CliError'
  }

  get retryable(): boolean {
    return this.category === 'transient'
  }

  toJSON(): StructuredError {
    return {
      error: {
        code: this.code,
        message: this.message,
        category: this.category,
        retryable: this.retryable,
        ...(this.hint && { hint: this.hint }),
        ...(this.suggestion && { suggestion: this.suggestion }),
      },
    }
  }
}

export function opError(stderr: string, args: string[]): CliError {
  const msg = stderr.trim() || 'Unknown op error'
  if (msg.includes('not signed in') || msg.includes('session expired')) {
    return new CliError('OP_AUTH', msg, 'transient', 'Sign in with: eval $(op signin)')
  }
  if (msg.includes('no items found') || msg.includes("isn't an item")) {
    return new CliError(
      'NOT_FOUND',
      msg,
      'user_error',
      'Check namespace and key with: onenv-manager list',
    )
  }
  if (msg.includes('vault') && msg.includes('not found')) {
    return new CliError(
      'VAULT_NOT_FOUND',
      msg,
      'user_error',
      'Set ONENV_VAULT or create the vault in 1Password',
    )
  }
  return new CliError('OP_ERROR', `op ${args.join(' ')} failed: ${msg}`, 'upstream')
}

export function validationError(message: string, hint?: string, suggestion?: string): CliError {
  return new CliError('VALIDATION', message, 'user_error', hint, suggestion)
}
