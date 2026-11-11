import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const TOKEN = 'test-token-1234567890'

type FakeFile = { name: string; bytes: number[]; type: string; trashed: boolean }
type FakeFolder = { id: string; name: string; folders: FakeFolder[]; files: FakeFile[] }

const iterate = <Item>(items: Item[]) => {
  let index = 0
  return { hasNext: () => index < items.length, next: () => items[index++] }
}

// 드라이브는 폴더·파일 몇 가지 동작만 흉내 낸다.
const loadServer = () => {
  let lastId = 0
  const byId = new Map<string, FakeFolder>()
  const newFolder = (name: string): FakeFolder => {
    const folder = { id: `folder-${++lastId}`, name, folders: [], files: [] }
    byId.set(folder.id, folder)
    return folder
  }
  const root = newFolder('root')
  const fileApi = (file: FakeFile) => ({
    getName: () => file.name,
    getSize: () => file.bytes.length,
    getBlob: () => ({ getBytes: () => file.bytes, getContentType: () => file.type }),
    setTrashed: (trashed: boolean) => {
      file.trashed = trashed
    },
  })
  const folderApi = (folder: FakeFolder): unknown => ({
    getId: () => folder.id,
    getFoldersByName: (name: string) => iterate(folder.folders.filter(child => child.name === name).map(folderApi)),
    createFolder: (name: string) => {
      const child = newFolder(name)
      folder.folders.push(child)
      return folderApi(child)
    },
    getFilesByName: (name: string) => iterate(folder.files.filter(file => file.name === name && !file.trashed).map(fileApi)),
    getFiles: () => iterate(folder.files.filter(file => !file.trashed).map(fileApi)),
    createFile: (blob: { bytes: number[]; type: string; name: string }) => {
      const file = { name: blob.name, bytes: blob.bytes, type: blob.type, trashed: false }
      folder.files.push(file)
      return fileApi(file)
    },
  })
  const properties = new Map<string, string>()
  const context: Record<string, unknown> = {
    API_TOKEN: TOKEN,
    TTS_API_KEY: 'test-key',
    DriveApp: { getRootFolder: () => folderApi(root), getFolderById: (id: string) => folderApi(byId.get(id)!) },
    Utilities: {
      base64Decode: (data: string) => [...Buffer.from(data, 'base64')],
      base64Encode: (bytes: number[]) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes: number[], type: string, name: string) => ({ bytes, type, name }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType: () => ({ text }) }),
    },
  }
  runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Code.gs'), 'utf8')}\nthis.server = { doPost }`, context)
  const server = context.server as { doPost: (event: unknown) => { text: string } }
  const post = (body: Record<string, unknown>) => JSON.parse(server.doPost({ postData: { contents: JSON.stringify({ token: TOKEN, ...body }) } }).text)
  const folderOf = (person: string) => root.folders.find(folder => folder.name === 'wordbook-backup')?.folders.find(folder => folder.name === person)
  return { post, folderOf }
}

const file = (name: string, text: string, type = 'application/json') => ({ name, type, data: btoa(text) })

describe('드라이브 백업 서버', () => {
  it('사람별 폴더에 올리고, 목록과 내용을 돌려준다', () => {
    const { post, folderOf } = loadServer()

    expect(post({ action: 'backupPut', person: '하치와레', files: [file('data.json', '{}'), file('ja-0001-image.jpg', 'JPEG', 'image/jpeg')] })).toEqual({ ok: true, saved: 2 })

    expect(folderOf('하치와레')?.files.map(saved => saved.name)).toEqual(['data.json', 'ja-0001-image.jpg'])
    expect(post({ action: 'backupList', person: '하치와레' })).toEqual({
      ok: true,
      files: [
        { name: 'data.json', size: 2 },
        { name: 'ja-0001-image.jpg', size: 4 },
      ],
    })
    expect(post({ action: 'backupGet', person: '하치와레', names: ['ja-0001-image.jpg'] })).toEqual({ ok: true, files: [{ name: 'ja-0001-image.jpg', type: 'image/jpeg', data: btoa('JPEG') }] })
    expect(post({ action: 'backupList', person: '우사기' })).toEqual({ ok: true, files: [] })
  })

  it('같은 이름을 다시 올리면 예전 파일은 휴지통으로 보낸다', () => {
    const { post } = loadServer()
    post({ action: 'backupPut', person: '우사기', files: [file('data.json', 'old')] })
    post({ action: 'backupPut', person: '우사기', files: [file('data.json', 'newer')] })

    expect(post({ action: 'backupList', person: '우사기' }).files).toEqual([{ name: 'data.json', size: 5 }])
    expect(post({ action: 'backupGet', person: '우사기', names: ['data.json'] }).files[0].data).toBe(btoa('newer'))
  })

  it('없는 파일을 달라고 하면 빼고 돌려준다', () => {
    const { post } = loadServer()
    expect(post({ action: 'backupGet', person: '하치와레', names: ['data.json'] })).toEqual({ ok: true, files: [] })
  })

  it('토큰·사람·파일 이름이 이상하면 거절한다', () => {
    const { post, folderOf } = loadServer()
    expect(post({ token: 'wrong', action: 'backupPut', person: '하치와레', files: [file('data.json', '{}')] }).ok).toBe(false)
    expect(post({ action: 'backupPut', person: '모몬가', files: [file('data.json', '{}')] }).ok).toBe(false)
    expect(post({ action: 'backupPut', person: '하치와레', files: [file('../data.json', '{}')] }).ok).toBe(false)
    expect(post({ action: 'backupGet', person: '하치와레', names: ['a/b'] }).ok).toBe(false)
    expect(folderOf('하치와레')?.files ?? []).toEqual([])
  })
})
