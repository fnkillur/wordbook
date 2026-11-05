import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import { db, mediaKey } from './database'
import { dayPlan, fillMissingAudio, madeCountOn, makeWord, markWord, recordReview, setAudio, silentWordIds, todaysWords } from './repository'

const NOW = new Date('2026-11-05T09:00:00+09:00')
const image = () => new Blob(['img'], { type: 'image/jpeg' })

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
})

describe('makeWord', () => {
  it('노트와 고른 종류만큼의 카드를 만들고 단어를 만든 것으로 표시한다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '옆집 개', cardTypes: ['produce', 'recognize', 'listen'] }, NOW)

    expect(await db.cards.where('wordId').equals('ja-0001').count()).toBe(3)
    expect(await db.notes.get('ja-0001')).toMatchObject({ memo: '옆집 개', audioSource: null, madeAt: NOW.toISOString() })
    expect((await db.media.get(mediaKey('ja-0001', 'image')))?.type).toBe('image/jpeg')
    expect((await db.wordStates.get('ja-0001'))?.status).toBe('made')
  })
})

describe('makeWord (이미 만든 단어)', () => {
  it('다시 만들면 그림·기억만 바꾸고 복습 진도·발음·만든 날은 그대로 두며, 없던 카드 종류만 더한다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '처음', cardTypes: ['produce'] }, NOW)
    await setAudio('ja-0001', new Blob(['mp3'], { type: 'audio/mpeg' }), 'tts')
    await recordReview('ja-0001:produce', 'good', NOW)
    const madeAt = (await db.wordStates.get('ja-0001'))?.updatedAt

    await makeWord({ wordId: 'ja-0001', image: image(), memo: '고친 기억', cardTypes: ['produce', 'listen'] }, new Date('2026-11-07T09:00:00+09:00'))

    expect((await db.cards.get('ja-0001:produce'))?.fsrs.reps).toBe(1)
    expect(await db.cards.get('ja-0001:listen')).toBeDefined()
    expect(await db.notes.get('ja-0001')).toMatchObject({ memo: '고친 기억', audioSource: 'tts' })
    expect((await db.wordStates.get('ja-0001'))?.updatedAt).toBe(madeAt)
  })
})

describe('todaysWords', () => {
  it('아직 손대지 않은 단어를 순서대로, 정한 개수만큼 낸다', async () => {
    await markWord('ja-0001', 'known')
    await markWord('ja-0002', 'skipped')
    await makeWord({ wordId: 'ja-0003', image: image(), memo: '', cardTypes: ['produce'] }, NOW)

    expect((await todaysWords('ja', 2)).map(word => word.id)).toEqual(['ja-0004', 'ja-0005'])
    expect(await todaysWords('ja', 0)).toEqual([])
    expect((await todaysWords('en', 1))[0].id).toBe(WORDS.en[0].id)
  })
})

describe('recordReview', () => {
  it('카드의 다음 날짜를 옮기고 기록을 남긴다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await recordReview('ja-0001:produce', 'again', NOW)

    expect((await db.cards.get('ja-0001:produce'))?.fsrs.reps).toBe(1)
    expect(await db.reviewLogs.where('cardId').equals('ja-0001:produce').count()).toBe(1)
  })
})

describe('setAudio', () => {
  it('노트에 발음과 출처를 저장한다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await setAudio('ja-0001', new Blob(['mp3'], { type: 'audio/mpeg' }), 'tts')

    expect((await db.notes.get('ja-0001'))?.audioSource).toBe('tts')
  })
})

describe('dayPlan', () => {
  it('그날 처음 정한 새 단어 수를 하루 동안 그대로 쓴다', async () => {
    const first = await dayPlan(NOW, 15)
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce', 'recognize', 'listen'] }, NOW)

    expect(first).toEqual({ date: '2026-11-05', newWords: 10 })
    expect(await dayPlan(NOW, 15)).toEqual(first)
  })

  it('오늘 만든 단어 수를 센다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await markWord('ja-0002', 'known')

    expect(await madeCountOn(NOW)).toBe(1)
    expect(await madeCountOn(new Date('2026-11-06T09:00:00+09:00'))).toBe(0)
  })
})

describe('발음 다시 받기', () => {
  it('발음이 없는 단어를 모으고, 받아 오면 채운다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['listen'] }, NOW)
    await makeWord({ wordId: 'ja-0002', image: image(), memo: '', cardTypes: ['listen'] }, NOW)
    await setAudio('ja-0002', new Blob(['mp3'], { type: 'audio/mpeg' }), 'tts')

    expect([...(await silentWordIds())]).toEqual(['ja-0001'])
    const asked: string[] = []
    expect(await fillMissingAudio(async word => (asked.push(word.id), new Blob(['mp3'], { type: 'audio/mpeg' })))).toBe(1)
    expect(asked).toEqual(['ja-0001'])
    expect((await silentWordIds()).size).toBe(0)
  })

  it('받다가 실패하면 거기서 멈추고 남은 건 다음에 받는다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['listen'] }, NOW)
    expect(await fillMissingAudio(async () => Promise.reject(new Error('서버 오류')))).toBe(0)
    expect((await silentWordIds()).size).toBe(1)
  })
})
