import { themeLabel } from '../data/themes'
import type { WordEntry } from '../data/words'

// 책장의 책은 제초 검정 급수 교재다. 5급은 그림으로 익히는 기초 625, 4급부터는 많이 쓰는 순서 범위를 나눠 담는다.
// 범위는 급수별 어휘량 기준(1,000·2,000·3,000·5,000)에 맞춘다.
export type Book = { id: string; grade: number; title: string; summary: string; source: WordEntry['source']; ranks?: { from: number; to: number } }

export type Chapter = { title: string; words: WordEntry[] }

const CHAPTER_SIZE = 100

export const BOOKS: Book[] = [
  { id: 'grade5', grade: 5, title: '제초 검정 5급', summary: '기초 그림 단어', source: 'base' },
  { id: 'grade4', grade: 4, title: '제초 검정 4급', summary: '많이 쓰는 1~1,000번째', source: 'freq', ranks: { from: 1, to: 1000 } },
  { id: 'grade3', grade: 3, title: '제초 검정 3급', summary: '많이 쓰는 1,001~2,000번째', source: 'freq', ranks: { from: 1001, to: 2000 } },
  { id: 'grade2', grade: 2, title: '제초 검정 2급', summary: '많이 쓰는 2,001~3,000번째', source: 'freq', ranks: { from: 2001, to: 3000 } },
  { id: 'grade1', grade: 1, title: '제초 검정 1급', summary: '많이 쓰는 3,001~10,000번째', source: 'freq', ranks: { from: 3001, to: 10000 } },
]

export const findBook = (bookId: string) => BOOKS.find(book => book.id === bookId) ?? null

const inBook = (book: Book, word: WordEntry) => {
  if (word.source !== book.source) return false
  if (!book.ranks) return true
  const rank = word.rank ?? 0
  return rank >= book.ranks.from && rank <= book.ranks.to
}

const byOrder = (first: WordEntry, second: WordEntry) => (first.rank ?? first.order) - (second.rank ?? second.order)

export const bookWords = (book: Book, words: WordEntry[]) => words.filter(word => inBook(book, word)).sort(byOrder)

const themeChapters = (words: WordEntry[]) => {
  const chapters: Chapter[] = []
  for (const word of words) {
    const last = chapters.at(-1)
    const title = `${chapters.length + 1}장 ${themeLabel(word.theme)}`
    if (last && last.words[0].theme === word.theme) last.words.push(word)
    else chapters.push({ title, words: [word] })
  }
  return chapters
}

const rankChapters = (words: WordEntry[]) => {
  const chapters = new Map<number, WordEntry[]>()
  for (const word of words) {
    const start = Math.floor(((word.rank ?? 1) - 1) / CHAPTER_SIZE) * CHAPTER_SIZE + 1
    chapters.set(start, [...(chapters.get(start) ?? []), word])
  }
  return [...chapters].map(([start, chapterWords]) => ({ title: `${start.toLocaleString()}~${(start + CHAPTER_SIZE - 1).toLocaleString()}번째`, words: chapterWords }))
}

// 5급은 주제가 장이 되고, 회화 책은 100단어씩 한 장이다.
export const chaptersOf = (book: Book, words: WordEntry[]): Chapter[] => {
  const contents = bookWords(book, words)
  return book.source === 'base' ? themeChapters(contents) : rankChapters(contents)
}
