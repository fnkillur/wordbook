import { describe, expect, it } from 'vitest'
import base from '../../scripts/data/base625.json'
import { speechTextOf, WORDS } from './words'

describe.each(['ja', 'en'] as const)('단어 데이터 (%s)', language => {
  const words = WORDS[language]

  it('기초 단어 목록과 같은 수, 같은 순서다', () => {
    expect(words).toHaveLength(base.length)
    expect(words.map(word => word.order)).toEqual(base.map((_, index) => index + 1))
    expect(words.map(word => word.theme)).toEqual(base.map(item => item.theme))
  })

  it('id가 겹치지 않고, 단어·뜻·읽기·검색어가 비어 있지 않다', () => {
    expect(new Set(words.map(word => word.id)).size).toBe(words.length)
    words.forEach(word => {
      expect(word.id.startsWith(`${language}-`)).toBe(true)
      expect([word.text, word.meaningKo, word.reading, word.searchQuery].every(value => value.trim() !== '')).toBe(true)
    })
  })
})

describe('일본어 단어 데이터', () => {
  it('읽기는 가나로만 쓰고, 한자가 들어간 단어만 kanji 칸을 채운다', () => {
    WORDS.ja.forEach(word => {
      expect(word.reading).toMatch(/^[\p{sc=Hiragana}\p{sc=Katakana}ー]+$/u)
      expect(word.kanji !== null).toBe(/\p{sc=Han}/u.test(word.text))
    })
  })

  it('그림 검색은 일본어 단어로 한다', () => {
    expect(WORDS.ja.find(word => word.text === '犬')?.searchQuery).toBe('犬')
  })
})

describe('speechTextOf', () => {
  it('일본어는 한자를 잘못 읽지 않게 가나 읽기로, 영어는 단어 그대로 발음을 만든다', () => {
    expect(speechTextOf(WORDS.ja.find(word => word.text === '家')!)).toBe('いえ')
    expect(speechTextOf(WORDS.en[0])).toBe('dog')
  })
})
