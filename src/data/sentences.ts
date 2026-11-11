import en from './sentences-en.json'
import ja from './sentences-ja.json'

// 빈칸 문장 카드용 문장. before·answer·after를 이으면 원문이고 answer가 빈칸이다.
// reading: 일본어 빈칸 말의 문장 속 꼴 그대로의 읽기(영어는 null). audioPath: public/ 아래 원어민 녹음(없으면 TTS로 읽는다).
export type Sentence = { before: string; answer: string; after: string; reading: string | null; translation: string; audioPath: string | null }

export const SENTENCES: Record<string, Sentence> = { ...ja, ...en }

export const findSentence = (wordId: string) => SENTENCES[wordId] ?? null

export const sentenceTextOf = (sentence: Sentence) => `${sentence.before}${sentence.answer}${sentence.after}`
