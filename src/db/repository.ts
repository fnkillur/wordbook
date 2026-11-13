import { sentenceAudioKind, sentencesOf, sentenceTextOf, type Sentence } from '../data/sentences'
import { findWord, WORDS, type WordEntry } from '../data/words'
import { gradeCard, newStudyCard, newWordBudget, startOfNextDay, type CardType, type Grade, type StudyCard } from '../domain/schedule'
import { currentGrade, examStatus, learnedWordIds, totalVocab, type ExamResult } from '../domain/exam'
import type { DayPlan } from '../domain/session'
import type { VocabTestResult } from '../domain/vocabTest'
import { earnedOf, goalCoin, makeCoin, reviewCoin } from '../domain/wallet'
import type { Language } from '../platform'
import { db, mediaKey, toBlob, toStoredMedia, type AudioSource, type MediaKind } from './database'

type MakeWordInput = { wordId: string; image: Blob | null; memo: string; cardTypes: CardType[] }

// 이미 만든 단어를 다시 만들면 그림·기억만 바꾼다. 복습 진도·발음·만든 날은 그대로 두고, 없던 카드 종류만 더한다.
export const makeWord = async ({ wordId, image, memo, cardTypes }: MakeWordInput, now: Date) => {
  const at = now.toISOString()
  const stored = image ? await toStoredMedia(image) : null
  await db.transaction('rw', [db.notes, db.media, db.cards, db.wordStates, db.coins], async () => {
    const existing = await db.notes.get(wordId)
    await db.notes.put(existing ? { ...existing, memo, updatedAt: at } : { wordId, memo, audioSource: null, madeAt: at, updatedAt: at })
    if (stored) await db.media.put({ key: mediaKey(wordId, 'image'), ...stored })
    const owned = new Set((await db.cards.where('wordId').equals(wordId).toArray()).map(card => card.type))
    await db.cards.bulkPut(cardTypes.filter(type => !owned.has(type)).map(type => newStudyCard(wordId, type, now)))
    if (existing) return
    await db.wordStates.put({ wordId, status: 'made', updatedAt: at })
    await db.coins.put(makeCoin(wordId, at))
  })
}

const languageOfWord = (wordId: string): Language => (wordId.startsWith('en-') ? 'en' : 'ja')

// 단어 데이터에 없는 카드(다른 판의 백업, 빠진 학습 단어)는 보여 줄 수 없으니 세지도 않는다.
// 언어를 주면 그 언어 카드만 고른다. 오늘 할 양과 복습은 지금 배우는 언어만 센다.
export const knownCards = async (language?: Language) =>
  (await db.cards.toArray()).filter(card => findWord(card.wordId) && (!language || languageOfWord(card.wordId) === language))

export const markWord = (wordId: string, status: 'known' | 'skipped') => db.wordStates.put({ wordId, status, updatedAt: new Date().toISOString() })

export const unmarkWord = (wordId: string) => db.wordStates.delete(wordId)

export const markWords = (wordIds: string[], status: 'known' | 'skipped') => {
  const updatedAt = new Date().toISOString()
  return db.wordStates.bulkPut(wordIds.map(wordId => ({ wordId, status, updatedAt })))
}

// 플루언트 포에버의 "카드 한 장에 새것 하나": 빈칸 문장 카드는 단어를 처음 알았어로 떠올린 다음 날부터 낸다.
const shouldAddCloze = async (card: StudyCard, grade: Grade) => {
  if (grade !== 'good' || card.type === 'cloze' || sentencesOf(card.wordId).length === 0) return false
  return !(await db.cards.get(`${card.wordId}:cloze`))
}

// 빈칸 카드를 새로 만들었으면 그 단어 id를 돌려준다(문장 음성을 준비하라는 뜻).
export const recordReview = async (cardId: string, grade: Grade, now: Date) =>
  db.transaction('rw', db.cards, db.reviewLogs, db.coins, async () => {
    const card = await db.cards.get(cardId)
    if (!card) return null
    const result = gradeCard(card, grade, now)
    await db.cards.put(result.card)
    await db.reviewLogs.add(result.log)
    await db.coins.put(reviewCoin(result.log))
    if (!(await shouldAddCloze(card, grade))) return null
    await db.cards.put(newStudyCard(card.wordId, 'cloze', now, startOfNextDay(now)))
    return card.wordId
  })

