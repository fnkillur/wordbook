import { describe, expect, it } from 'vitest'
import { wordSizeStyle } from './wordSize'

describe('단어 글자 크기', () => {
  it('라틴 글자는 좁게, 한자·가나는 한 칸으로 센다', () => {
    expect(wordSizeStyle('well')).toEqual({ '--units': 2.48 })
    expect(wordSizeStyle('気持ち')).toEqual({ '--units': 3 })
  })
})
