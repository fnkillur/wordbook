export type ServerSettings = { endpoint: string; token: string }

type ServerResult = { ok: true } | { ok: false; error: string }

export const fromBase64 = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0))

// 큰 파일을 한 번에 String.fromCharCode로 펼치면 호출 인자 한도를 넘어서 나눠 바꾼다.
export const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(binary)
}

// Apps Script는 CORS 사전 요청(OPTIONS)을 처리하지 못해서 text/plain으로 보낸다.
export const postServer = async <Result>(settings: ServerSettings, body: Record<string, unknown>) => {
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: settings.token, ...body }),
  })
  if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`)
  const result = (await response.json()) as ServerResult
  if (!result.ok) throw new Error(result.error)
  return result as unknown as Result
}
