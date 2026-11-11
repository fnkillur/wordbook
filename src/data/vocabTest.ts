import type { Language } from '../platform'
import en from './vocab-test-en.json'
import ja from './vocab-test-ja.json'

// band: 1,000위 단위 구간(0 = 1~1,000위). set: 다시 볼 때 번갈아 쓰는 두 벌.
export type TestWord = { rank: number; band: number; set: 0 | 1; text: string; reading: string; meaningKo: string }

export const TEST_WORDS: Record<Language, TestWord[]> = { ja: ja as TestWord[], en: en as TestWord[] }
