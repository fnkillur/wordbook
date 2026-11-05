import { speechTextOf } from '../data/words'
import { fillMissingAudio } from '../db/repository'
import { getSettings } from '../settings'
import { fetchTts } from './tts'

export const backfillAudio = async () => {
  const server = getSettings().server
  if (!server) return 0
  return fillMissingAudio(word => fetchTts(server, speechTextOf(word), word.id.startsWith('ja-') ? 'ja' : 'en'))
}
