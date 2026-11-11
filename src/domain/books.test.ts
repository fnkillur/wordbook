import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/words'
import { BOOKS, bookWords, chaptersOf, findBook } from './books'

const entry = (id: string, source: 'base' | 'freq', rank: number | null, theme = '회화'): WordEntry => ({
  id,
  order: rank ?? 0,
  theme,
  text: id,
  reading: '',
  kanji: null,
  meaningKo: '',
  hint: '',
  searchQuery: id,
  source,
  rank,
})

const words = [entry('b1', 'base', null, 'Animal'), entry('b2', 'base', null, 'Animal'), entry('b3', 'base', null, 'Color'), entry('f1500', 'freq', 1500), entry('f20', 'freq', 20), entry('f150', 'freq', 150)]

describe('books', () => {
  it('제초 검정 5급부터 1급까지 다섯 권이다', () => {
    expect(BOOKS.map(book => book.title)).toEqual(['제초 검정 5급', '제초 검정 4급', '제초 검정 3급', '제초 검정 2급', '제초 검정 1급'])
  })

  it('5급은 기초 625, 4급부터는 많이 쓰는 순서 범위로 나눈다', () => {
    expect(bookWords(findBook('grade5')!, words).map(word => word.id)).toEqual(['b1', 'b2', 'b3'])
    expect(bookWords(findBook('grade4')!, words).map(word => word.id)).toEqual(['f20', 'f150'])
    expect(bookWords(findBook('grade3')!, words).map(word => word.id)).toEqual(['f1500'])
    expect(bookWords(findBook('grade1')!, words)).toEqual([])
  })

  it('5급은 주제별로, 회화 책은 100단어씩 장을 나눈다', () => {
    expect(chaptersOf(findBook('grade5')!, words).map(chapter => [chapter.title, chapter.words.length])).toEqual([
      ['1장 동물', 2],
      ['2장 색깔', 1],
    ])
    expect(chaptersOf(findBook('grade4')!, words).map(chapter => [chapter.title, chapter.words.length])).toEqual([
      ['1~100번째', 1],
      ['101~200번째', 1],
    ])
  })
})
