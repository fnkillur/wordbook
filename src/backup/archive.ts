import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, type MediaRecord, type Note, type WordState } from '../db/database'
import type { ReviewLog, StudyCard } from '../domain/schedule'

const DATA_FILE = 'data.json'

type MediaEntry = { key: string; type: string; path: string }

type ArchiveData = { version: 1; notes: Note[]; media: MediaEntry[]; cards: StudyCard[]; reviewLogs: ReviewLog[]; wordStates: WordState[] }

export type ImportResult = { added: number; updated: number; skipped: number }

const extensionOf = (type: string) => (type.includes('mpeg') ? 'mp3' : 'jpg')

const mediaPath = (record: MediaRecord) => `media/${record.key.replace(':', '-')}.${extensionOf(record.type)}`

// 노트·카드·복습 기록·단어 상태는 data.json에, 그림과 발음은 media/ 아래 파일로 담는다.
export const exportArchive = async () => {
  const files: Zippable = {}
  const media = (await db.media.toArray()).map(record => {
    const path = mediaPath(record)
    files[path] = new Uint8Array(record.data)
    return { key: record.key, type: record.type, path }
  })
  const data: ArchiveData = {
    version: 1,
    notes: await db.notes.toArray(),
    media,
    cards: await db.cards.toArray(),
    reviewLogs: (await db.reviewLogs.toArray()).map(({ cardId, grade, at }) => ({ cardId, grade, at })),
    wordStates: await db.wordStates.toArray(),
  }
  files[DATA_FILE] = strToU8(JSON.stringify(data))
  // 그림·발음은 이미 압축된 형식이라 다시 압축하지 않는다(아이폰에서 오래 걸리면 공유가 막힌다).
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}

const cardTime = (card: StudyCard) => card.fsrs.last_review ?? card.createdAt

// 같은 항목이 이미 있으면 더 최근 것을 남긴다.
const mergeInto = async <Row>(rows: Row[], existing: (row: Row) => Promise<Row | undefined>, timeOf: (row: Row) => string, save: (row: Row) => Promise<unknown>, result: ImportResult) => {
  for (const row of rows) {
    const current = await existing(row)
    if (current && timeOf(current) >= timeOf(row)) {
      result.skipped += 1
      continue
    }
    await save(row)
    if (current) result.updated += 1
    else result.added += 1
  }
}

export const importArchive = async (archive: Blob): Promise<ImportResult> => {
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  const data = JSON.parse(strFromU8(files[DATA_FILE])) as ArchiveData
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }

  await db.transaction('rw', [db.notes, db.media, db.cards, db.reviewLogs, db.wordStates], async () => {
    for (const note of data.notes) {
      const current = await db.notes.get(note.wordId)
      if (current && current.updatedAt >= note.updatedAt) {
        result.skipped += 1
        continue
      }
      await db.notes.put(note)
      // 노트를 가져올 때만 그 단어의 그림·발음도 함께 바꾼다.
      const entries = data.media.filter(entry => entry.key.startsWith(`${note.wordId}:`) && files[entry.path])
      await db.media.bulkPut(entries.map(entry => ({ key: entry.key, type: entry.type, data: new Uint8Array(files[entry.path]).buffer })))
      if (current) result.updated += 1
      else result.added += 1
    }
    await mergeInto(data.cards, card => db.cards.get(card.id), cardTime, card => db.cards.put(card), result)
    await mergeInto(data.wordStates, state => db.wordStates.get(state.wordId), state => state.updatedAt, state => db.wordStates.put(state), result)
    const knownLogs = new Set((await db.reviewLogs.toArray()).map(log => `${log.cardId}|${log.at}`))
    const newLogs = data.reviewLogs.filter(log => !knownLogs.has(`${log.cardId}|${log.at}`))
    await db.reviewLogs.bulkAdd(newLogs)
    result.added += newLogs.length
    result.skipped += data.reviewLogs.length - newLogs.length
  })
  return result
}
