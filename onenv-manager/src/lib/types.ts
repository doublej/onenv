export type JsonLeafType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'empty-object'
  | 'empty-array'

export interface NamespaceVar {
  key: string
  value?: string
  disabled: boolean
  group?: string
  path?: string
  type?: JsonLeafType
}

export interface StateFile {
  version: 1
  disabled: Record<string, string[]>
}
