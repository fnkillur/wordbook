import 'fake-indexeddb/auto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, mediaKey } from '../db/database'
import { dayPlan, earnedTotal, examResults, makeWord, saveExamResult, markWord, recordReview, saveVocabTest, setAudio, setStartRank, startRankOf, vocabTests } from '../db/repository'
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

  it('문장 음성(m4a)도 m4a 파일로 담고 형식 그대로 가져온다', async () => {
    await seed()
    await db.media.put({ key: 'ja-0001:sentence', data: new Uint8Array([7, 7, 7]).buffer, type: 'audio/mp4' })
    const archive = await exportArchive()

    expect(Object.keys(unzipSync(new Uint8Array(await archive.arrayBuffer())))).toContain('media/ja-0001-sentence.m4a')
    await Promise.all(db.tables.map(table => table.clear()))
    await importArchive(archive)
    expect(await bytes('ja-0001:sentence')).toEqual([7, 7, 7])
    expect((await db.media.get('ja-0001:sentence'))?.type).toBe('audio/mp4')
  })

  it('폰의 노트를 그대로 두더라도 폰에 없는 문장 음성은 백업에서 채우고, 있는 그림은 바꾸지 않는다', async () => {
    await seed()
    await db.media.put({ key: 'ja-0001:sentence', data: new Uint8Array([7, 7, 7]).buffer, type: 'audio/mp4' })
    const archive = await exportArchive()
    await db.media.delete('ja-0001:sentence')
    await db.media.put({ key: mediaKey('ja-0001', 'image'), data: new Uint8Array([5]).buffer, type: 'image/jpeg' })

    await importArchive(archive)
    expect(await bytes('ja-0001:sentence')).toEqual([7, 7, 7])
    expect(await bytes(mediaKey('ja-0001', 'image'))).toEqual([5])
  })

  it('그림·음성 파일 이름은 형식에 맞는 확장자를 쓴다', async () => {
    await seed()
    await db.media.put({ key: mediaKey('ja-0001', 'image'), data: new Uint8Array([1]).buffer, type: 'image/webp' })
    await db.media.put({ key: mediaKey('ja-0001', 'audio'), data: new Uint8Array([2]).buffer, type: 'audio/webm;codecs=opus' })
    await db.media.put({ key: 'ja-0001:sentence', data: new Uint8Array([3]).buffer, type: 'audio/wav' })

    const names = Object.keys(unzipSync(new Uint8Array(await (await exportArchive()).arrayBuffer())))
    expect(names).toEqual(expect.arrayContaining(['media/ja-0001-image.webp', 'media/ja-0001-audio.webm', 'media/ja-0001-sentence.wav']))
  })

  it('같은 항목이 있으면 더 최근 것을 남기고, 기록은 겹치지 않게 더한다', async () => {
    await seed()
    const archive = await exportArchive()
    await db.notes.update('ja-0001', { memo: '새로 고친 기억', updatedAt: new Date(Date.now() + 60_000).toISOString() })

    const result = await importArchive(archive)

    expect((await db.notes.get('ja-0001'))?.memo).toBe('새로 고친 기억')
    expect(await db.reviewLogs.count()).toBe(1)
    expect(result.added).toBe(0)
  })

  it('어휘량 테스트 기록과 시작 위치도 담고, 하루 계획은 담지 않는다', async () => {
    await saveVocabTest('ja', { takenAt: '2026-11-06T00:00:00.000Z', set: 0, scores: [{ band: 0, known: 12, total: 20 }], estimate: 600, startRank: 1 })
    await setStartRank('ja', 1)
    await dayPlan(NOW, 15, 'ja')
    const archive = await exportArchive()
    await Promise.all(db.tables.map(table => table.clear()))

    await importArchive(archive)

    expect(await startRankOf('ja')).toBe(1)
    expect(await vocabTests('ja')).toHaveLength(1)
    expect(await db.settings.filter(row => row.key.startsWith('plan:')).count()).toBe(0)
  })

  it('제초 검정 기록도 담는다', async () => {
    await saveExamResult('ja', { takenAt: '2026-11-06T00:00:00.000Z', grade: 4, correct: 9, total: 10, passed: true })
    const archive = await exportArchive()
    await Promise.all(db.tables.map(table => table.clear()))

    await importArchive(archive)

    expect(await examResults('ja')).toHaveLength(1)
  })

  it('테스트 기록은 이미 있는 것과 겹치지 않게 합친다', async () => {
    await saveVocabTest('ja', { takenAt: '2026-11-06T00:00:00.000Z', set: 0, scores: [], estimate: 0, startRank: 1 })
    const archive = await exportArchive()
    await saveVocabTest('ja', { takenAt: '2026-11-07T00:00:00.000Z', set: 1, scores: [], estimate: 0, startRank: 1 })

    await importArchive(archive)

    expect((await vocabTests('ja')).map(result => result.takenAt)).toEqual(['2026-11-06T00:00:00.000Z', '2026-11-07T00:00:00.000Z'])
  })

  it('보수 기록도 담고, 가져올 때 두 번 더해지지 않는다', async () => {
    await seed()
    await db.coins.put({ id: 'buy:pajama', kind: 'buy', amount: -3, at: NOW.toISOString() })
    const archive = await exportArchive()

    await importArchive(archive)
    expect(await earnedTotal()).toBe(6)
    expect(await db.coins.count()).toBe(3)

    await Promise.all(db.tables.map(table => table.clear()))
    await importArchive(archive)
    expect(await earnedTotal()).toBe(6)
    expect(await db.coins.count()).toBe(3)
  })

  it('보수 기록이 없는 예전 백업은 복습과 만든 단어로 보수를 채운다', async () => {
    await seed()
    const archive = await exportArchive()
    await Promise.all(db.tables.map(table => table.clear()))
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
    const data = JSON.parse(strFromU8(files['data.json']))
    delete data.coins
    files['data.json'] = strToU8(JSON.stringify(data))

    await importArchive(new Blob([zipSync(files)]))

    expect(await earnedTotal()).toBe(6)
  })
})
