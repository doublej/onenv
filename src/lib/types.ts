export type JsonLeafType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'empty-object'
  | 'empty-array'
  | 'raw'

export interface NamespaceVar {
  key: string
  value?: string
  disabled: boolean
  group?: string
  path?: string
  type?: JsonLeafType
  fingerprint?: string
}

export interface StateFile {
  version: 1
  disabled: Record<string, string[]>
}
