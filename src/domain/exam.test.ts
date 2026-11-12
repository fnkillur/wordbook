import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/words'
import { checkAnswer, currentGrade, examStatus, GRADES, vocabLevelText, learnedWordIds, pickQuestions, totalVocab, type ExamResult } from './exam'
import { newStudyCard, type StudyCard } from './schedule'
import type { VocabTestResult } from './vocabTest'

const NOW = new Date('2026-11-10T09:00:00+09:00')

const card = (wordId: string, type: StudyCard['type'], scheduledDays: number, createdAt = '2026-09-01T00:00:00.000Z'): StudyCard => {
  const base = newStudyCard(wordId, type, new Date(createdAt))
  return { ...base, fsrs: { ...base.fsrs, scheduled_days: scheduledDays } }
}

const word = (patch: Partial<WordEntry>): WordEntry => ({
  id: 'ja-0001',
  order: 1,
  theme: '',
  text: '犬',
  reading: 'いぬ',
  kanji: '犬',
  meaningKo: '개',
  hint: '',
  searchQuery: '',
  source: 'base',
  rank: null,
  ...patch,
})

const test = (estimate: number, takenAt = '2026-10-01T00:00:00.000Z'): VocabTestResult => ({ takenAt, set: 0, scores: [], estimate, startRank: 1 })

const result = (grade: number, passed: boolean, takenAt = '2026-11-01T00:00:00.000Z'): ExamResult => ({ takenAt, grade, correct: passed ? 10 : 3, total: 10, passed })

describe('급수표', () => {
  it('급수마다 어휘량·익힌 단어·문제 수·합격 기준이 있다', () => {
    expect(GRADES.map(({ grade, vocab, learned, questions, pass }) => [grade, vocab, learned, questions, pass])).toEqual([
      [5, 500, 30, 10, 8],
      [4, 1000, 100, 10, 8],
      [3, 2000, 300, 15, 12],
      [2, 3000, 600, 20, 16],
      [1, 5000, 1000, 30, 24],
    ])
  })
})

describe('익힌 단어와 어휘량', () => {
  it('그 단어의 모든 카드 간격이 21일 이상이어야 익힌 단어다', () => {
    const cards = [card('ja-0001', 'produce', 30), card('ja-0001', 'listen', 21), card('ja-0002', 'produce', 40), card('ja-0002', 'listen', 20)]
    expect(learnedWordIds(cards)).toEqual(['ja-0001'])
  })

  it('어휘량은 마지막 테스트 추정치에 그 뒤에 만든 단어 중 익힌 단어를 더한다', () => {
    const cards = [card('ja-0001', 'produce', 30, '2026-09-01T00:00:00.000Z'), card('ja-0002', 'produce', 30, '2026-10-05T00:00:00.000Z')]
    expect(totalVocab(test(1200), cards)).toBe(1201)
    expect(totalVocab(null, cards)).toBe(2)
  })
})

describe('지금 급수', () => {
  it('합격한 가장 높은 급수, 없으면 무급(null)이다', () => {
    expect(currentGrade([])).toBeNull()
    expect(currentGrade([result(5, false)])).toBeNull()
    expect(currentGrade([result(4, true), result(2, false), result(3, true)])).toBe(3)
  })
})

describe('어휘량 수준', () => {
  it('어휘량이 넘은 가장 높은 급수와, 그 시험까지 더 익힐 단어 수를 알려 준다', () => {
    expect(vocabLevelText({ vocab: 900, learned: 0, grade: null })).toBe('어휘량으로는 5급 수준이야. 단어 30개를 익히면 5급 시험을 볼 수 있어.')
    expect(vocabLevelText({ vocab: 2400, learned: 120, grade: 5 })).toBe('어휘량으로는 3급 수준이야. 단어 180개를 더 익히면 3급 시험을 볼 수 있어.')
  })

  it('익힌 단어도 채웠으면 바로 볼 수 있다고 알려 준다', () => {
    expect(vocabLevelText({ vocab: 1200, learned: 100, grade: 5 })).toBe('어휘량으로는 4급 수준이야. 지금 4급 시험을 볼 수 있어.')
  })

  it('이미 그 급수 이상을 땄으면 수준만 알려 준다', () => {
    expect(vocabLevelText({ vocab: 1200, learned: 100, grade: 4 })).toBe('어휘량으로는 4급 수준이야.')
    expect(vocabLevelText({ vocab: 1200, learned: 300, grade: 3 })).toBe('어휘량으로는 4급 수준이야.')
  })

  it('5급 어휘량에 못 미치면 남은 어휘량을 알려 준다', () => {
    expect(vocabLevelText({ vocab: 320, learned: 0, grade: null })).toBe('어휘가 180개 더 늘면 5급 수준이야.')
  })
})

