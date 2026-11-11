import type { Grade } from './schedule'

// 그날 처음 연 때 새 단어 수를 정해 두고, 하루 동안 바꾸지 않는다(카드를 만들수록 복습이 늘어 수가 줄어드는 걸 막는다).
export type DayPlan = { date: string; newWords: number }

export type Step = 'review' | 'make' | 'done'

export const nextStep = (state: { dueCount: number; newWordsLeft: number }): Step => {
  if (state.dueCount > 0) return 'review'
  if (state.newWordsLeft > 0) return 'make'
  return 'done'
}

export const newWordsLeft = (plan: DayPlan, madeToday: number) => Math.max(0, plan.newWords - madeToday)

// 몰랐어가 많았던 날은 끝에 다독여 준다. 몇 장 안 되는 날 한두 번 몰랐다고 다독이면 오히려 어색해서 3번 이상일 때만.
export const isToughDay = (grades: Grade[]) => {
  const misses = grades.filter(grade => grade === 'again').length
  return misses >= 3 && misses / grades.length >= 0.3
}