export const setAudio = async (wordId: string, audio: Blob, source: AudioSource) => {
  const stored = await toStoredMedia(audio)
  await db.transaction('rw', db.notes, db.media, async () => {
    await db.media.put({ key: mediaKey(wordId, 'audio'), ...stored })
    await db.notes.update(wordId, { audioSource: source, updatedAt: new Date().toISOString() })
  })
}

// sentence를 주지 않으면 그 단어의 첫 문장 음성으로 저장한다.
export const setSentenceAudio = async (wordId: string, audio: Blob, sentence: Sentence | undefined = sentencesOf(wordId)[0]) =>
  db.media.put({ key: mediaKey(wordId, sentence ? sentenceAudioKind(sentence) : 'sentence'), ...(await toStoredMedia(audio)) })

// 원어민 녹음이 잘렸거나 이상하다고 제보한 것. 그 녹음은 앱에서 TTS로 바꿔 읽고, 모은 목록을 복사해 녹음 목록에서 뺀다.
export type AudioReport = { wordId: string; audioPath: string; text: string; reportedAt: string }

const AUDIO_REPORTS_KEY = 'audioReports'

export const audioReports = async () => ((await db.settings.get(AUDIO_REPORTS_KEY))?.value as AudioReport[] | undefined) ?? []

export const reportSentenceAudio = async (wordId: string, sentence: Sentence, now: Date) => {
  const { audioPath } = sentence
  if (!audioPath) return
  const reports = await audioReports()
  if (reports.some(report => report.audioPath === audioPath)) return
  await db.settings.put({ key: AUDIO_REPORTS_KEY, value: [...reports, { wordId, audioPath, text: sentenceTextOf(sentence), reportedAt: now.toISOString() }] })
}

export const clearAudioReports = () => db.settings.delete(AUDIO_REPORTS_KEY)

// 제보한 녹음은 없는 것으로 보고 TTS로 읽는다. 저장 이름도 TTS 쪽으로 바뀌어 다시 받는다.
export const withoutReportedAudio = (sentence: Sentence, reportedPaths: Set<string>) =>
  sentence.audioPath && reportedPaths.has(sentence.audioPath) ? { ...sentence, audioPath: null } : sentence

export const reportedAudioPaths = async () => new Set((await audioReports()).map(report => report.audioPath))

// 단어의 첫 문장 음성을 받았는지 본다. 활용형 문장만 있는 동사는 첫 활용형 문장의 이름으로 저장된다.
const firstSentenceKey = (wordId: string) => {
  const [first] = sentencesOf(wordId)
  return mediaKey(wordId, first ? sentenceAudioKind(first) : 'sentence')
}

export const wordsMissingSentenceAudio = async () => {
  const wordIds = (await db.cards.filter(card => card.type === 'cloze').toArray()).map(card => card.wordId)
  const stored = new Set(await db.media.where('key').anyOf(wordIds.map(firstSentenceKey)).primaryKeys())
  return wordIds.filter(wordId => !stored.has(firstSentenceKey(wordId)))
}

export const getMedia = async (wordId: string, kind: MediaKind) => {
  const media = await db.media.get(mediaKey(wordId, kind))
  return media ? toBlob(media) : null
}

const untouchedWords = async (language: Language) => {
  const touched = new Set((await db.wordStates.toArray()).map(state => state.wordId))
  return WORDS[language].filter(word => !touched.has(word.id))
}

// 나중에 하기로 넘긴 단어는 오래전에 넘긴 것부터 다시 낸다.
const skippedWords = async (language: Language) => {
  const byId = new Map(WORDS[language].map(word => [word.id, word]))
  const skipped = await db.wordStates.where('status').equals('skipped').toArray()
  return skipped.sort((first, second) => first.updatedAt.localeCompare(second.updatedAt)).flatMap(state => byId.get(state.wordId) ?? [])
}

const freqFrom = (words: WordEntry[], startRank: number) =>
  words.filter(word => word.source === 'freq' && (word.rank ?? 0) >= startRank).sort((first, second) => (first.rank ?? 0) - (second.rank ?? 0))

// 어휘량 테스트로 시작 위치를 정했으면 그 순위부터 회화 빈도 단어를, 다 쓰면 남은 기초 단어를, 그다음 넘겨 둔 단어를 낸다.
export const todaysWords = async (language: Language, budget: number) => {
  if (budget <= 0) return []
  const words = await untouchedWords(language)
  const base = words.filter(word => word.source === 'base')
  const startRank = await startRankOf(language)
  const fresh = startRank === null ? base : [...freqFrom(words, startRank), ...base]
  if (fresh.length >= budget) return fresh.slice(0, budget)
  return [...fresh, ...(await skippedWords(language))].slice(0, budget)
}

