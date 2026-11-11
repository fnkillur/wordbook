import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { db, type MediaRecord, type Note, type SettingRecord, type WordState } from '../db/database'
import type { ReviewLog, StudyCard } from '../domain/schedule'
import type { VocabTestResult } from '../domain/vocabTest'
import { pastCoins, type CoinRecord } from '../domain/wallet'

export const DATA_FILE = 'data.json'

type MediaEntry = { key: string; type: string; path: string }

// profile: 어휘량 테스트 기록·시작 위치·제초 검정 기록. 그날그날 다시 정하는 하루 계획(plan:)은 담지 않는다.
export type ArchiveData = {
  version: 1
  notes: Note[]
  media: MediaEntry[]
  cards: StudyCard[]
  reviewLogs: ReviewLog[]
  wordStates: WordState[]
  profile?: SettingRecord[]
  coins?: CoinRecord[]
}

const isProfileKey = (key: string) => key.startsWith('vocabTests:') || key.startsWith('startRank:') || key.startsWith('exams:')

export type ImportResult = { added: number; updated: number; skipped: number }

const EXTENSIONS: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'image/jpeg': 'jpg' }

// audio/webm;codecs=opus처럼 붙은 설명은 떼고, 따로 정하지 않은 형식은 image/webp → webp처럼 뒷부분을 쓴다.
const extensionOf = (type: string) => {
  const mime = type.split(';')[0].trim()
  return EXTENSIONS[mime] ?? mime.split('/')[1] ?? 'bin'
}

const mediaPath = (record: MediaRecord) => `media/${record.key.replace(':', '-')}.${extensionOf(record.type)}`

export type ArchiveMedia = MediaEntry & { bytes: Uint8Array }

// 노트·카드·복습 기록·단어 상태는 data.json에, 그림과 발음은 media/ 아래 파일로 담는다.
export const collectArchive = async () => {
  const media: ArchiveMedia[] = (await db.media.toArray()).map(record => ({ key: record.key, type: record.type, path: mediaPath(record), bytes: new Uint8Array(record.data) }))
  const data: ArchiveData = {
    version: 1,
    notes: await db.notes.toArray(),
    media: media.map(({ key, type, path }) => ({ key, type, path })),
    cards: await db.cards.toArray(),
    reviewLogs: (await db.reviewLogs.toArray()).map(({ cardId, grade, at }) => ({ cardId, grade, at })),
    wordStates: await db.wordStates.toArray(),
    profile: await db.settings.filter(row => isProfileKey(row.key)).toArray(),
    coins: await db.coins.toArray(),
  }
  return { data, media }
}

export const exportArchive = async () => {
  const { data, media } = await collectArchive()
  const files: Zippable = Object.fromEntries(media.map(entry => [entry.path, entry.bytes]))
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

// 보수 기록이 없는 예전 백업도 복습과 만든 단어로 채운다. 같은 일로 받은 보수는 id가 같아 한 번만 남는다.
const mergeCoins = async (data: ArchiveData) => {
  const incoming = new Map([...pastCoins(data.reviewLogs, data.notes), ...(data.coins ?? [])].map(coin => [coin.id, coin]))
  const known = new Set(await db.coins.toCollection().primaryKeys())
  await db.coins.bulkAdd([...incoming.values()].filter(coin => !known.has(coin.id)))
}

const mergeProfile = async (rows: SettingRecord[]) => {
  for (const row of rows.filter(item => isProfileKey(item.key))) {
    if (row.key.startsWith('startRank:')) {
      await db.settings.put(row)
      continue
    }
    const current = ((await db.settings.get(row.key))?.value as VocabTestResult[] | undefined) ?? []
    const known = new Set(current.map(result => result.takenAt))
    const merged = [...current, ...(row.value as VocabTestResult[]).filter(result => !known.has(result.takenAt))]
    await db.settings.put({ key: row.key, value: merged.sort((first, second) => first.takenAt.localeCompare(second.takenAt)) })
  }
}

// 가져오면 폰의 노트를 바꾸게 될 단어. 폰에 없거나 백업 쪽이 더 최근인 것이다.
export const notesToImport = async (data: ArchiveData) => {
  const current = await db.notes.bulkGet(data.notes.map(note => note.wordId))
  return data.notes.filter((note, index) => !current[index] || current[index].updatedAt < note.updatedAt).map(note => note.wordId)
}

const noteMedia = (data: ArchiveData, files: Record<string, Uint8Array>, wordId: string): MediaRecord[] =>
  data.media.filter(entry => entry.key.startsWith(`${wordId}:`) && files[entry.path]).map(entry => ({ key: entry.key, type: entry.type, data: new Uint8Array(files[entry.path]).buffer }))

// files: media/ 경로별 바이트. 가져올 노트의 그림·발음만 있으면 된다.
export const mergeArchive = async (data: ArchiveData, files: Record<string, Uint8Array>): Promise<ImportResult> => {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }

  await db.transaction('rw', [db.notes, db.media, db.cards, db.reviewLogs, db.wordStates, db.settings, db.coins], async () => {
    for (const note of data.notes) {
      const current = await db.notes.get(note.wordId)
      const records = noteMedia(data, files, note.wordId)
      if (current && current.updatedAt >= note.updatedAt) {
        // 폰의 노트를 남겨도, 폰에 없는 그림·발음·문장 음성은 백업에서 채운다.
        const existing = await db.media.bulkGet(records.map(record => record.key))
        await db.media.bulkPut(records.filter((_, index) => !existing[index]))
        result.skipped += 1
        continue
      }
      await db.notes.put(note)
      // 노트를 가져올 때는 그 단어의 그림·발음도 함께 바꾼다.
      await db.media.bulkPut(records)
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
    await mergeProfile(data.profile ?? [])
    await mergeCoins(data)
  })
  return result
}

export const importArchive = async (archive: Blob) => {
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  return mergeArchive(JSON.parse(strFromU8(files[DATA_FILE])) as ArchiveData, files)
}
