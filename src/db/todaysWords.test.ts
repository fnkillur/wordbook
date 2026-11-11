import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './database'
import { freqWordsLeft, markWord, setStartRank, todaysWords } from './repository'

vi.mock('../data/words', () => {
  const entry = (id: string, source: 'base' | 'freq', rank: number | null) => ({ id, order: 0, theme: '', text: id, reading: '', kanji: null, meaningKo: '뜻', hint: '', searchQuery: id, source, rank })
  const ja = [entry('ja-0001', 'base', null), entry('ja-0002', 'base', null), entry('ja-f00030', 'freq', 30), entry('ja-f00005', 'freq', 5), entry('ja-f00012', 'freq', 12)]
  return { WORDS: { ja, en: [] }, findWord: (id: string) => ja.find(word => word.id === id) ?? null }
})

const ids = async (budget = 10) => (await todaysWords('ja', budget)).map(word => word.id)

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
})

describe('오늘의 단어 순서', () => {
  it('시작 위치가 없으면 기초 단어만 낸다', async () => {
    expect(await ids()).toEqual(['ja-0001', 'ja-0002'])
    expect(await freqWordsLeft('ja')).toBeNull()
  })

  it('시작 위치가 있으면 그 순위부터 빈도 단어를 순위순으로, 그다음 남은 기초 단어를 낸다', async () => {
    await setStartRank('ja', 10)

    expect(await ids()).toEqual(['ja-f00012', 'ja-f00030', 'ja-0001', 'ja-0002'])
    expect(await ids(1)).toEqual(['ja-f00012'])
  })

  it('남은 빈도 단어 수를 센다', async () => {
    await setStartRank('ja', 10)
    await markWord('ja-f00012', 'known')

    expect(await freqWordsLeft('ja')).toBe(1)
  })
})
