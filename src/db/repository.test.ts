import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { sentenceAudioKind, sentencesOf } from '../data/sentences'
import { WORDS } from '../data/words'
import { db, mediaKey } from './database'
import { audioReports, clearAudioReports, reportSentenceAudio, claimGoalBonus, earnedTotal, dayPlan, fillMissingAudio, getMedia, setSentenceAudio, wordsMissingSentenceAudio, knownCards, madeCountOn, makeWord, markWord, markWords, recordReview, saveVocabTest, setAudio, setStartRank, silentWordIds, startRankOf, todaysWords, vocabTests, ownedItemIds, examProgress, examResults, learnedWords, postponeToTomorrow, saveExamResult } from './repository'

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

  it('나중에 하기로 넘긴 단어는 손대지 않은 단어를 다 낸 뒤에 다시 낸다', async () => {
    await markWord('ja-0002', 'skipped')
    await markWord('ja-0005', 'skipped')
    await markWord('ja-0003', 'known')

    const words = (await todaysWords('ja', Infinity)).map(word => word.id)
    expect(words.slice(0, 2)).toEqual(['ja-0001', 'ja-0004'])
    expect(words.slice(-2)).toEqual(['ja-0002', 'ja-0005'])
    expect(words).not.toContain('ja-0003')
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
    const first = await dayPlan(NOW, 15, 'ja')
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce', 'recognize', 'listen'] }, NOW)

    expect(first).toEqual({ date: '2026-11-05', newWords: 10 })
    expect(await dayPlan(NOW, 15, 'ja')).toEqual(first)
  })

  it('하루 계획은 언어마다 따로 정한다', async () => {
    await dayPlan(NOW, 15, 'ja')
    await db.settings.put({ key: 'plan:2026-11-05:ja', value: { date: '2026-11-05', newWords: 3 } })

    expect((await dayPlan(NOW, 15, 'ja')).newWords).toBe(3)
    expect((await dayPlan(NOW, 15, 'en')).newWords).toBe(10)
  })

  it('오늘 만든 단어 수를 언어별로 센다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await makeWord({ wordId: 'en-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await markWord('ja-0002', 'known')

    expect(await madeCountOn(NOW, 'ja')).toBe(1)
    expect(await madeCountOn(NOW, 'en')).toBe(1)
    expect(await madeCountOn(new Date('2026-11-06T09:00:00+09:00'), 'ja')).toBe(0)
  })
})

describe('knownCards', () => {
  it('배우는 언어의 카드만 고를 수 있다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await makeWord({ wordId: 'en-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)

    expect((await knownCards('ja')).map(card => card.wordId)).toEqual(['ja-0001'])
    expect(await knownCards()).toHaveLength(2)
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

describe('어휘량 테스트 기록', () => {
  const result = (takenAt: string) => ({ takenAt, set: 0 as const, scores: [{ band: 0, known: 10, total: 20 }], estimate: 500, startRank: 1 })

  it('언어별로 테스트 기록을 쌓는다', async () => {
    await saveVocabTest('en', result('2026-11-06T00:00:00.000Z'))
    await saveVocabTest('en', result('2026-11-07T00:00:00.000Z'))

    expect(await vocabTests('en')).toHaveLength(2)
    expect(await vocabTests('ja')).toEqual([])
  })

  it('시작 위치는 언어별로 따로 둔다', async () => {
    await setStartRank('ja', 3001)

    expect(await startRankOf('ja')).toBe(3001)
    expect(await startRankOf('en')).toBeNull()
  })
})

describe('markWords', () => {
  it('여러 단어를 한 번에 표시한다', async () => {
    await markWords(['ja-0001', 'ja-0002'], 'known')

    expect((await db.wordStates.get('ja-0001'))?.status).toBe('known')
    expect((await db.wordStates.get('ja-0002'))?.status).toBe('known')
  })
})

describe('보수', () => {
  it('복습 카드 1장에 1, 새 단어 하나에 5를 받고, 이미 만든 단어를 고쳐도 다시 받지 않는다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce', 'listen'] }, NOW)
    await recordReview('ja-0001:produce', 'good', NOW)
    await recordReview('ja-0001:listen', 'again', NOW)
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '고침', cardTypes: ['produce'] }, NOW)

    expect(await earnedTotal()).toBe(7)
  })

  it('오늘 공부를 다 하면 보너스 10을 하루 한 번만 받는다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)

    expect(await claimGoalBonus(NOW)).toBe(true)
    expect(await claimGoalBonus(NOW)).toBe(false)
    expect(await earnedTotal()).toBe(15)
  })

  it('오늘 아무것도 안 했으면 보너스가 없다', async () => {
    expect(await claimGoalBonus(NOW)).toBe(false)
    expect(await earnedTotal()).toBe(0)
  })

  it('모은 보수는 예전에 산 기록을 빼지 않고, 산 물건은 따로 알려 준다', async () => {
    await makeWord({ wordId: 'ja-0001', image: image(), memo: '', cardTypes: ['produce'] }, NOW)
    await db.coins.put({ id: 'buy:pajama', kind: 'buy', amount: -5, at: NOW.toISOString() })

    expect(await earnedTotal()).toBe(5)
    expect(await ownedItemIds()).toEqual(['pajama'])
  })
})

