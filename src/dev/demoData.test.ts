import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { earnedTotal, knownCards, makeWord, vocabTests } from '../db/repository'
import { todayQueue } from '../domain/schedule'
import { focusDemoCloze, seedDemoCloze, seedDemoData } from './demoData'

const NOW = new Date('2026-11-07T09:00:00+09:00')
const image = async () => new Blob(['img'], { type: 'image/png' })

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
})

describe('seedDemoData', () => {
  it('어제 만든 단어 6개를 바로 복습할 수 있게 넣고, 테스트를 본 것으로 하고, 도감이 열릴 만큼 보수를 준다', async () => {
    await seedDemoData('ja', NOW, image)

    const cards = await knownCards('ja')
    expect(new Set(cards.map(card => card.wordId)).size).toBe(6)
    expect(todayQueue(cards, NOW, { soundOff: false, silentWords: new Set() })).toHaveLength(12)
    expect(await db.media.count()).toBe(6)
    expect(await vocabTests('ja')).toHaveLength(1)
    expect(await earnedTotal()).toBeGreaterThanOrEqual(1000)
  })

  it('이미 직접 만든 단어는 덮어쓰지 않고 다른 단어로 채운다', async () => {
    await makeWord({ wordId: 'ja-0001', image: null, memo: '옆집 개', cardTypes: ['produce'] }, NOW)
    await seedDemoData('ja', NOW, image)

    expect((await db.notes.get('ja-0001'))?.memo).toBe('옆집 개')
    expect(await db.notes.count()).toBe(7)
  })

  it('앱을 다시 열어도 한 번만 넣는다', async () => {
    await seedDemoData('ja', NOW, image)
    await db.cards.clear()
    await seedDemoData('ja', NOW, image)

    expect(await db.cards.count()).toBe(0)
  })
})

describe('seedDemoCloze', () => {
  it('문장이 있는 회화 단어 3개를 넣고, 빈칸 카드까지 오늘 바로 나오게 한다', async () => {
    await seedDemoCloze('ja', NOW, image)

    const cards = await knownCards('ja')
    const cloze = cards.filter(card => card.type === 'cloze')
    expect(cloze).toHaveLength(3)
    cloze.forEach(card => expect(card.wordId).toMatch(/^ja-f/))
    expect(todayQueue(cards, NOW, { soundOff: false, silentWords: new Set() }).filter(card => card.type === 'cloze')).toHaveLength(3)
    expect(await db.media.count()).toBe(3)
  })

  it('테스트 데이터를 이미 넣은 폰에도 한 번만 더하고, 직접 만든 단어는 건드리지 않는다', async () => {
    await seedDemoData('ja', NOW, image)
    await makeWord({ wordId: 'ja-f00001', image: null, memo: '내 기억', cardTypes: ['produce'] }, NOW)
    await seedDemoCloze('ja', NOW, image)
    await seedDemoCloze('ja', NOW, image)

    expect((await db.notes.get('ja-f00001'))?.memo).toBe('내 기억')
    expect((await knownCards('ja')).filter(card => card.type === 'cloze')).toHaveLength(3)
  })
})

describe('focusDemoCloze', () => {
  it('오늘 할 카드를 다른 단어의 단어 카드 3장과 빈칸 카드 3장이 번갈아 나오게 하고 나머지는 내일로 미룬다', async () => {
    await seedDemoData('ja', NOW, image)
    await seedDemoCloze('ja', NOW, image)
    await db.cards.update('ja-f00001:cloze', { 'fsrs.due': new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() })
    await focusDemoCloze(NOW)

    const queue = todayQueue(await knownCards('ja'), NOW, { soundOff: false, silentWords: new Set() })
    expect(queue.map(card => card.type === 'cloze')).toEqual([false, true, false, true, false, true])
    expect(new Set(queue.map(card => card.wordId)).size).toBe(6)
  })

  it('한 번만 정리한다', async () => {
    await seedDemoCloze('ja', NOW, image)
    await focusDemoCloze(NOW)
    await db.cards.update('ja-f00001:cloze', { 'fsrs.due': new Date(NOW.getTime() + 60_000).toISOString() })
    await focusDemoCloze(NOW)

    expect((await db.cards.get('ja-f00001:cloze'))?.fsrs.due).toBe(new Date(NOW.getTime() + 60_000).toISOString())
  })
})