describe('볼 수 있는 시험', () => {
  it('두 자격을 채운 가장 높은 급수를 바로 본다', () => {
    expect(examStatus({ vocab: 3200, learned: 650, results: [], now: NOW })).toEqual({ kind: 'ready', grade: 2 })
  })

  it('어휘량이 넘어도 익힌 단어가 모자라면 못 보고, 남은 양을 알려 준다', () => {
    expect(examStatus({ vocab: 3200, learned: 20, results: [], now: NOW })).toEqual({ kind: 'locked', grade: 5, vocabLeft: 0, learnedLeft: 10 })
    expect(examStatus({ vocab: 400, learned: 120, results: [], now: NOW })).toEqual({ kind: 'locked', grade: 5, vocabLeft: 100, learnedLeft: 0 })
  })

  it('이미 딴 급수보다 높은 시험만 보고, 다음 급수까지 남은 양을 알려 준다', () => {
    expect(examStatus({ vocab: 1500, learned: 200, results: [result(4, true)], now: NOW })).toEqual({ kind: 'locked', grade: 3, vocabLeft: 500, learnedLeft: 100 })
  })

  it('오늘 떨어진 급수는 내일 다시 본다', () => {
    const failedToday = result(4, false, '2026-11-10T08:00:00+09:00')
    expect(examStatus({ vocab: 1000, learned: 100, results: [failedToday], now: NOW })).toEqual({ kind: 'retry-tomorrow', grade: 4 })
    expect(examStatus({ vocab: 1000, learned: 100, results: [failedToday], now: new Date('2026-11-11T07:00:00+09:00') })).toEqual({ kind: 'ready', grade: 4 })
  })

  it('1급을 땄으면 더 볼 시험이 없다', () => {
    expect(examStatus({ vocab: 9000, learned: 2000, results: [result(1, true)], now: NOW })).toEqual({ kind: 'top' })
  })
})

describe('문제 고르기', () => {
  it('빈도 순위가 뒤쪽인 어려운 단어 문제 수의 두 배에서 고르고, 기초 단어는 쉬운 쪽으로 친다', () => {
    const words = [
      word({ id: 'ja-0001', source: 'base' }),
      ...[100, 900, 500, 700, 300].map(rank => word({ id: `ja-f${rank}`, source: 'freq', rank })),
    ]
    const picked = pickQuestions(words, 2, () => 0)
    expect(picked).toHaveLength(2)
    picked.forEach(question => expect(['ja-f900', 'ja-f700', 'ja-f500', 'ja-f300']).toContain(question.id))
  })

  it('단어가 모자라면 있는 만큼 낸다', () => {
    expect(pickQuestions([word({})], 10, () => 0)).toHaveLength(1)
  })
})

describe('주관식 채점', () => {
  it('일본어는 한자 표기·히라가나·가타카나 읽기 모두 정답이다', () => {
    const dog = word({})
    expect(checkAnswer(dog, '犬')).toBe('correct')
    expect(checkAnswer(dog, ' いぬ ')).toBe('correct')
    expect(checkAnswer(dog, 'イヌ')).toBe('correct')
    expect(checkAnswer(dog, 'ねこ')).toBe('wrong')
    expect(checkAnswer(dog, '')).toBe('wrong')
  })

  it('읽기가 여럿인 흔한 단어는 다른 읽기로 써도 정답이다', () => {
    const what = word({ id: 'ja-f00004', text: '何', reading: 'なん', kanji: '何', meaningKo: '무엇, 뭐' })
    expect(checkAnswer(what, 'なに')).toBe('correct')
    expect(checkAnswer(word({ id: 'ja-f00100', text: '家', reading: 'いえ', kanji: '家' }), 'うち')).toBe('correct')
    expect(checkAnswer(what, 'なぜ')).toBe('wrong')
  })

  it('영어는 대소문자·공백·문장부호를 무시하고, 네 글자 이상은 한 글자 틀려도 거의 맞았다고 본다', () => {
    const understand = word({ id: 'en-0002', text: 'understand', reading: '', kanji: null })
    expect(checkAnswer(understand, 'Understand.')).toBe('correct')
    expect(checkAnswer(understand, 'understnd')).toBe('almost')
    expect(checkAnswer(understand, 'undrestand')).toBe('wrong')
    expect(checkAnswer(word({ id: 'en-0001', text: 'dog', reading: '', kanji: null }), 'dig')).toBe('wrong')
  })

  it('한 글자 차이라도 다른 영어 단어를 쓴 거면 오타가 아니라 틀린 답이다', () => {
    const house = word({ id: 'en-0300', text: 'house', reading: '', kanji: null })
    expect(checkAnswer(house, 'horse', new Set(['horse', 'house']))).toBe('wrong')
    expect(checkAnswer(house, 'hause', new Set(['horse', 'house']))).toBe('almost')
  })

  it('숫자 단어는 한 글자만 달라도 다른 수라 정확히 같아야 정답이다', () => {
    const thousand = word({ id: 'en-0500', text: '1000', reading: '', kanji: null })
    expect(checkAnswer(thousand, '1000')).toBe('correct')
    expect(checkAnswer(thousand, '100')).toBe('wrong')
    expect(checkAnswer(thousand, '10000')).toBe('wrong')
  })

  it('영어 여러 뜻 단어는 하나만 맞혀도 되고 붙임표·띄어쓰기는 상관없다', () => {
    expect(checkAnswer(word({ id: 'en-0101', text: 'store/shop', reading: '', kanji: null }), 'shop')).toBe('correct')
    expect(checkAnswer(word({ id: 'en-0102', text: 'T-shirt', reading: '', kanji: null }), 't shirt')).toBe('correct')
  })
})
