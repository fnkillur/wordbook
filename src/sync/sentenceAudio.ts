import { sentencesOf, sentenceTextOf } from '../data/sentences'
import { reportedAudioPaths, setSentenceAudio, withoutReportedAudio, wordsMissingSentenceAudio } from '../db/repository'
import { getSettings } from '../settings'
import { fetchTts } from './tts'

// 원어민 녹음은 앱과 함께 배포된 파일이라 인터넷 없이도 받는다. 없거나 받지 못하면 서버 TTS로 문장을 읽는다.
const nativeAudio = async (audioPath: string) => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${audioPath}`)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

const ttsAudio = async (text: string, wordId: string) => {
  const server = getSettings().server
  if (!server) return null
  try {
    return await fetchTts(server, text, wordId.startsWith('ja-') ? 'ja' : 'en')
  } catch {
    return null
  }
}

// index: 그 단어의 몇 번째 문장인지(동사 활용형 문장은 1부터).
export const prepareSentenceAudio = async (wordId: string, { allowTts = true, index = 0 } = {}) => {
  const found = sentencesOf(wordId)[index]
  if (!found) return false
  const sentence = withoutReportedAudio(found, await reportedAudioPaths().catch(() => new Set<string>()))
  const audio = (sentence.audioPath && (await nativeAudio(sentence.audioPath))) || (allowTts && (await ttsAudio(sentenceTextOf(sentence), wordId)))
  if (!audio) return false
  // 기다리지 않고 부르는 곳이 많아, 저장소 오류도 실패로 돌려준다. 다음 다시 받기에서 또 해 본다.
  try {
    await setSentenceAudio(wordId, audio, sentence)
    return true
  } catch {
    return false
  }
}

// 받지 못한 문장 음성(서버 연결 전이나 실패)을 차례로 다시 받는다. 앱에 든 녹음은 인터넷 없이도 받으니 끝까지 받고,
// 서버 TTS는 한 번 실패하면 남은 것을 다음 기회로 미룬다.
export const backfillSentenceAudio = async () => {
  let filled = 0
  let canUseTts = true
  const missing = await wordsMissingSentenceAudio().catch(() => [])
  for (const wordId of missing) {
    const [sentence] = sentencesOf(wordId)
    if (!sentence || (!sentence.audioPath && !canUseTts)) continue
    if (await prepareSentenceAudio(wordId, { allowTts: canUseTts })) {
      filled += 1
      continue
    }
    canUseTts = false
  }
  return filled
}
