import { DEVICE_PERSON, IS_WEB_BUILD, type Person } from './platform'
import type { ServerSettings } from './sync/tts'

export type Settings = {
  person: Person | null
  goalMinutes: number
  soundOff: boolean
  spellCards: boolean
  server: ServerSettings | null
}

const KEY = 'wordbook.settings'

// 웹(아이폰)은 처음 열 때 사람을 고르고, 안드로이드 앱은 하치와레로 정해져 있다.
const DEFAULTS: Settings = { person: IS_WEB_BUILD ? null : DEVICE_PERSON, goalMinutes: 15, soundOff: false, spellCards: false, server: null }

export const getSettings = (): Settings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export const saveSettings = (patch: Partial<Settings>) => {
  const next = { ...getSettings(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장하지 못하면 이번 실행 동안만 적용된다.
  }
  return next
}
