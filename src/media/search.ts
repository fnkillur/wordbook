import type { WordEntry } from '../data/words'
import type { Language } from '../platform'

export const googleImageUrl = (word: WordEntry, language: Language) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(word.searchQuery)}&hl=${language}`
