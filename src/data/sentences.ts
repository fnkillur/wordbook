import conjugations from './conjugations-ja.json'
import en from './sentences-en.json'
import ja from './sentences-ja.json'

// 빈칸 문장 카드용 문장. before·answer·after를 이으면 원문이고 answer가 빈칸이다.
// reading: 일본어 빈칸 말의 문장 속 꼴 그대로의 읽기(영어는 null). audioPath: public/ 아래 원어민 녹음(없으면 TTS로 읽는다).
// form: 동사 활용형 문장이면 빈칸이 어떤 꼴인지(~ている 등).
export type Sentence = { before: string; answer: string; after: string; reading: string | null; translation: string; audioPath: string | null; form?: string }

export const SENTENCES: Record<string, Sentence> = { ...ja, ...en }

export const CONJUGATIONS: Record<string, Sentence[]> = conjugations

export const findSentence = (wordId: string) => SENTENCES[wordId] ?? null

// 동사는 기본 문장 뒤에 그 동사가 자주 쓰이는 활용형 문장이 이어진다. 기초 625 동사는 활용형 문장만 있다.
export const sentencesOf = (wordId: string) => [findSentence(wordId), ...(CONJUGATIONS[wordId] ?? [])].filter((sentence): sentence is Sentence => !!sentence)

// 빈칸 카드를 복습할 때마다 다음 문장으로 넘어가서, 같은 동사를 여러 꼴로 만난다.
export const sentenceForTurn = (wordId: string, turn: number) => {
  const sentences = sentencesOf(wordId)
  if (sentences.length === 0) return null
  const index = turn % sentences.length
  return { sentence: sentences[index], index }
}

export const sentenceTextOf = (sentence: Sentence) => `${sentence.before}${sentence.answer}${sentence.after}`

const textHash = (text: string) => [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.codePointAt(0)!) | 0, 7).toString(36).replace('-', 'n')

// 받아 둔 문장 음성은 문장 글자와 녹음 출처로 이름을 짓는다. 문장을 바꾸거나 잘린 녹음을 빼서 TTS로 바뀌면 이름이 달라져 다시 받는다.
export const sentenceAudioKind = (sentence: Sentence) => `sentence-${textHash(`${sentenceTextOf(sentence)}|${sentence.audioPath ?? 'tts'}`)}` as const
