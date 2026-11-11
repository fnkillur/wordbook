import { strFromU8, strToU8 } from 'fflate'
import { collectArchive, DATA_FILE, mergeArchive, notesToImport, type ArchiveData, type ImportResult } from '../backup/archive'
import { db } from '../db/database'
import { dateKey } from '../db/repository'
import type { Person } from '../platform'
import { getSettings } from '../settings'
import { fromBase64, postServer, toBase64, type ServerSettings } from './server'

const STATE_KEY = 'driveBackup'
export const NO_DRIVE_BACKUP = '드라이브에 아직 백업이 없어.'
// Apps Script 요청 하나에 base64로 늘어나도 넉넉히 들어가는 크기.
const MAX_BATCH_BYTES = 3 * 1024 * 1024
// 드라이브에 파일을 하나 만들 때마다 시간이 들어서, 6분 제한 안에 넉넉히 끝나게 개수도 나눈다.
const MAX_BATCH_FILES = 20

// uploaded: 그림·발음 키별로 마지막에 올린 파일의 지문.
export type DriveBackupState = { lastAt: string | null; uploaded: Record<string, string> }
type Progress = (done: number, total: number) => void
type DriveFile = { name: string; type: string; data: string }

// 바뀌었는지만 보는 지문이라 빠른 FNV-1a로 충분하다.
const fingerprint = (bytes: Uint8Array) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < bytes.length; index += 1) hash = Math.imul(hash ^ bytes[index], 0x01000193) >>> 0
  return `${bytes.length}:${hash.toString(16)}`
}

const driveNameOf = (path: string) => path.slice('media/'.length)

const wordIdOf = (mediaKey: string) => mediaKey.slice(0, mediaKey.lastIndexOf(':'))

// 묶음마다 크기와 개수를 넘지 않게 나눈다. 한 파일이 혼자 크기를 넘으면 그 파일만 한 묶음이 된다.
const batchesOf = <Item>(items: Item[], sizeOf: (item: Item) => number) => {
  const batches: Item[][] = []
  let size = 0
  for (const item of items) {
    const last = batches.at(-1)
    if (!last || last.length >= MAX_BATCH_FILES || size + sizeOf(item) > MAX_BATCH_BYTES) {
      batches.push([item])
      size = sizeOf(item)
      continue
    }
    last.push(item)
    size += sizeOf(item)
  }
  return batches
}

export const driveBackupState = async () => ((await db.settings.get(STATE_KEY))?.value as DriveBackupState | undefined) ?? { lastAt: null, uploaded: {} }

const saveState = (state: DriveBackupState) => db.settings.put({ key: STATE_KEY, value: state })

// 올리기와 되살리기가 겹치면 지문 기록이 엇갈려서 한 번에 하나씩 돌린다.
let queue: Promise<unknown> = Promise.resolve()
const serially = <Result>(work: () => Promise<Result>) => {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}

const putFiles = (server: ServerSettings, person: Person, files: DriveFile[]) => postServer(server, { action: 'backupPut', person, files })

const getFiles = async (server: ServerSettings, person: Person, names: string[]) => (await postServer<{ files: DriveFile[] }>(server, { action: 'backupGet', person, names })).files

// 그림·발음을 먼저 올리고 data.json을 마지막에 올린다. 그래서 드라이브의 data.json에 적힌 파일은 늘 드라이브에 있다.
const upload = async (server: ServerSettings, person: Person, now: Date, onProgress?: Progress) => {
  const { data, media } = await collectArchive()
  const state = await driveBackupState()
  const changed = media.map(entry => ({ ...entry, print: fingerprint(entry.bytes) })).filter(entry => state.uploaded[entry.key] !== entry.print)
  let done = 0
  for (const batch of batchesOf(changed, entry => entry.bytes.length)) {
    await putFiles(
      server,
      person,
      batch.map(entry => ({ name: driveNameOf(entry.path), type: entry.type, data: toBase64(entry.bytes) })),
    )
    batch.forEach(entry => {
      state.uploaded[entry.key] = entry.print
    })
    await saveState(state)
    done += batch.length
    onProgress?.(done, changed.length)
  }
  await putFiles(server, person, [{ name: DATA_FILE, type: 'application/json', data: toBase64(strToU8(JSON.stringify(data))) }])
  await saveState({ ...state, lastAt: now.toISOString() })
  return changed.length
}

// 백업 파일 가져오기와 같은 규칙으로 합친다. 그림·발음은 가져올 노트의 것만 받는다.
const restore = async (server: ServerSettings, person: Person, onProgress?: Progress): Promise<ImportResult> => {
  const listed = (await postServer<{ files: { name: string; size: number }[] }>(server, { action: 'backupList', person })).files
  const sizes = new Map(listed.map(file => [file.name, file.size]))
  if (!sizes.has(DATA_FILE)) throw new Error(NO_DRIVE_BACKUP)
  const [dataFile] = await getFiles(server, person, [DATA_FILE])
  const data = JSON.parse(strFromU8(fromBase64(dataFile.data))) as ArchiveData
  const wanted = new Set(await notesToImport(data))
  const entries = data.media.filter(entry => wanted.has(wordIdOf(entry.key)) && sizes.has(driveNameOf(entry.path)))
  const files: Record<string, Uint8Array> = {}
  let done = 0
  for (const batch of batchesOf(entries, entry => sizes.get(driveNameOf(entry.path)) ?? 0)) {
    for (const file of await getFiles(server, person, batch.map(entry => driveNameOf(entry.path)))) files[`media/${file.name}`] = fromBase64(file.data)
    done += batch.length
    onProgress?.(done, entries.length)
  }
  const result = await mergeArchive(data, files)
  // 받은 파일은 이미 드라이브에 있으니 다음 백업에서 다시 올리지 않는다.
  const state = await driveBackupState()
  entries.forEach(entry => {
    const bytes = files[entry.path]
    if (bytes) state.uploaded[entry.key] = fingerprint(bytes)
  })
  await saveState(state)
  return result
}

export const backupToDrive = (server: ServerSettings, person: Person, now = new Date(), onProgress?: Progress) => serially(() => upload(server, person, now, onProgress))

export const restoreFromDrive = (server: ServerSettings, person: Person, onProgress?: Progress) => serially(() => restore(server, person, onProgress))

// 홈을 열 때 부른다. 오늘 이미 올렸거나 서버·사람이 정해지지 않았으면 건너뛴다.
export const backupIfDue = (now = new Date()) =>
  serially(async () => {
    const { server, person } = getSettings()
    if (!server || !person) return false
    const { lastAt } = await driveBackupState()
    if (lastAt && dateKey(new Date(lastAt)) === dateKey(now)) return false
    await upload(server, person, now)
    return true
  })
