import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, mediaKey } from '../db/database'
import { makeWord, recordReview, setAudio } from '../db/repository'
import { saveSettings } from '../settings'
import { backupIfDue, backupToDrive, driveBackupState, restoreFromDrive } from './driveBackup'

const SERVER = { endpoint: 'https://script.google.com/macros/s/abc/exec', token: 'test-token-1234567890' }
const NOW = new Date('2026-11-10T09:00:00+09:00')
const MB = 1024 * 1024

type DriveFile = { name: string; type: string; data: string }
type Request = { action: string; person: string; files?: DriveFile[]; names?: string[] }

// Apps Script 백업 서버를 메모리로 흉내 낸다. failPut번째 올리기 요청은 실패시킨다.
const fakeDrive = ({ failPut }: { failPut?: number } = {}) => {
  const folders = new Map<string, Map<string, DriveFile>>()
  const requests: Request[] = []
  let puts = 0
  const folderOf = (person: string) => folders.get(person) ?? folders.set(person, new Map()).get(person)!
  const respond = (request: Request) => {
    const folder = folderOf(request.person)
    if (request.action === 'backupPut') {
      puts += 1
      if (puts === failPut) return { ok: false, error: '드라이브 오류' }
      request.files?.forEach(file => folder.set(file.name, file))
      return { ok: true, saved: request.files?.length }
    }
    if (request.action === 'backupList') return { ok: true, files: [...folder.values()].map(file => ({ name: file.name, size: atob(file.data).length })) }
    return { ok: true, files: (request.names ?? []).flatMap(name => folder.get(name) ?? []) }
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as Request
      requests.push(request)
      return Response.json(respond(request))
    }),
  )
  const putNames = () => requests.filter(request => request.action === 'backupPut').map(request => request.files?.map(file => file.name))
  return { folders, requests, putNames }
}

const image = (size: number, fill = 1) => new Blob([new Uint8Array(size).fill(fill)], { type: 'image/jpeg' })

const seed = async () => {
  await makeWord({ wordId: 'ja-0001', image: image(3), memo: '옆집 개', cardTypes: ['produce'] }, NOW)
  await setAudio('ja-0001', new Blob([new Uint8Array([9, 8])], { type: 'audio/mpeg' }), 'tts')
  await recordReview('ja-0001:produce', 'good', NOW)
}

const clearAll = () => Promise.all(db.tables.map(table => table.clear()))

