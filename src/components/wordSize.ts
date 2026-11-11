import type { CSSProperties } from 'react'

// 굵은 라틴 글자는 대략 0.62em, 한자·가나는 1em 폭이다. 카드 폭을 이 합으로 나눠 긴 단어도 한 줄에 넣는다.
const unitsOf = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 0x2e80 ? 0.62 : 1), 0)

export const wordSizeStyle = (text: string) => ({ '--units': unitsOf(text) }) as CSSProperties
