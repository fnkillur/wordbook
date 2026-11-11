import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Fetched = { url: string; payload: unknown }

// 구글 서비스는 흉내 내고, Code.gs의 요청 처리만 확인한다.
const loadServer = () => {
  const fetched: Fetched[] = []
  const context: Record<string, unknown> = {
    API_TOKEN: 'test-token-1234567890',
    TTS_API_KEY: 'test-key',
    UrlFetchApp: {
      fetch: (url: string, options: { payload: string }) => {
        fetched.push({ url, payload: JSON.parse(options.payload) })
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ audioContent: 'SUQz' }) }
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ text, setMimeType: () => ({ text }) }),
    },
  }
  runInNewContext(`${readFileSync(resolve(__dirname, '../../apps-script/Code.gs'), 'utf8')}\nthis.server = { doPost, ttsRequest_ }`, context)
  const server = context.server as { doPost: (event: unknown) => { text: string }; ttsRequest_: (text: string, language: string) => unknown }
  const post = (body: unknown) => JSON.parse(server.doPost({ postData: { contents: JSON.stringify(body) } }).text)
  return { server, post, fetched }
}

describe('발음 서버', () => {
  it('언어마다 목소리를 골라 MP3를 요청한다', () => {
    const { server } = loadServer()
    expect(server.ttsRequest_('犬', 'ja')).toEqual({
      input: { text: '犬' },
      voice: { languageCode: 'ja-JP', name: 'ja-JP-Chirp3-HD-Puck' },
      audioConfig: { audioEncoding: 'MP3' },
    })
    expect(server.ttsRequest_('dog', 'en')).toMatchObject({ voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' } })
  })

  it('토큰이 맞으면 발음을 만들어 돌려준다', () => {
    const { post, fetched } = loadServer()
    expect(post({ token: 'test-token-1234567890', action: 'tts', text: '犬', language: 'ja' })).toEqual({ ok: true, audio: 'SUQz' })
    expect(fetched[0].url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize?key=test-key')
  })

  it('토큰이 틀리거나 요청이 이상하면 거절한다', () => {
    const { post, fetched } = loadServer()
    expect(post({ token: 'wrong', action: 'tts', text: '犬', language: 'ja' }).ok).toBe(false)
    expect(post({ token: 'test-token-1234567890', action: 'tts', text: '', language: 'ja' }).ok).toBe(false)
    expect(post({ token: 'test-token-1234567890', action: 'tts', text: '犬', language: 'fr' }).ok).toBe(false)
    expect(fetched).toHaveLength(0)
  })
})
