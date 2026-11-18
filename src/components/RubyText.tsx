import { Fragment } from 'react'
import { rubySegments, type Ruby } from '../data/sentences'

// 일본어 문장의 한자 위에 읽기를 작게 단다.
export function RubyText({ text, offset, ruby }: { text: string; offset: number; ruby: Ruby[] | undefined }) {
  return <RubySegments segments={rubySegments(text, offset, ruby)} />
}

export function RubySegments({ segments }: { segments: { text: string; reading?: string }[] }) {
  return segments.map((segment, index) =>
    segment.reading ? (
      <ruby key={index}>
        {segment.text}
        <rt>{segment.reading}</rt>
      </ruby>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  )
}
