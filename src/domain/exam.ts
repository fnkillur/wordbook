import type { WordEntry } from '../data/words'
import type { StudyCard } from './schedule'
import type { VocabTestResult } from './vocabTest'

// 제초 검정 급수표. 전체 어휘량과 앱에서 익힌 단어를 다 채워야 볼 수 있고, 높을수록 길고 깐깐하다.
// 1급(어휘 5,000)이 외국인과 프리토킹이 되는 수준이다. 처음은 무급이고 5급부터 시험으로 딴다.
export const GRADES = [
  { grade: 5, vocab: 500, learned: 30, questions: 10, pass: 8 },
  { grade: 4, vocab: 1000, learned: 100, questions: 10, pass: 8 },
  { grade: 3, vocab: 2000, learned: 300, questions: 15, pass: 12 },
  { grade: 2, vocab: 3000, learned: 600, questions: 20, pass: 16 },
  { grade: 1, vocab: 5000, learned: 1000, questions: 30, pass: 24 },
]

const LEARNED_DAYS = 21

export type ExamResult = { takenAt: string; grade: number; correct: number; total: number; passed: boolean }

export type ExamStatus =
  | { kind: 'ready'; grade: number }
  | { kind: 'retry-tomorrow'; grade: number }
  | { kind: 'locked'; grade: number; vocabLeft: number; learnedLeft: number }
  | { kind: 'top' }

export type Answer = 'correct' | 'almost' | 'wrong'

export const gradeRule = (grade: number) => GRADES.find(rule => rule.grade === grade) ?? null

const cardsByWord = (cards: StudyCard[]) => {
  const byWord = new Map<string, StudyCard[]>()
  cards.forEach(card => byWord.set(card.wordId, [...(byWord.get(card.wordId) ?? []), card]))
  return byWord
}

// 익힌 단어: 그 단어의 모든 카드 복습 간격이 21일 이상.
export const learnedWordIds = (cards: StudyCard[]) =>
  [...cardsByWord(cards)].filter(([, wordCards]) => wordCards.every(card => card.fsrs.scheduled_days >= LEARNED_DAYS)).map(([wordId]) => wordId)

// 테스트를 다시 보면 그때까지 익힌 단어는 추정치에 들어가므로, 테스트 뒤에 만든 단어만 더한다.
export const totalVocab = (lastTest: VocabTestResult | null, cards: StudyCard[]) => {
  const learned = learnedWordIds(cards)
  if (!lastTest) return learned.length
  const byWord = cardsByWord(cards)
  const madeAfterTest = (wordId: string) => (byWord.get(wordId) ?? []).every(card => card.createdAt > lastTest.takenAt)
  return lastTest.estimate + learned.filter(madeAfterTest).length
}

// 합격한 가장 높은 급수. 없으면 무급(null).
export const currentGrade = (results: ExamResult[]) => {
  const passed = results.filter(result => result.passed).map(result => result.grade)
  return passed.length > 0 ? Math.min(...passed) : null
}

export const gradeLabel = (grade: number | null) => (grade === null ? '급수 없음' : `${grade}급`)

const isSameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString()

type StatusInput = { vocab: number; learned: number; results: ExamResult[]; now: Date }

// 딴 급수보다 높은 것 중 두 자격을 다 채운 가장 높은 급수를 바로 본다. 오늘 떨어졌으면 내일 다시 본다.
export const examStatus = ({ vocab, learned, results, now }: StatusInput): ExamStatus => {
  const current = currentGrade(results)
  const higher = GRADES.filter(rule => current === null || rule.grade < current)
  if (higher.length === 0) return { kind: 'top' }
  const target = higher.filter(rule => vocab >= rule.vocab && learned >= rule.learned).at(-1)
  if (!target) {
    const [next] = higher
    return { kind: 'locked', grade: next.grade, vocabLeft: Math.max(0, next.vocab - vocab), learnedLeft: Math.max(0, next.learned - learned) }
  }
  const failedToday = results.some(result => result.grade === target.grade && !result.passed && isSameDay(new Date(result.takenAt), now))
  return failedToday ? { kind: 'retry-tomorrow', grade: target.grade } : { kind: 'ready', grade: target.grade }
}

// 기초 단어는 회화 빈도 단어보다 쉬운 쪽으로 친다.
const difficultyOf = (word: WordEntry) => (word.source === 'freq' ? (word.rank ?? 0) : -1)

// 어려운 쪽 문제 수의 두 배에서 무작위로 고른다. 쉬운 단어만 나와 합격하지 않게 한다.
export const pickQuestions = (words: WordEntry[], count: number, random: () => number = Math.random) => {
  const pool = [...words].sort((first, second) => difficultyOf(second) - difficultyOf(first)).slice(0, count * 2)
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const picked = pool[swap]
    pool[swap] = pool[index]
    pool[index] = picked
  }
  return pool.slice(0, count)
}

const KATAKANA_TO_HIRAGANA = 0x60

const toHiragana = (text: string) => text.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - KATAKANA_TO_HIRAGANA))

const normalizeJapanese = (text: string) => toHiragana(text.normalize('NFKC').replace(/[\s〜～]/g, ''))

const normalizeEnglish = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      previous[column] = Math.min(above + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[right.length]
}

const ALMOST_MIN_LENGTH = 4

// 철자 시험이 되지 않게: 일본어는 한자·읽기 어느 쪽이든, 영어는 여러 뜻 중 하나만 맞혀도 되고 긴 단어는 한 글자 틀림까지 봐준다.
export const checkAnswer = (word: WordEntry, input: string): Answer => {
  if (word.id.startsWith('ja-')) {
    const answer = normalizeJapanese(input)
    if (!answer) return 'wrong'
    const accepted = [word.text, word.kanji, word.reading].filter((value): value is string => !!value).map(normalizeJapanese)
    return accepted.includes(answer) ? 'correct' : 'wrong'
  }
  const answer = normalizeEnglish(input)
  if (!answer) return 'wrong'
  const accepted = word.text.split('/').map(normalizeEnglish)
  if (accepted.includes(answer)) return 'correct'
  // 숫자는 한 글자만 달라도 다른 수(100·1000)라 봐주지 않는다.
  const isLenient = (option: string) => option.length >= ALMOST_MIN_LENGTH && !/^\d+$/.test(option)
  return accepted.some(option => isLenient(option) && editDistance(option, answer) === 1) ? 'almost' : 'wrong'
}
