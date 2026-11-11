import { describe, expect, it } from 'vitest'
import { themeLabel } from './themes'
import { WORDS } from './words'

describe('themeLabel', () => {
  it('기초 단어의 주제를 우리말로 보여 준다', () => {
    expect(themeLabel('Animal')).toBe('동물')
    expect(themeLabel('Days of the week')).toBe('요일')
  })

  it('기초 단어의 모든 주제에 우리말 이름이 있다', () => {
    const themes = new Set([...WORDS.ja, ...WORDS.en].filter(word => word.source === 'base').map(word => word.theme))
    expect([...themes].filter(theme => themeLabel(theme) === theme)).toEqual([])
  })
})
