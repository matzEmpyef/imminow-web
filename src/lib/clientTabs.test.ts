import { describe, expect, it } from 'vitest'
import { CLIENT_TABS, clientTabPath, isClientTab } from './clientTabs'

// Review F-164: the Activity queue's offer and deadline rows linked to `?tab=Selected Colleges`,
// a tab that had been renamed "Applications", so the consultant landed on Overview. Links to a
// profile tab are now built from the shared tab names.
const sources = import.meta.glob(['../features/**/*.{ts,tsx}', '../components/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('clientTabPath', () => {
  it('links to the Applications tab', () => {
    expect(clientTabPath('j1', 'Applications')).toBe('/clients/j1?tab=Applications')
  })

  it('opens the Plan tab on a step', () => {
    expect(clientTabPath('j1', 'Plan', { step: 's9' })).toBe('/clients/j1?tab=Plan&step=s9')
  })

  it('adds nothing for Overview, the default', () => {
    expect(clientTabPath('j1')).toBe('/clients/j1')
    expect(clientTabPath('j1', 'Overview')).toBe('/clients/j1')
  })

  it('writes a tab name with a space so the profile page reads it back', () => {
    const query = clientTabPath('j1', 'Internal Notes').split('?')[1]
    expect(new URLSearchParams(query).get('tab')).toBe('Internal Notes')
  })

  it('every tab it can link to is one the profile page has', () => {
    for (const tab of CLIENT_TABS) {
      const tabParam = new URLSearchParams(clientTabPath('j1', tab).split('?')[1] ?? '').get('tab')
      expect(tab === 'Overview' ? tabParam === null : isClientTab(tabParam)).toBe(true)
    }
  })
})

describe('isClientTab', () => {
  it('knows the tabs, and not the name that was retired', () => {
    expect(isClientTab('Applications')).toBe(true)
    expect(isClientTab('Selected Colleges')).toBe(false)
    expect(isClientTab(null)).toBe(false)
  })
})

describe('links to a client profile tab', () => {
  const files = Object.entries(sources).filter(([path]) => !path.includes('.test.'))

  it('are never written out by hand', () => {
    // `/clients/<something>?tab=` inside a string or template: the pattern that went stale.
    const offenders = files.filter(([, text]) => /\/clients\/[^`'"\s]*\?tab=/.test(text)).map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('the Activity queue builds all of its profile links from the shared names', () => {
    const activity = files.find(([path]) => path.endsWith('/dashboard/ActivityPage.tsx'))![1]
    expect(activity).not.toContain('Selected Colleges')
    expect(activity.match(/clientTabPath\([^)]*'Applications'\)/g)?.length).toBe(3)
    expect(activity.match(/clientTabPath\([^)]*'Plan'/g)?.length).toBe(3)
  })
})
