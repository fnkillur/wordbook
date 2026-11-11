import type { Language } from '../platform'

// 회화 위주라 일본어는 말로 쓰는 읽기(히라가나)를 크게, 한자 표기는 작게 곁들인다. 영어는 철자를 크게, 발음 기호를 작게.
export const wordFormsOf = (word: { text: string; reading: string }, language: Language) => {
  if (language === 'en') return { main: word.text, sub: word.reading || null }
  const reading = word.reading || word.text
  return { main: reading, sub: word.text === reading ? null : word.text }
}
