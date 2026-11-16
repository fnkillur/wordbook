import { describe, expect, it } from 'vitest'
import { fitSize, readWebClipboard } from './image'

describe('fitSize', () => {
  it('긴 쪽을 800px에 맞춰 비율대로 줄인다', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 800, height: 600 })
    expect(fitSize(1000, 4000)).toEqual({ width: 200, height: 800 })
  })

  it('작은 이미지는 그대로 둔다', () => {
    expect(fitSize(640, 480)).toEqual({ width: 640, height: 480 })
  })
})

describe('readWebClipboard', () => {
  const itemOf = (blobs: Record<string, Blob>) => ({ types: Object.keys(blobs), getType: async (type: string) => blobs[type] })

  it('복사한 그림이 있으면 그림을 돌려준다', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    expect(await readWebClipboard(async () => [itemOf({ 'text/plain': new Blob(['x']), 'image/png': png })])).toEqual({ image: { blob: png, signature: '' } })
  })

  it('그림 대신 링크만 복사돼 있으면 링크라고 알려 준다', async () => {
    const link = new Blob(['https://www.google.com/imgres?imgurl=x'], { type: 'text/uri-list' })
    expect(await readWebClipboard(async () => [itemOf({ 'text/uri-list': link })])).toEqual({ missing: 'link' })
  })

  it('아무것도 없으면 비었다고, 읽기를 허락받지 못하면 거절됐다고 알려 준다', async () => {
    expect(await readWebClipboard(async () => [])).toEqual({ missing: 'empty' })
    expect(await readWebClipboard(async () => Promise.reject(new DOMException('denied', 'NotAllowedError')))).toEqual({ missing: 'denied' })
  })
})
