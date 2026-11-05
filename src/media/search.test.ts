import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import { googleImageUrl } from './search'

describe('googleImageUrl', () => {
  it('단어의 검색어로 구글 이미지를 그 언어로 연다', () => {
    const dog = WORDS.ja[0]
    expect(googleImageUrl(dog, 'ja')).toBe(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent('犬')}&hl=ja`)
    expect(googleImageUrl(WORDS.en[0], 'en')).toBe('https://www.google.com/search?tbm=isch&q=dog&hl=en')
  })
})