export const freqWordsLeft = async (language: Language) => {
  const startRank = await startRankOf(language)
  if (startRank === null) return null
  return freqFrom(await untouchedWords(language), startRank).length
}

const pad = (value: number) => String(value).padStart(2, '0')

export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const planKey = (now: Date, language: Language) => `plan:${dateKey(now)}:${language}`

// 읽기만 하는 버전. 화면의 실시간 조회(읽기 전용) 안에서 쓴다.
export const peekDayPlan = async (now: Date, goalMinutes: number, language: Language): Promise<DayPlan> => {
  const saved = await db.settings.get(planKey(now, language))
  if (saved) return saved.value as DayPlan
  return { date: dateKey(now), newWords: newWordBudget(await knownCards(language), now, goalMinutes) }
}

export const dayPlan = async (now: Date, goalMinutes: number, language: Language) => {
  const plan = await peekDayPlan(now, goalMinutes, language)
  await db.settings.put({ key: planKey(now, language), value: plan })
  return plan
}

export const madeCountOn = async (now: Date, language: Language) =>
  (await db.wordStates.where('status').equals('made').toArray()).filter(state => languageOfWord(state.wordId) === language && dateKey(new Date(state.updatedAt)) === dateKey(now)).length

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

export const vocabTests = async (language: Language) => ((await db.settings.get(`vocabTests:${language}`))?.value as VocabTestResult[] | undefined) ?? []

export const saveVocabTest = async (language: Language, result: VocabTestResult) =>
  db.settings.put({ key: `vocabTests:${language}`, value: [...(await vocabTests(language)), result] })

export const startRankOf = async (language: Language) => ((await db.settings.get(`startRank:${language}`))?.value as number | undefined) ?? null

export const setStartRank = (language: Language, rank: number) => db.settings.put({ key: `startRank:${language}`, value: rank })

export const earnedTotal = async () => earnedOf(await db.coins.toArray())

// 예전 상점에서 산 물건. 도감에서는 보수가 모자라도 열린 것으로 친다.
export const ownedItemIds = async () => (await db.coins.where('kind').equals('buy').toArray()).map(coin => coin.id.slice('buy:'.length))

// 오늘 할 양을 다 했을 때 하루 한 번. 오늘 복습하거나 만든 게 하나도 없으면 주지 않는다.
export const claimGoalBonus = (now: Date) =>
  db.transaction('rw', db.coins, async () => {
    const today = dateKey(now)
    const bonus = goalCoin(today, now.toISOString())
    if (await db.coins.get(bonus.id)) return false
    const earned = await db.coins.where('kind').anyOf('review', 'make').filter(coin => dateKey(new Date(coin.at)) === today).count()
    if (earned === 0) return false
    await db.coins.put(bonus)
    return true
  })

export const examResults = async (language: Language) => ((await db.settings.get(`exams:${language}`))?.value as ExamResult[] | undefined) ?? []

export const saveExamResult = async (language: Language, result: ExamResult) =>
  db.settings.put({ key: `exams:${language}`, value: [...(await examResults(language)), result] })

export const learnedWords = async (language: Language) => learnedWordIds(await knownCards(language)).flatMap(wordId => findWord(wordId) ?? [])

export const examProgress = async (language: Language, now: Date) => {
  const cards = await knownCards(language)
  const results = await examResults(language)
  const vocab = totalVocab((await vocabTests(language)).at(-1) ?? null, cards)
  const learned = learnedWordIds(cards).length
  return { grade: currentGrade(results), vocab, learned, status: examStatus({ vocab, learned, results, now }) }
}

// 시험에서 틀린 단어는 기억 강도는 그대로 두고 늦어도 다음 날 복습에 다시 낸다. 이미 기한이 지난 카드는 그대로 오늘 나온다.
export const postponeToTomorrow = async (wordIds: string[], now: Date) => {
  const tomorrow = startOfNextDay(now).toISOString()
  const cards = await db.cards.where('wordId').anyOf(wordIds).toArray()
  await db.cards.bulkPut(cards.map(card => ({ ...card, fsrs: { ...card.fsrs, due: card.fsrs.due < tomorrow ? card.fsrs.due : tomorrow } })))
}