beforeEach(async () => {
  await clearAll()
  localStorage.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('드라이브에 백업', () => {
  it('처음에는 그림·발음과 data.json을 올리고, 다음에는 바뀐 것만 올린다', async () => {
    const drive = fakeDrive()
    await seed()

    expect(await backupToDrive(SERVER, '하치와레', NOW)).toBe(2)
    expect(drive.putNames()).toEqual([['ja-0001-audio.mp3', 'ja-0001-image.jpg'], ['data.json']])
    expect((await driveBackupState()).lastAt).toBe(NOW.toISOString())

    await makeWord({ wordId: 'ja-0001', image: image(3, 7), memo: '옆집 개', cardTypes: ['produce'] }, NOW)
    await backupToDrive(SERVER, '하치와레', NOW)
    expect(drive.putNames().slice(2)).toEqual([['ja-0001-image.jpg'], ['data.json']])
  })

  it('파일이 크면 3MB 안쪽으로 나눠 올린다', async () => {
    const drive = fakeDrive()
    await makeWord({ wordId: 'ja-0001', image: image(2 * MB), memo: '', cardTypes: ['produce'] }, NOW)
    await makeWord({ wordId: 'ja-0002', image: image(2 * MB), memo: '', cardTypes: ['produce'] }, NOW)

    await backupToDrive(SERVER, '하치와레', NOW)
    expect(drive.putNames()).toEqual([['ja-0001-image.jpg'], ['ja-0002-image.jpg'], ['data.json']])
  })

  it('작은 파일도 한 번에 20개까지만 올린다', async () => {
    const drive = fakeDrive()
    for (let index = 1; index <= 25; index += 1) await makeWord({ wordId: `ja-${String(index).padStart(4, '0')}`, image: image(10), memo: '', cardTypes: ['produce'] }, NOW)

    await backupToDrive(SERVER, '하치와레', NOW)
    expect(drive.putNames().map(names => names?.length)).toEqual([20, 5, 1])
  })

  it('중간에 실패해도 올린 것은 기억해서 다음에는 남은 것부터 올린다', async () => {
    const drive = fakeDrive({ failPut: 2 })
    await makeWord({ wordId: 'ja-0001', image: image(2 * MB), memo: '', cardTypes: ['produce'] }, NOW)
    await makeWord({ wordId: 'ja-0002', image: image(2 * MB), memo: '', cardTypes: ['produce'] }, NOW)

    await expect(backupToDrive(SERVER, '하치와레', NOW)).rejects.toThrow('드라이브 오류')
    expect((await driveBackupState()).lastAt).toBeNull()

    await backupToDrive(SERVER, '하치와레', NOW)
    expect(drive.putNames().slice(2)).toEqual([['ja-0002-image.jpg'], ['data.json']])
  })
})

describe('드라이브에서 되살리기', () => {
  it('빈 폰에 그림·발음·복습 기록까지 되살리고, 받은 파일은 다시 올리지 않는다', async () => {
    const drive = fakeDrive()
    await seed()
    await backupToDrive(SERVER, '하치와레', NOW)
    await clearAll()

    const progress: number[] = []
    expect(await restoreFromDrive(SERVER, '하치와레', done => progress.push(done))).toMatchObject({ added: 4 })
    expect((await db.notes.get('ja-0001'))?.memo).toBe('옆집 개')
    expect((await db.media.get(mediaKey('ja-0001', 'image')))?.type).toBe('image/jpeg')
    expect(Array.from(new Uint8Array((await db.media.get(mediaKey('ja-0001', 'audio')))!.data))).toEqual([9, 8])
    expect((await db.cards.get('ja-0001:produce'))?.fsrs.reps).toBe(1)
    expect(progress).toEqual([2])

    const before = drive.putNames().length
    await backupToDrive(SERVER, '하치와레', NOW)
    expect(drive.putNames().slice(before)).toEqual([['data.json']])
  })

  it('폰에 더 최근에 고친 단어가 있으면 그 그림은 받지도 덮어쓰지도 않는다', async () => {
    const drive = fakeDrive()
    await seed()
    await backupToDrive(SERVER, '하치와레', NOW)
    await db.notes.update('ja-0001', { memo: '새로 고친 기억', updatedAt: new Date(Date.now() + 60_000).toISOString() })
    await db.media.put({ key: mediaKey('ja-0001', 'image'), data: new Uint8Array([5]).buffer, type: 'image/png' })

    await restoreFromDrive(SERVER, '하치와레')
    expect((await db.notes.get('ja-0001'))?.memo).toBe('새로 고친 기억')
    expect((await db.media.get(mediaKey('ja-0001', 'image')))?.type).toBe('image/png')
    const fetched = drive.requests.filter(request => request.action === 'backupGet').flatMap(request => request.names)
    expect(fetched).toEqual(['data.json'])
  })

  it('드라이브에 백업이 없으면 알려 준다', async () => {
    fakeDrive()
    await expect(restoreFromDrive(SERVER, '우사기')).rejects.toThrow('드라이브에 아직 백업이 없어.')
  })
})

describe('하루 한 번 저절로 백업', () => {
  it('서버를 연결했고 오늘 아직 안 했을 때만 올린다', async () => {
    const drive = fakeDrive()
    await seed()

    expect(await backupIfDue(NOW)).toBe(false)
    saveSettings({ server: SERVER })
    expect(await backupIfDue(NOW)).toBe(true)
    expect(await backupIfDue(new Date('2026-11-10T22:00:00+09:00'))).toBe(false)
    expect(await backupIfDue(new Date('2026-11-11T08:00:00+09:00'))).toBe(true)
    expect(drive.requests.every(request => request.person === '하치와레')).toBe(true)
  })
})
