// 기초 단어 목록(base625.json)과 언어별 자료(words.txt), 회화 빈도 단어(freq-<lang>.tsv + learn-<lang>.txt)를 합쳐 앱이 읽는 단어 파일을 만든다.
// 실행: node scripts/build-words.mjs (빈칸 문장 sentences-<lang>.txt도 함께 src/data/sentences-<lang>.json으로 만든다)
// learn-<lang>.txt 한 줄: 순위|우리말 뜻 또는 순위|우리말 뜻|고친 읽기  (# 뒤는 메모)
// 빈도 목록의 읽기는 형태소 분석이 고른 것이라 틀릴 때가 있어서(read를 rɛd로), 고친 읽기가 있으면 그걸 쓴다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

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
  return { id: `ja-${pad(index + 1)}`, order: index + 1, theme: item.theme, text, reading, kanji: hasKanji(text) ? text : null, meaningKo, hint: '', searchQuery: text, source: 'base', rank: null }
})

const en = base.map((item, index) => {
  const [meaningKo, , , ipa] = rows[index]
  const text = englishOf(item.en)
  return { id: `en-${pad(index + 1)}`, order: index + 1, theme: item.theme, text, reading: ipa, kanji: null, meaningKo, hint: hintOf(item.en), searchQuery: text, source: 'base', rank: null }
})

const readLines = name =>
  readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .map(line => line.split('#')[0].trim())
    .filter(line => line !== '')

// 빈도 순위가 곧 id라서(ja-f00123) 목록을 다시 만들어도 이미 만든 카드가 다른 단어를 가리키지 않는다.
const freqEntries = (language, baseEntries) => {
  const freq = new Map(
    readLines(`freq-${language}.tsv`)
      .slice(1)
      .map(line => line.split('\t'))
      .map(([rank, text, reading]) => [Number(rank), { text, reading: reading ?? '' }]),
  )
  const baseTexts = new Set(baseEntries.map(entry => entry.text))
  return readLines(`learn-${language}.txt`).map(line => {
    const [rank, meaningKo, fixedReading] = line.split('|').map(cell => cell.trim())
    const entry = freq.get(Number(rank))
    if (!entry) throw new Error(`learn-${language}.txt: 순위 ${rank}가 빈도 목록에 없어요`)
    if (!meaningKo) throw new Error(`learn-${language}.txt: 순위 ${rank}(${entry.text})의 뜻이 비었어요`)
    if (baseTexts.has(entry.text)) throw new Error(`learn-${language}.txt: ${entry.text}는 기초 625에 있어요`)
    const kanji = language === 'ja' && hasKanji(entry.text) ? entry.text : null
    return { id: `${language}-f${String(rank).padStart(5, '0')}`, order: Number(rank), theme: '회화', text: entry.text, reading: fixedReading || entry.reading, kanji, meaningKo, hint: '', searchQuery: entry.text, source: 'freq', rank: Number(rank) }
  })
}

const jaAll = [...ja, ...freqEntries('ja', ja)]
const enAll = [...en, ...freqEntries('en', en)]
writeFileSync(new URL('../src/data/words-ja.json', import.meta.url), `${JSON.stringify(jaAll, null, 1)}\n`)
writeFileSync(new URL('../src/data/words-en.json', import.meta.url), `${JSON.stringify(enAll, null, 1)}\n`)
console.log(`일본어 ${jaAll.length}개(빈도 ${jaAll.length - ja.length}), 영어 ${enAll.length}개(빈도 ${enAll.length - en.length})`)

// 빈칸 문장(sentences-<lang>.txt): 순위|[빈칸]을 감싼 문장|번역|출처(일본어는 |빈칸 읽기 더). 학습 단어마다 한 문장.
// 녹음은 public/sentence-audio/<lang>/<순위>.m4a 가 있을 때만 붙인다(받지 못한 문장은 앱이 TTS로 읽는다).
const NATIVE_SOURCES = /^(K|I|T)/
const KANA = /^[\u3041-\u3096ー]+$/u

const sentencesOf = (language, entries) => {
  const learnIds = new Set(entries.filter(entry => entry.source === 'freq').map(entry => entry.id))
  const sentences = {}
  for (const line of readFileSync(new URL(`./data/sentences-${language}.txt`, import.meta.url), 'utf8').split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue
    const [rank, marked, translation, source, reading] = line.split('|')
    const id = `${language}-f${rank.padStart(5, '0')}`
    const parts = marked.match(/^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$/)
    if (!learnIds.has(id)) throw new Error(`sentences-${language}.txt: 순위 ${rank}는 학습 목록에 없어요`)
    if (!parts) throw new Error(`sentences-${language}.txt: 순위 ${rank}의 빈칸 [ ]은 한 쌍이어야 해요`)
    if (!translation) throw new Error(`sentences-${language}.txt: 순위 ${rank}의 번역이 비었어요`)
    if (language === 'ja' && !KANA.test(reading ?? '')) throw new Error(`sentences-ja.txt: 순위 ${rank}의 빈칸 읽기가 가나가 아니에요`)
    const audioPath = `sentence-audio/${language}/${rank}.m4a`
    const hasAudio = NATIVE_SOURCES.test(source) && existsSync(new URL(`../public/${audioPath}`, import.meta.url))
    sentences[id] = { before: parts[1], answer: parts[2], after: parts[3], reading: language === 'ja' ? reading : null, translation, audioPath: hasAudio ? audioPath : null }
  }
  return sentences
}

for (const [language, entries] of [['ja', jaAll], ['en', enAll]]) {
  const sentences = sentencesOf(language, entries)
  writeFileSync(new URL(`../src/data/sentences-${language}.json`, import.meta.url), `${JSON.stringify(sentences, null, 1)}\n`)
  const values = Object.values(sentences)
  console.log(`${language} 문장 ${values.length}개(녹음 ${values.filter(sentence => sentence.audioPath).length})`)
}
