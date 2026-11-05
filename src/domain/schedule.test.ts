import { describe, expect, it } from 'vitest'
import { gradeCard, newStudyCard, newWordBudget, todayQueue, type StudyCard } from './schedule'

const NOW = new Date('2026-11-05T09:00:00+09:00')
const minutesLater = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)
const dueAt = (card: StudyCard) => new Date(card.fsrs.due)

const dueCard = (wordId: string, type: StudyCard['type'], minutesAgo: number): StudyCard => {
  const card = newStudyCard(wordId, type, NOW)
  return { ...card, fsrs: { ...card.fsrs, due: minutesLater(NOW, -minutesAgo).toISOString() } }
}

describe('gradeCard', () => {
  it('몰랐어요는 10분 안에 다시 나온다', () => {
    const { card } = gradeCard(newStudyCard('ja-0001', 'produce', NOW), 'again', NOW)
    expect(dueAt(card).getTime()).toBeLessThanOrEqual(minutesLater(NOW, 10).getTime())
  })

  it('알았어요를 이어서 두 번 하면 하루 이상 뒤로 간다', () => {
    const first = gradeCard(newStudyCard('ja-0001', 'produce', NOW), 'good', NOW).card
    const second = gradeCard(first, 'good', dueAt(first)).card
    expect(dueAt(second).getTime()).toBeGreaterThanOrEqual(minutesLater(dueAt(first), 24 * 60).getTime())
  })

  it('카드를 저장할 수 있는 모양(문자열 날짜)으로 돌려주고 기록을 남긴다', () => {
    const { card, log } = gradeCard(newStudyCard('ja-0001', 'produce', NOW), 'good', NOW)
    expect(typeof card.fsrs.due).toBe('string')
    expect(log).toMatchObject({ cardId: card.id, grade: 'good', at: NOW.toISOString() })
  })
})

describe('todayQueue', () => {
  it('기한이 된 카드만, 오래 밀린 순으로 낸다', () => {
    const cards = [dueCard('ja-0001', 'produce', 5), dueCard('ja-0002', 'produce', 60), dueCard('ja-0003', 'produce', -30)]
    expect(todayQueue(cards, NOW, { soundOff: false }).map(card => card.wordId)).toEqual(['ja-0002', 'ja-0001'])
  })

  it('같은 단어의 카드는 연달아 내지 않는다', () => {
    const cards = [dueCard('ja-0001', 'produce', 30), dueCard('ja-0001', 'recognize', 29), dueCard('ja-0002', 'produce', 28)]
    expect(todayQueue(cards, NOW, { soundOff: false }).map(card => card.wordId)).toEqual(['ja-0001', 'ja-0002', 'ja-0001'])
  })

  it('기한이 같으면 그림 → 글자 → 소리 → 철자 카드 순으로 낸다', () => {
    const cards = (['spell', 'listen', 'recognize', 'produce'] as const).map((type, index) => dueCard(`ja-000${index}`, type, 10))
    expect(todayQueue(cards, NOW, { soundOff: false }).map(card => card.type)).toEqual(['produce', 'recognize', 'listen', 'spell'])
  })

  it('방금 만든 단어 여러 개의 카드도 같은 단어가 연달아 나오지 않게 섞는다', () => {
    // 단어를 하나씩 만들어서 먼저 만든 단어의 기한이 더 이르다.
    const cards = ['ja-0001', 'ja-0002', 'ja-0003'].flatMap((wordId, index) => (['produce', 'recognize', 'listen'] as const).map(type => dueCard(wordId, type, 30 - index * 10)))
    const queue = todayQueue(cards, NOW, { soundOff: false }).map(card => card.wordId)

    expect(queue).toHaveLength(9)
    expect(queue.some((wordId, index) => wordId === queue[index - 1])).toBe(false)
  })

  it('한 단어 카드만 남으면 연달아 내지 않고 다음 번으로 미룬다', () => {
    const cards = (['produce', 'recognize', 'listen'] as const).map(type => dueCard('ja-0001', type, 5))
    expect(todayQueue(cards, NOW, { soundOff: false }).map(card => card.type)).toEqual(['produce'])
  })

  it('발음이 아직 없는 단어는 소리·철자 카드를 빼고 낸다', () => {
    const cards = [dueCard('ja-0001', 'listen', 30), dueCard('ja-0001', 'spell', 25), dueCard('ja-0002', 'listen', 20), dueCard('ja-0003', 'produce', 10)]
    const queue = todayQueue(cards, NOW, { soundOff: false, silentWords: new Set(['ja-0001']) })
    expect(queue.map(card => card.id)).toEqual(['ja-0002:listen', 'ja-0003:produce'])
  })

  it('소리 없이 보기면 소리만 듣는 카드를 뺀다', () => {
    const cards = [dueCard('ja-0001', 'listen', 30), dueCard('ja-0002', 'produce', 20)]
    expect(todayQueue(cards, NOW, { soundOff: true }).map(card => card.type)).toEqual(['produce'])
  })
})

describe('newWordBudget', () => {
  it('하루 목표에서 오늘 복습 시간을 빼고 남은 만큼(최대 10개) 새 단어를 준다', () => {
    expect(newWordBudget([], NOW, 15)).toBe(10)
    const reviews = Array.from({ length: 60 }, (_, index) => dueCard(`ja-${index}`, 'produce', 10))
    expect(newWordBudget(reviews, NOW, 15)).toBe(4)
  })

  it('복습만으로 목표를 넘으면 새 단어는 없다', () => {
    const reviews = Array.from({ length: 120 }, (_, index) => dueCard(`ja-${index}`, 'produce', 10))
    expect(newWordBudget(reviews, NOW, 15)).toBe(0)
  })
})
