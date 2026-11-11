import { findSentence } from '../data/sentences'
import { WORDS } from '../data/words'
import { db } from '../db/database'
import { makeWord, saveVocabTest } from '../db/repository'
import { newStudyCard, startOfNextDay } from '../domain/schedule'
import type { Language } from '../platform'
import { learningLanguage } from '../settings'
import { prepareSentenceAudio } from '../sync/sentenceAudio'

// 폰에서 복습 흐름을 손으로 시험해 볼 때만 .env.android.local의 VITE_DEMO_DATA로 켠다.
// seed는 처음 연 때 한 번 시험용 단어를 넣고, cloze는 거기에 더해 오늘 할 카드를 단어 카드와 빈칸 카드가 번갈아 나오게 한다.
// reset은 설정만 남기고 앱 데이터를 모두 지워 처음 설치한 상태로 되돌린다.
const SEEDED_KEY = 'wordbook.demoSeeded'
// 한 번만 지우려고 남기는 표시. 예전에 초기화한 폰도 다시 지워지게 이름에 판을 붙인다.
const RESET_KEY = 'wordbook.demoReset.v2'
const SETTINGS_KEY = 'wordbook.settings'
const CLOZE_SEEDED_KEY = 'wordbook.demoClozeSeeded'
const CLOZE_FOCUSED_KEY = 'wordbook.demoClozeFocused.v6'
const DEMO_CLOZE_WORDS = 3
const DEMO_WORDS = 6
const DEMO_COINS = 1000

const DAY_MS = 24 * 60 * 60 * 1000

export const seedDemoData = async (language: Language, now: Date, makeImage: (text: string) => Promise<Blob | null>) => {
  if (localStorage.getItem(SEEDED_KEY)) return
  localStorage.setItem(SEEDED_KEY, now.toISOString())
  const yesterday = new Date(now.getTime() - DAY_MS)
  // 이미 직접 만든 단어는 그림·기억을 덮어쓰지 않게 건너뛴다. 그림 대신 뜻을 적은 판을 넣어 답이 그림에 보이지 않게 한다.
  const made = new Set(await db.notes.toCollection().primaryKeys())
  const words = WORDS[language].filter(word => !made.has(word.id)).slice(0, DEMO_WORDS)
  for (const [index, word] of words.entries()) {
    await makeWord({ wordId: word.id, image: await makeImage(word.meaningKo), memo: `시험용 단어 ${index + 1}`, cardTypes: ['produce', 'recognize'] }, yesterday)
  }
  await saveVocabTest(language, { takenAt: yesterday.toISOString(), set: 0, scores: [], estimate: 0, startRank: 1 })
  await db.coins.put({ id: 'demo:coins', kind: 'make', amount: DEMO_COINS, at: yesterday.toISOString() })
}

// 빈칸 카드는 단어를 처음 알았어로 맞힌 다음 날에야 나와서, 시험용으로는 문장 있는 회화 단어에 오늘 나오는 빈칸 카드를 바로 넣는다.
// 테스트 데이터를 이미 넣은 폰에도 더할 수 있게 표시를 따로 둔다.
export const seedDemoCloze = async (language: Language, now: Date, makeImage: (text: string) => Promise<Blob | null>) => {
  if (localStorage.getItem(CLOZE_SEEDED_KEY)) return []
  localStorage.setItem(CLOZE_SEEDED_KEY, now.toISOString())
  const yesterday = new Date(now.getTime() - DAY_MS)
  const made = new Set(await db.notes.toCollection().primaryKeys())
  const words = WORDS[language].filter(word => word.source === 'freq' && findSentence(word.id) && !made.has(word.id)).slice(0, DEMO_CLOZE_WORDS)
  for (const word of words) {
    await makeWord({ wordId: word.id, image: await makeImage(word.meaningKo), memo: '시험용 빈칸 단어', cardTypes: ['produce'] }, yesterday)
    await db.cards.put(newStudyCard(word.id, 'cloze', yesterday))
  }
  return words.map(word => word.id)
}

// 단어 카드와 빈칸 카드가 섞여 나오는 흐름을 손으로 넘겨 보려고, 한 번만 빈칸 카드와 다른 단어의 단어 카드를
// 같은 수만큼 번갈아 지금 나오게 하고, 오늘 나올 나머지 카드는 내일로 미룬다.
export const focusDemoCloze = async (now: Date) => {
  if (localStorage.getItem(CLOZE_FOCUSED_KEY)) return
  localStorage.setItem(CLOZE_FOCUSED_KEY, now.toISOString())
  const tomorrow = startOfNextDay(now)
  const cards = await db.cards.toArray()
  const clozeCards = cards.filter(card => card.type === 'cloze')
  const clozeWords = new Set(clozeCards.map(card => card.wordId))
  const wordCards = [...new Map(cards.filter(card => !clozeWords.has(card.wordId)).map(card => [card.wordId, card])).values()].slice(0, clozeCards.length)
  const mixed = clozeCards.flatMap((card, index) => (wordCards[index] ? [wordCards[index], card] : [card]))
  // 기한이 이른 카드부터 나오므로, 섞은 순서대로 1분씩 앞당겨 둔다.
  const dueOf = new Map(mixed.map((card, index) => [card.id, new Date(now.getTime() - (mixed.length - index) * 60_000).toISOString()]))
  await db.transaction('rw', db.cards, async () => {
    for (const card of cards) {
      const due = dueOf.get(card.id)
      if (due) await db.cards.put({ ...card, fsrs: { ...card.fsrs, due } })
      else if (new Date(card.fsrs.due) < tomorrow) await db.cards.put({ ...card, fsrs: { ...card.fsrs, due: tomorrow.toISOString() } })
    }
  })
}

// 서버 연결·누구·하루 목표 같은 설정은 남겨서 연결 코드를 다시 넣지 않게 한다.
const resetAllData = async () => {
  if (localStorage.getItem(RESET_KEY)) return
  const settings = localStorage.getItem(SETTINGS_KEY)
  await db.delete()
  localStorage.clear()
  if (settings) localStorage.setItem(SETTINGS_KEY, settings)
  localStorage.setItem(RESET_KEY, new Date().toISOString())
  location.reload()
}

const wordImage = (text: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 600
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  context.fillStyle = '#c6cbdd'
  context.fillRect(0, 0, 600, 600)
  context.fillStyle = '#3d2b26'
  context.font = 'bold 96px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 300, 300)
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
}

export const runDemoMode = async (mode: string | undefined) => {
  if (mode === 'seed') {
    await seedDemoData(learningLanguage(), new Date(), wordImage)
    const clozeWords = await seedDemoCloze(learningLanguage(), new Date(), wordImage)
    clozeWords.forEach(wordId => prepareSentenceAudio(wordId))
  }
  if (mode === 'cloze') {
    await runDemoMode('seed')
    await focusDemoCloze(new Date())
  }
  if (mode === 'reset') await resetAllData()
}
