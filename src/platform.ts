export type Person = '하치와레' | '우사기'
export type Language = 'ja' | 'en'

export const IS_WEB_BUILD = import.meta.env.MODE === 'web'

// 아이폰 홈 화면 웹앱은 우사기(영어), 안드로이드 앱은 하치와레(일본어)가 쓴다.
export const DEVICE_PERSON: Person = IS_WEB_BUILD ? '우사기' : '하치와레'

export const LANGUAGE_OF: Record<Person, Language> = { 하치와레: 'ja', 우사기: 'en' }
