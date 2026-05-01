export interface NamespaceVar {
  key: string
  value?: string
  disabled: boolean
}

export interface StateFile {
  version: 1
  disabled: Record<string, string[]>
}
