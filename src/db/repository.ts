import { findWord, WORDS, type WordEntry } from '../data/words'
import { gradeCard, newStudyCard, newWordBudget, type CardType, type Grade } from '../domain/schedule'
import type { DayPlan } from '../domain/session'
import type { Language } from '../platform'
import { db, mediaKey, toBlob, toStoredMedia, type AudioSource, type MediaKind } from './database'

type MakeWordInput = { wordId: string; image: Blob | null; memo: string; cardTypes: CardType[] }

// 이미 만든 단어를 다시 만들면 그림·기억만 바꾼다. 복습 진도·발음·만든 날은 그대로 두고, 없던 카드 종류만 더한다.
export const makeWord = async ({ wordId, image, memo, cardTypes }: MakeWordInput, now: Date) => {
  const at = now.toISOString()
  const stored = image ? await toStoredMedia(image) : null
  await db.transaction('rw', [db.notes, db.media, db.cards, db.wordStates], async () => {
    const existing = await db.notes.get(wordId)
    await db.notes.put(existing ? { ...existing, memo, updatedAt: at } : { wordId, memo, audioSource: null, madeAt: at, updatedAt: at })
    if (stored) await db.media.put({ key: mediaKey(wordId, 'image'), ...stored })
    const owned = new Set((await db.cards.where('wordId').equals(wordId).toArray()).map(card => card.type))
    await db.cards.bulkPut(cardTypes.filter(type => !owned.has(type)).map(type => newStudyCard(wordId, type, now)))
    if (!existing) await db.wordStates.put({ wordId, status: 'made', updatedAt: at })
  })
}

export const markWord = (wordId: string, status: 'known' | 'skipped') => db.wordStates.put({ wordId, status, updatedAt: new Date().toISOString() })

export const recordReview = async (cardId: string, grade: Grade, now: Date) => {
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return
    const result = gradeCard(card, grade, now)
    await db.cards.put(result.card)
    await db.reviewLogs.add(result.log)
  })
}

export const setAudio = async (wordId: string, audio: Blob, source: AudioSource) => {
  const stored = await toStoredMedia(audio)
  await db.transaction('rw', db.notes, db.media, async () => {
    await db.media.put({ key: mediaKey(wordId, 'audio'), ...stored })
    await db.notes.update(wordId, { audioSource: source, updatedAt: new Date().toISOString() })
  })
}

export const getMedia = async (wordId: string, kind: MediaKind) => {
  const media = await db.media.get(mediaKey(wordId, kind))
  return media ? toBlob(media) : null
}

export const todaysWords = async (language: Language, budget: number) => {
  if (budget <= 0) return []
  const touched = new Set((await db.wordStates.toArray()).map(state => state.wordId))
  return WORDS[language].filter(word => !touched.has(word.id)).slice(0, budget)
}

const pad = (value: number) => String(value).padStart(2, '0')

export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const planKey = (now: Date) => `plan:${dateKey(now)}`

// 읽기만 하는 버전. 화면의 실시간 조회(읽기 전용) 안에서 쓴다.
export const peekDayPlan = async (now: Date, goalMinutes: number): Promise<DayPlan> => {
  const saved = await db.settings.get(planKey(now))
  if (saved) return saved.value as DayPlan
  return { date: dateKey(now), newWords: newWordBudget(await db.cards.toArray(), now, goalMinutes) }
}

export const dayPlan = async (now: Date, goalMinutes: number) => {
  const plan = await peekDayPlan(now, goalMinutes)
  await db.settings.put({ key: planKey(now), value: plan })
  return plan
}

export const madeCountOn = async (now: Date) =>
  (await db.wordStates.where('status').equals('made').toArray()).filter(state => dateKey(new Date(state.updatedAt)) === dateKey(now)).length

export const silentWordIds = async () => new Set((await db.notes.filter(note => note.audioSource === null).toArray()).map(note => note.wordId))

// 발음을 받지 못한 단어(서버 연결 전이나 실패)를 차례로 다시 받는다. 실패하면 멈추고 다음 기회에 이어서 받는다.
export const fillMissingAudio = async (fetchAudio: (word: WordEntry) => Promise<Blob>) => {
  let filled = 0
  for (const wordId of await silentWordIds()) {
    const word = findWord(wordId)
    if (!word) continue
    try {
      await setAudio(wordId, await fetchAudio(word), 'tts')
      filled += 1
    } catch {
      break
    }
  }
  return filled
}