describe('빈칸 카드 만들기', () => {
  const tomorrow = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1)
  const make = (wordId: string) => makeWord({ wordId, image: image(), memo: '', cardTypes: ['produce', 'recognize'] }, NOW)
  const clozeCards = (wordId: string) => db.cards.where('wordId').equals(wordId).filter(card => card.type === 'cloze').toArray()

  it('문장이 있는 단어를 처음 알았어로 답하면 다음 날 0시부터 나오는 빈칸 카드를 만든다', async () => {
    await make('ja-f00001')

    expect(await recordReview('ja-f00001:produce', 'good', NOW)).toBe('ja-f00001')
    const [cloze] = await clozeCards('ja-f00001')
    expect(cloze.id).toBe('ja-f00001:cloze')
    expect(new Date(cloze.fsrs.due).getTime()).toBe(tomorrow.getTime())
  })

  it('이미 빈칸 카드가 있으면 다시 알았어로 답해도 더 만들지 않는다', async () => {
    await make('ja-f00001')
    await recordReview('ja-f00001:produce', 'good', NOW)

    expect(await recordReview('ja-f00001:recognize', 'good', NOW)).toBeNull()
    expect(await clozeCards('ja-f00001')).toHaveLength(1)
  })

  it('몰랐어로는 만들지 않는다', async () => {
    await make('ja-f00001')

    expect(await recordReview('ja-f00001:produce', 'again', NOW)).toBeNull()
    expect(await clozeCards('ja-f00001')).toHaveLength(0)
  })

  it('빈칸 카드를 알았어로 답해도 새 카드를 만들지 않는다', async () => {
    await make('ja-f00001')
    await recordReview('ja-f00001:produce', 'good', NOW)

    expect(await recordReview('ja-f00001:cloze', 'good', tomorrow)).toBeNull()
    expect(await db.cards.where('wordId').equals('ja-f00001').count()).toBe(3)
  })

  it('활용형 문장만 있는 기초 동사도 처음 알았어로 답하면 빈칸 카드를 만든다', async () => {
    await make('ja-0481')

    expect(await recordReview('ja-0481:produce', 'good', NOW)).toBe('ja-0481')
    expect(await clozeCards('ja-0481')).toHaveLength(1)
  })

  it('기초 단어와 학습 목록에서 뺀 단어는 만들지 않는다', async () => {
    await make('ja-0001')
    await db.cards.put({ ...(await db.cards.get('ja-0001:produce'))!, id: 'en-f00104:produce', wordId: 'en-f00104' })

    expect(await recordReview('ja-0001:produce', 'good', NOW)).toBeNull()
    expect(await recordReview('en-f00104:produce', 'good', NOW)).toBeNull()
    expect(await db.cards.filter(card => card.type === 'cloze').count()).toBe(0)
  })

  it('문장 음성이 없는 빈칸 카드의 단어를 알려 주고, 저장하면 빠진다', async () => {
    await make('ja-f00001')
    await recordReview('ja-f00001:produce', 'good', NOW)

    expect(await wordsMissingSentenceAudio()).toEqual(['ja-f00001'])
    await setSentenceAudio('ja-f00001', new Blob(['m4a'], { type: 'audio/mp4' }))
    expect(await wordsMissingSentenceAudio()).toEqual([])
    expect((await getMedia('ja-f00001', sentenceAudioKind(sentencesOf('ja-f00001')[0])))?.type).toBe('audio/mp4')
  })

  it('활용형 문장만 있는 동사는 첫 활용형 문장의 음성을 받았는지로 따진다', async () => {
    await make('ja-0481')
    await recordReview('ja-0481:produce', 'good', NOW)

    expect(await wordsMissingSentenceAudio()).toEqual(['ja-0481'])
    await setSentenceAudio('ja-0481', new Blob(['m4a'], { type: 'audio/mp4' }))
    expect(await wordsMissingSentenceAudio()).toEqual([])
  })
})

