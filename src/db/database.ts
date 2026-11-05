import Dexie, { type EntityTable } from 'dexie'
import type { ReviewLog, StudyCard } from '../domain/schedule'

export type AudioSource = 'tts' | 'forvo' | 'mine'

// 그림·발음은 노트와 따로, 바이트와 형식으로 저장한다(Blob을 그대로 넣으면 환경에 따라 형식이 사라진다).
export type StoredMedia = { data: ArrayBuffer; type: string }
export type MediaKind = 'image' | 'audio'
export type MediaRecord = StoredMedia & { key: string }

export const mediaKey = (wordId: string, kind: MediaKind) => `${wordId}:${kind}`

export const toStoredMedia = async (blob: Blob): Promise<StoredMedia> => ({ data: new Uint8Array(await blob.arrayBuffer()).slice().buffer, type: blob.type })

export const toBlob = (media: StoredMedia) => new Blob([media.data], { type: media.type })

export type Note = {
  wordId: string
  memo: string
  audioSource: AudioSource | null
  madeAt: string
  updatedAt: string
}

export type WordStatus = 'new' | 'known' | 'skipped' | 'made'
export type WordState = { wordId: string; status: WordStatus; updatedAt: string }

export type SettingRecord = { key: string; value: unknown }

export const db = new Dexie('wordbook') as Dexie & {
  notes: EntityTable<Note, 'wordId'>
  media: EntityTable<MediaRecord, 'key'>
  cards: EntityTable<StudyCard, 'id'>
  reviewLogs: EntityTable<ReviewLog & { id?: number }, 'id'>
  wordStates: EntityTable<WordState, 'wordId'>
  settings: EntityTable<SettingRecord, 'key'>
}

db.version(1).stores({
  notes: 'wordId',
  media: 'key',
  cards: 'id, wordId, fsrs.due',
  reviewLogs: '++id, cardId, at',
  wordStates: 'wordId, status',
  settings: 'key',
})
