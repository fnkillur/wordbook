import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { db } from './database'

describe('저장소 업그레이드', () => {
  it('보수가 없던 판에서 올라오면 지난 복습과 만든 단어만큼 보수를 채운다', async () => {
    db.close()
    await Dexie.delete('wordbook')
    const old = new Dexie('wordbook')
    old.version(1).stores({ notes: 'wordId', media: 'key', cards: 'id, wordId, fsrs.due', reviewLogs: '++id, cardId, at', wordStates: 'wordId, status', settings: 'key' })
    await old.table('notes').put({ wordId: 'ja-0001', memo: '', audioSource: null, madeAt: '2026-11-05T00:00:00.000Z', updatedAt: '' })
    await old.table('reviewLogs').bulkAdd([
      { cardId: 'ja-0001:produce', grade: 'good', at: '2026-11-06T00:00:00.000Z' },
      { cardId: 'ja-0001:listen', grade: 'again', at: '2026-11-06T00:00:00.000Z' },
    ])
    old.close()

    await db.open()

    expect((await db.coins.toArray()).reduce((sum, coin) => sum + coin.amount, 0)).toBe(7)
  })
})