describe('음성 제보', () => {
  it('원어민 녹음이 이상하다고 제보하면 한 번만 모아 두고, 비우면 없어진다', async () => {
    const sentence = sentencesOf('ja-f00001')[0]
    await reportSentenceAudio('ja-f00001', sentence, NOW)
    await reportSentenceAudio('ja-f00001', sentence, NOW)

    expect(await audioReports()).toEqual([{ wordId: 'ja-f00001', audioPath: sentence.audioPath, text: '彼はテニスをします。', reportedAt: NOW.toISOString() }])
    await clearAudioReports()
    expect(await audioReports()).toEqual([])
  })
})

describe('제초 검정 기록', () => {
  const learnCard = async (wordId: string, scheduledDays: number) => {
    await makeWord({ wordId, image: null, memo: '', cardTypes: ['produce'] }, NOW)
    await db.cards.update(`${wordId}:produce`, { 'fsrs.scheduled_days': scheduledDays })
  }

  it('시험 결과를 언어별로 쌓는다', async () => {
    await saveExamResult('ja', { takenAt: NOW.toISOString(), grade: 4, correct: 9, total: 10, passed: true })
    expect(await examResults('ja')).toHaveLength(1)
    expect(await examResults('en')).toEqual([])
  })

  it('급수·어휘량·익힌 단어와 볼 수 있는 시험을 한 번에 알려 준다', async () => {
    await saveVocabTest('ja', { takenAt: '2026-11-01T00:00:00.000Z', set: 0, scores: [], estimate: 990, startRank: 1 })
    await learnCard('ja-0001', 30)
    await learnCard('ja-0002', 3)

    expect(await examProgress('ja', NOW)).toEqual({ grade: null, vocab: 991, learned: 1, status: { kind: 'locked', grade: 5, vocabLeft: 0, learnedLeft: 29 } })
    expect((await learnedWords('ja')).map(word => word.id)).toEqual(['ja-0001'])
  })

  it('틀린 단어는 기억 강도는 그대로 두고 카드를 다음 날 0시로 당긴다', async () => {
    await learnCard('ja-0001', 30)
    await db.cards.update('ja-0001:produce', { 'fsrs.due': '2026-12-20T00:00:00.000Z', 'fsrs.stability': 40 })

    await postponeToTomorrow(['ja-0001'], NOW)

    const card = await db.cards.get('ja-0001:produce')
    expect(card?.fsrs.due).toBe(new Date(2026, 10, 6).toISOString())
    expect(card?.fsrs.stability).toBe(40)
  })

  it('이미 기한이 지난 카드는 내일로 미루지 않고 오늘 그대로 둔다', async () => {
    await learnCard('ja-0001', 30)
    await db.cards.update('ja-0001:produce', { 'fsrs.due': '2026-11-01T00:00:00.000Z' })

    await postponeToTomorrow(['ja-0001'], NOW)

    expect((await db.cards.get('ja-0001:produce'))?.fsrs.due).toBe('2026-11-01T00:00:00.000Z')
  })
})
