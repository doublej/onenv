import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExternalItem } from '../lib/external-item.js'

const select = vi.fn()
const multiselect = vi.fn()
const text = vi.fn()
const note = vi.fn()

vi.mock('@clack/prompts', () => ({
  select: (...args: unknown[]) => select(...args),
  multiselect: (...args: unknown[]) => multiselect(...args),
  text: (...args: unknown[]) => text(...args),
  note: (...args: unknown[]) => note(...args),
  isCancel: () => false,
  cancel: () => {},
  intro: () => {},
  outro: () => {},
  log: { info: () => {}, warn: () => {}, success: () => {}, message: () => {} },
  spinner: () => ({ start: () => {}, stop: () => {}, message: () => {} }),
  autocomplete: () => Promise.resolve(''),
}))

function githubItem(): ExternalItem {
  return {
    title: 'GitHub',
    category: 'LOGIN',
    primaryUrl: 'https://github.com',
    fields: [
      { id: 'username', type: 'STRING', label: 'username', value: 'jj' },
      { id: 'password', type: 'CONCEALED', label: 'password', value: 's3cret' },
    ],
  }
}

async function loadConfirmPlan() {
  const { confirmPlan } = await import('./explode-tui.js')
  return confirmPlan
}

describe('confirmPlan', () => {
  beforeEach(() => {
    select.mockReset()
    multiselect.mockReset()
    text.mockReset()
    note.mockReset()
  })

  it('returns the full plan when the user accepts it', async () => {
    select.mockResolvedValue('write')
    const confirmPlan = await loadConfirmPlan()
    const decision = await confirmPlan(githubItem(), 'gh', new Set())
    expect(decision?.entries.map((e) => e.key)).toEqual([
      'GITHUB_USERNAME',
      'GITHUB_PASSWORD',
      'GITHUB_URL',
    ])
    expect(decision?.overwrite).toBe(false)
  })

  it('writes only the keys picked in the multiselect', async () => {
    select.mockResolvedValueOnce('select').mockResolvedValueOnce('write')
    multiselect.mockResolvedValue(['GITHUB_PASSWORD'])
    const confirmPlan = await loadConfirmPlan()
    const decision = await confirmPlan(githubItem(), 'gh', new Set())
    expect(decision?.entries.map((e) => e.key)).toEqual(['GITHUB_PASSWORD'])
    // Every key stays offered; the current selection is pre-checked.
    const opts = multiselect.mock.calls[0][0] as {
      options: { value: string }[]
      initialValues: string[]
    }
    expect(opts.options.map((o) => o.value)).toHaveLength(3)
    expect(opts.initialValues).toHaveLength(3)
  })

  it('re-plans with a new prefix and drops the earlier selection', async () => {
    select
      .mockResolvedValueOnce('select')
      .mockResolvedValueOnce('prefix')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('write')
    multiselect.mockResolvedValue(['GITHUB_PASSWORD'])
    const confirmPlan = await loadConfirmPlan()
    const decision = await confirmPlan(githubItem(), 'gh', new Set())
    expect(decision?.entries.map((e) => e.key)).toEqual(['USERNAME', 'PASSWORD', 'URL'])
  })

  it('flags an overwrite when a planned key already exists', async () => {
    select.mockResolvedValue('write')
    const confirmPlan = await loadConfirmPlan()
    const decision = await confirmPlan(githubItem(), 'gh', new Set(['GITHUB_URL']))
    expect(decision?.overwrite).toBe(true)
    expect(select.mock.calls[0][0]).toMatchObject({
      message: '1 of 3 key(s) already exist in gh',
    })
  })

  it('returns null when the user cancels', async () => {
    select.mockResolvedValue('abort')
    const confirmPlan = await loadConfirmPlan()
    expect(await confirmPlan(githubItem(), 'gh', new Set())).toBeNull()
  })
})
