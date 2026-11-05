const PREFIX = 'WORDBOOK1:'
const ENDPOINT_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
const fromBase64 = (encoded: string) => new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))

export const encodeConnectCode = (endpoint: string, token: string) => PREFIX + toBase64(JSON.stringify({ endpoint, token }))

export const decodeConnectCode = (code: string) => {
  const trimmed = code.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  try {
    const { endpoint, token } = JSON.parse(fromBase64(trimmed.slice(PREFIX.length)))
    if (typeof endpoint !== 'string' || !ENDPOINT_PATTERN.test(endpoint)) return null
    if (typeof token !== 'string' || token.length < 16) return null
    return { endpoint, token }
  } catch {
    return null
  }
}
