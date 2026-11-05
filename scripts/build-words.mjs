// 기초 단어 목록(base625.json)과 언어별 자료(words.txt)를 합쳐 앱이 읽는 단어 파일을 만든다.
// 실행: node scripts/build-words.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const base = JSON.parse(readFileSync(new URL('./data/base625.json', import.meta.url), 'utf8'))
const rows = readFileSync(new URL('./data/words.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter(line => line.trim() !== '' && !line.startsWith('#'))
  .map(line => line.split('|').map(cell => cell.trim()))

if (rows.length !== base.length) throw new Error(`words.txt ${rows.length}줄, base625.json ${base.length}개`)
rows.forEach((cells, index) => {
  if (cells.length !== 4 || cells.some(cell => cell === '')) throw new Error(`words.txt ${index + 1}번째 줄 칸이 비었어요: ${cells.join('|')}`)
})

const pad = number => String(number).padStart(4, '0')
const hintOf = en => en.match(/\(([^)]*)\)/)?.[1] ?? ''
const englishOf = en => en.replace(/\s*\([^)]*\)/g, '').trim()
const hasKanji = text => /\p{sc=Han}/u.test(text)

const ja = base.map((item, index) => {
  const [meaningKo, text, reading] = rows[index]
  return { id: `ja-${pad(index + 1)}`, order: index + 1, theme: item.theme, text, reading, kanji: hasKanji(text) ? text : null, meaningKo, hint: '', searchQuery: text }
})

const en = base.map((item, index) => {
  const [meaningKo, , , ipa] = rows[index]
  const text = englishOf(item.en)
  return { id: `en-${pad(index + 1)}`, order: index + 1, theme: item.theme, text, reading: ipa, kanji: null, meaningKo, hint: hintOf(item.en), searchQuery: text }
})

writeFileSync(new URL('../src/data/words-ja.json', import.meta.url), `${JSON.stringify(ja, null, 1)}\n`)
writeFileSync(new URL('../src/data/words-en.json', import.meta.url), `${JSON.stringify(en, null, 1)}\n`)
console.log(`일본어 ${ja.length}개, 영어 ${en.length}개`)
