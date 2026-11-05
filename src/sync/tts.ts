import type { Language } from '../platform'

export type ServerSettings = { endpoint: string; token: string }

type TtsResult = { ok: true; audio: string } | { ok: false; error: string }

const fromBase64 = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0))

// Apps Script는 CORS 사전 요청(OPTIONS)을 처리하지 못해서 text/plain으로 보낸다.
export const fetchTts = async (settings: ServerSettings, text: string, language: Language) => {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, action: 'tts', text, language }),
  })
  if (!response.ok) throw new Error(`발음 서버 응답 오류 (${response.status})`)
  const result = (await response.json()) as TtsResult
  if (!result.ok) throw new Error(result.error)
  return new Blob([fromBase64(result.audio)], { type: 'audio/mpeg' })
}
