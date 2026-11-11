import type { Note } from '../db/database'
import type { ReviewLog } from './schedule'

export type CoinKind = 'review' | 'make' | 'goal' | 'buy'

// 보수 기록. id는 무엇으로 받았는지(예전에는 산 것도)로 정해져서, 백업을 합쳐도 두 번 더해지지 않는다.
export type CoinRecord = { id: string; kind: CoinKind; amount: number; at: string }

// 맞혔는지와 상관없이 한 만큼 준다.
export const COIN = { review: 1, make: 5, goal: 10 } as const

export const reviewCoin = (log: ReviewLog): CoinRecord => ({ id: `review:${log.cardId}|${log.at}`, kind: 'review', amount: COIN.review, at: log.at })

export const makeCoin = (wordId: string, at: string): CoinRecord => ({ id: `make:${wordId}`, kind: 'make', amount: COIN.make, at })

export const goalCoin = (date: string, at: string): CoinRecord => ({ id: `goal:${date}`, kind: 'goal', amount: COIN.goal, at })

// 도감은 모은 만큼 열리므로 예전에 산 기록(buy, 음수)은 빼지 않는다.
export const earnedOf = (coins: CoinRecord[]) => coins.filter(coin => coin.kind !== 'buy').reduce((sum, coin) => sum + coin.amount, 0)

// 보수가 생기기 전에 한 복습과 만든 단어도 그만큼 채워 준다.
export const pastCoins = (logs: ReviewLog[], notes: Note[]) => [...logs.map(reviewCoin), ...notes.map(note => makeCoin(note.wordId, note.madeAt))]
