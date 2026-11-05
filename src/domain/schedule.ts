import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs'

export type CardType = 'produce' | 'recognize' | 'listen' | 'spell'
export type Grade = 'again' | 'good'

// ts-fsrs 카드를 IndexedDB·백업 파일에 그대로 담을 수 있게 날짜를 문자열로 바꾼 모양.
export type FsrsState = Omit<Card, 'due' | 'last_review'> & { due: string; last_review: string | null }

export type StudyCard = { id: string; wordId: string; type: CardType; fsrs: FsrsState; createdAt: string }

export type ReviewLog = { cardId: string; grade: Grade; at: string }

const TYPE_ORDER: CardType[] = ['produce', 'recognize', 'listen', 'spell']

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

// 하루 목표 시간을 나눌 때 쓰는 대략의 시간. 복습 한 장, 새 단어 하나(카드 만들기 포함).
const REVIEW_SECONDS = 8
const NEW_WORD_SECONDS = 90
const MAX_NEW_WORDS = 10

const toState = (card: Card): FsrsState => ({
  ...card,
  due: card.due.toISOString(),
  last_review: card.last_review ? card.last_review.toISOString() : null,
})

const fromState = (state: FsrsState): Card => ({
  ...state,
  due: new Date(state.due),
  last_review: state.last_review ? new Date(state.last_review) : undefined,
})

export const newStudyCard = (wordId: string, type: CardType, now: Date): StudyCard => ({
  id: `${wordId}:${type}`,
  wordId,
  type,
  fsrs: toState(createEmptyCard(now)),
  createdAt: now.toISOString(),
})

export const gradeCard = (card: StudyCard, grade: Grade, now: Date): { card: StudyCard; log: ReviewLog } => {
  const next = scheduler.next(fromState(card.fsrs), now, grade === 'again' ? Rating.Again : Rating.Good)
  return { card: { ...card, fsrs: toState(next.card) }, log: { cardId: card.id, grade, at: now.toISOString() } }
}

// 같은 단어의 카드끼리는 서로 답이 되므로 연달아 내지 않는다. 남은 카드가 많은 단어부터 번갈아 내고,
// 한 단어의 카드만 남으면 나머지는 다음 번으로 미룬다.
const spreadByWord = (cards: StudyCard[]) => {
  const rest = [...cards]
  const ordered: StudyCard[] = []
  while (rest.length > 0) {
    const previous = ordered.at(-1)?.wordId
    const remaining = new Map<string, number>()
    rest.forEach(card => remaining.set(card.wordId, (remaining.get(card.wordId) ?? 0) + 1))
    const index = rest.reduce<number>((best, card, current) => {
      if (card.wordId === previous) return best
      if (best === -1) return current
      return remaining.get(card.wordId)! > remaining.get(rest[best].wordId)! ? current : best
    }, -1)
    if (index === -1) break
    ordered.push(...rest.splice(index, 1))
  }
  return ordered
}

const SOUND_TYPES: CardType[] = ['listen', 'spell']

// silentWords: 발음을 아직 받지 못한 단어. 소리로 묻는 카드는 발음이 생길 때까지 뺀다.
type QueueOptions = { soundOff: boolean; silentWords?: Set<string> }

export const todayQueue = (cards: StudyCard[], now: Date, options: QueueOptions) =>
  spreadByWord(
    cards
      .filter(card => new Date(card.fsrs.due) <= now)
      .filter(card => !(options.soundOff && card.type === 'listen'))
      .filter(card => !(options.silentWords?.has(card.wordId) && SOUND_TYPES.includes(card.type)))
      .sort((left, right) => left.fsrs.due.localeCompare(right.fsrs.due) || TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type)),
  )

const endOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

export const newWordBudget = (cards: StudyCard[], now: Date, goalMinutes: number) => {
  const dueToday = cards.filter(card => new Date(card.fsrs.due) < endOfDay(now)).length
  const remaining = goalMinutes * 60 - dueToday * REVIEW_SECONDS
  if (remaining <= 0) return 0
  return Math.min(MAX_NEW_WORDS, Math.floor(remaining / NEW_WORD_SECONDS))
}
