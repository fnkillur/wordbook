import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/database'
import { getMedia, makeWord, recordReview } from '../db/repository'
import { saveSettings } from '../settings'
import { backfillSentenceAudio, prepareSentenceAudio } from './sentenceAudio'
import { fetchTts } from './tts'

vi.mock('./tts', () => ({ fetchTts: vi.fn() }))

const NOW = new Date('2026-11-05T09:00:00+09:00')
const SERVER = { endpoint: 'https://example.test/exec', token: 'test-token' }
// 테스트 환경의 Blob(jsdom)은 Node Response 본문이 되지 못해서 바이트와 형식 헤더로 응답을 만든다.
const audioResponse = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mp4' } })
const withCloze = async (wordId: string) => {
  await makeWord({ wordId, image: null, memo: '', cardTypes: ['produce'] }, NOW)
  await recordReview(`${wordId}:produce`, 'good', NOW)
}

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()))
  localStorage.clear()
  vi.mocked(fetchTts).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prepareSentenceAudio', () => {
  it('원어민 녹음이 있으면 앱에 든 녹음 파일을 받아 저장한다', async () => {
    const fetchMock = vi.fn(async () => audioResponse())
    vi.stubGlobal('fetch', fetchMock)

    expect(await prepareSentenceAudio('ja-f00001')).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sentence-audio/ja/1.m4a`)
    expect((await getMedia('ja-f00001', 'sentence'))?.type).toBe('audio/mp4')
  })

  it('녹음이 없는 문장은 서버 TTS로 문장 전체를 읽어 저장한다', async () => {
    saveSettings({ server: SERVER })
    vi.mocked(fetchTts).mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }))

    expect(await prepareSentenceAudio('en-f00001')).toBe(true)
    expect(fetchTts).toHaveBeenCalledWith(SERVER, 'What can I get for you today?', 'en')
    expect((await getMedia('en-f00001', 'sentence'))?.type).toBe('audio/mpeg')
  })

  it('녹음을 받지 못하고 서버도 없으면 저장하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

    expect(await prepareSentenceAudio('ja-f00001')).toBe(false)
    expect(await getMedia('ja-f00001', 'sentence')).toBeNull()
  })
})

describe('backfillSentenceAudio', () => {
  it('빠진 문장 음성을 차례로 받다가 처음 실패하면 멈춘다', async () => {
    await withCloze('en-f00001')
    await withCloze('en-f00002')
    saveSettings({ server: SERVER })
    vi.mocked(fetchTts).mockRejectedValue(new Error('offline'))

    expect(await backfillSentenceAudio()).toBe(0)
    expect(fetchTts).toHaveBeenCalledTimes(1)
  })

  it('TTS로 읽을 문장을 받지 못해도 앱에 든 원어민 녹음은 계속 받는다', async () => {
    await withCloze('en-f00001')
    await withCloze('ja-f00001')
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()))

    expect(await backfillSentenceAudio()).toBe(1)
    expect(await getMedia('ja-f00001', 'sentence')).not.toBeNull()
  })

  it('서버 TTS가 한 번 실패하면 남은 TTS 문장은 다음 기회로 미룬다', async () => {
    await withCloze('en-f00001')
    await withCloze('en-f00002')
    saveSettings({ server: SERVER })
    vi.mocked(fetchTts).mockRejectedValue(new Error('offline'))

    await backfillSentenceAudio()
    expect(fetchTts).toHaveBeenCalledTimes(1)
  })
})
