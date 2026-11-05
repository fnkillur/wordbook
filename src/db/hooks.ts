import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './database'

export function useWordStates() {
  return useLiveQuery(async () => new Map((await db.wordStates.toArray()).map(state => [state.wordId, state.status])), [])
}

export function useCards() {
  return useLiveQuery(() => db.cards.toArray(), [])
}
