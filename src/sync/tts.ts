import type { Language } from '../platform'
import { fromBase64, postServer, type ServerSettings } from './server'

export const fetchTts = async (settings: ServerSettings, text: string, language: Language) => {
  const { audio } = await postServer<{ audio: string }>(settings, { action: 'tts', text, language })
  return new Blob([fromBase64(audio)], { type: 'audio/mpeg' })
}
