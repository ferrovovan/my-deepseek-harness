// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localizedBrandTitle } from '../src/brand-title.ts'

describe('localizedBrandTitle', () => {
  const originalLang = document.documentElement.lang

  afterEach(() => {
    document.documentElement.lang = originalLang
    vi.unstubAllEnvs()
  })

  it('falls back to the localized generic label when no title is baked', () => {
    document.documentElement.lang = 'ru'
    expect(localizedBrandTitle('Локальная сборка DSH')).toBe('Локальная сборка DSH')
  })

  it('prefers the language-specific baked title for ru and zh documents', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Featured DSH')
    vi.stubEnv('DSH_CLIENT_TITLE_RU', 'Изменённый DSH')
    vi.stubEnv('DSH_CLIENT_TITLE_ZH', '定制 DSH')
    document.documentElement.lang = 'ru'
    expect(localizedBrandTitle('DSH Local Build')).toBe('Изменённый DSH')
    document.documentElement.lang = 'zh-CN'
    expect(localizedBrandTitle('DSH Local Build')).toBe('定制 DSH')
  })

  it('uses the baked default for other languages and when a variant is unbaked', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Featured DSH')
    document.documentElement.lang = 'en'
    expect(localizedBrandTitle('DSH Local Build')).toBe('Featured DSH')
    document.documentElement.lang = 'ru'
    expect(localizedBrandTitle('DSH Local Build')).toBe('Featured DSH')
    vi.stubEnv('DSH_CLIENT_TITLE', undefined)
    document.documentElement.lang = 'ja'
    expect(localizedBrandTitle('DSH Local Build')).toBe('DSH Local Build')
  })
})
