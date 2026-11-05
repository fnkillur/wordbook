import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, mediaKey } from '../db/database'
import { makeWord, markWord, recordReview, setAudio } from '../db/repository'
import { exportArchive, importArchive } from './archive'

const NOW = new Date('2026-11-05T09:00:00+09:00')
// 테스트 환경에서는 저장소의 ArrayBuffer가 다른 영역(realm)이라 Node Buffer로 읽는다.
const bytes = async (key: string) => {
  const media = await db.media.get(key)
  return media ? Array.from(Buffer.from(media.data)) : null
}

const seed = async () => {
  await makeWord({ wordId: 'ja-0001', image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), memo: '옆집 개', cardTypes: ['produce', 'listen'] }, NOW)
  await setAudio('ja-0001', new Blob([new Uint8Array([9, 8])], { type: 'audio/mpeg' }), 'tts')
  await recordReview('ja-0001:produce', 'good', NOW)
  await markWord('ja-0002', 'known')
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
})

describe('백업 파일', () => {
  it('내보냈다가 빈 저장소에 가져오면 그림·발음까지 그대로다', async () => {
    await seed()
    const archive = await exportArchive()
    await Promise.all(db.tables.map(table => table.clear()))

    expect(await importArchive(archive)).toMatchObject({ added: 6 })
    const note = await db.notes.get('ja-0001')
    expect(note?.memo).toBe('옆집 개')
    expect(await bytes(mediaKey('ja-0001', 'image'))).toEqual([1, 2, 3])
    expect(await bytes(mediaKey('ja-0001', 'audio'))).toEqual([9, 8])
    expect((await db.media.get(mediaKey('ja-0001', 'audio')))?.type).toBe('audio/mpeg')
    expect((await db.cards.get('ja-0001:produce'))?.fsrs.reps).toBe(1)
    expect(await db.reviewLogs.count()).toBe(1)
    expect((await db.wordStates.get('ja-0002'))?.status).toBe('known')
  })

  it('같은 항목이 있으면 더 최근 것을 남기고, 기록은 겹치지 않게 더한다', async () => {
    await seed()
    const archive = await exportArchive()
    await db.notes.update('ja-0001', { memo: '새로 고친 기억', updatedAt: '2026-11-06T00:00:00.000Z' })

    const result = await importArchive(archive)

    expect((await db.notes.get('ja-0001'))?.memo).toBe('새로 고친 기억')
    expect(await db.reviewLogs.count()).toBe(1)
    expect(result.added).toBe(0)
  })
})
