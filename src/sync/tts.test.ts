import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeConnectCode, encodeConnectCode } from './connectCode'
import { fetchTts } from './tts'

const ENDPOINT = 'https://script.google.com/macros/s/abc_DEF-123/exec'
const SETTINGS = { endpoint: ENDPOINT, token: 'test-token-1234567890' }

afterEach(() => vi.unstubAllGlobals())

describe('연결 코드', () => {
  it('주소와 토큰을 담았다가 그대로 꺼낸다', () => {
    expect(decodeConnectCode(encodeConnectCode(ENDPOINT, SETTINGS.token))).toEqual(SETTINGS)
  })

  it('다른 앱 코드나 망가진 코드는 받지 않는다', () => {
    expect(decodeConnectCode('LEDGER1:abc')).toBeNull()
    expect(decodeConnectCode('WORDBOOK1:not-base64')).toBeNull()
  })
})

describe('fetchTts', () => {
  it('서버가 준 base64를 mp3 파일로 바꾼다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, audio: btoa('ID3') })))
    const audio = await fetchTts(SETTINGS, '犬', 'ja')

    expect(audio.type).toBe('audio/mpeg')
    expect(await audio.text()).toBe('ID3')
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ token: SETTINGS.token, action: 'tts', text: '犬', language: 'ja' })
  })

  it('서버가 실패하면 오류를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: '토큰이 올바르지 않아요.' })))
    await expect(fetchTts(SETTINGS, '犬', 'ja')).rejects.toThrow('토큰이 올바르지 않아요.')
  })
})
