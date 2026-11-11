// 어휘량 테스트 표본을 고르고(--pick), 뜻을 채운 표본을 앱이 읽는 JSON으로 만든다.
// 실행: node scripts/build-vocab.mjs --pick   → scripts/data/test-<lang>.txt (뜻 빈칸)
//       node scripts/build-vocab.mjs          → src/data/vocab-test-<lang>.json
// 표본 한 줄: 순위|벌(0·1)|우리말 뜻  # 단어 (읽기)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const LANGUAGES = ['ja', 'en']
const BANDS = 10
const BAND_SIZE = 1000
const PER_SET = 20

const dataFile = name => new URL(`./data/${name}`, import.meta.url)

const readFreq = language =>
  new Map(
    readFileSync(dataFile(`freq-${language}.tsv`), 'utf8')
      .split('\n')
      .slice(1)
      .filter(line => line.trim() !== '')
      .map(line => line.split('\t'))
      .map(([rank, text, reading]) => [Number(rank), { text, reading }]),
  )

// 표본이 매번 같도록 언어별 고정 시드를 쓴다.
const seededRandom = seed => {
  let state = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const pick = language => {
  const target = dataFile(`test-${language}.txt`)
  if (existsSync(target)) throw new Error(`test-${language}.txt가 이미 있어요. 표본이 바뀌지 않게 다시 고르지 않아요.`)
  const freq = readFreq(language)
  const random = seededRandom(`wordbook-${language}`)
  const lines = []
  for (let band = 0; band < BANDS; band += 1) {
    const ranks = Array.from({ length: BAND_SIZE }, (_, offset) => band * BAND_SIZE + offset + 1)
    for (let index = ranks.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[ranks[index], ranks[swap]] = [ranks[swap], ranks[index]]
    }
    ranks.slice(0, PER_SET * 2).forEach((rank, order) => {
      const { text, reading } = freq.get(rank)
      lines.push({ rank, set: order < PER_SET ? 0 : 1, note: `${text} (${reading})` })
    })
  }
  lines.sort((first, second) => first.rank - second.rank)
  writeFileSync(target, `${lines.map(line => `${line.rank}|${line.set}|  # ${line.note}`).join('\n')}\n`)
  console.log(`${language}: 표본 ${lines.length}개를 골랐어요`)
}

const build = language => {
  const freq = readFreq(language)
  const words = readFileSync(dataFile(`test-${language}.txt`), 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [rank, set, meaningKo] = line.split('#')[0].split('|').map(cell => cell.trim())
      const entry = freq.get(Number(rank))
      if (!entry) throw new Error(`${language} 순위 ${rank}가 빈도 목록에 없어요`)
      if (!meaningKo) throw new Error(`${language} 순위 ${rank}(${entry.text})의 뜻이 비었어요`)
      return { rank: Number(rank), band: Math.floor((Number(rank) - 1) / BAND_SIZE), set: Number(set), text: entry.text, reading: entry.reading, meaningKo }
    })
  writeFileSync(new URL(`../src/data/vocab-test-${language}.json`, import.meta.url), `${JSON.stringify(words, null, 1)}\n`)
  console.log(`${language}: 표본 ${words.length}개`)
}

LANGUAGES.forEach(process.argv.includes('--pick') ? pick : build)
