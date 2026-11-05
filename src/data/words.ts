import type { Language } from '../platform'
import en from './words-en.json'
import ja from './words-ja.json'

// reading: 일본어는 가나 읽기, 영어는 발음 기호(IPA). hint: 비슷한 단어를 가르는 짧은 설명(예: old의 "young").
export type WordEntry = {
  id: string
  order: number
  theme: string
  text: string
  reading: string
  kanji: string | null
  meaningKo: string
  hint: string
  searchQuery: string
}

export const WORDS: Record<Language, WordEntry[]> = { ja, en }

export const findWord = (wordId: string) => WORDS[wordId.startsWith('ja-') ? 'ja' : 'en'].find(word => word.id === wordId) ?? null

// 한자 한 글자만 주면 음독으로 잘못 읽는 일이 많아서(家→か), 일본어 발음은 가나 읽기로 만든다.
export const speechTextOf = (word: WordEntry) => (word.id.startsWith('ja-') ? word.reading : word.text)
