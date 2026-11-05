import { beforeEach, describe, expect, it, vi } from 'vitest'
import { receiveSharedImage, resetSharedImage, subscribeSharedImage, takeSharedImage } from './sharedImage'

const image = new Blob(['img'], { type: 'image/jpeg' })

beforeEach(() => resetSharedImage())

describe('공유로 받은 그림', () => {
  it('만들기 화면이 열려 있지 않으면 맡아 두고, 화면으로 보내 달라고 알린다', () => {
    const openMake = vi.fn()
    receiveSharedImage(image, openMake)

    expect(openMake).toHaveBeenCalledTimes(1)
    expect(takeSharedImage()).toBe(image)
    expect(takeSharedImage()).toBeNull()
  })

  it('만들기 화면이 열려 있으면 그 화면에 바로 넣는다', () => {
    const openMake = vi.fn()
    const onImage = vi.fn()
    const stop = subscribeSharedImage(onImage)
    receiveSharedImage(image, openMake)

    expect(onImage).toHaveBeenCalledWith(image)
    expect(openMake).not.toHaveBeenCalled()
    expect(takeSharedImage()).toBeNull()
    stop()
  })
})
