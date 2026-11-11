import { beforeEach, describe, expect, it } from 'vitest'
import { getSettings, learningLanguageOf, saveSettings } from './settings'

beforeEach(() => localStorage.clear())

describe('learningLanguageOf', () => {
  it('따로 고르지 않았으면 사람에 맞는 언어를 배운다', () => {
    expect(learningLanguageOf({ ...getSettings(), person: '하치와레' })).toBe('ja')
    expect(learningLanguageOf({ ...getSettings(), person: '우사기' })).toBe('en')
  })

  it('설정에서 고른 언어가 있으면 그 언어를 배운다', () => {
    saveSettings({ person: '하치와레', language: 'en' })
    expect(learningLanguageOf(getSettings())).toBe('en')
  })
})
