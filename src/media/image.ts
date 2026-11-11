import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { Placement } from './crop'

const MAX_SIDE = 800
const JPEG_QUALITY = 0.8

type ClipboardImagePlugin = {
  read: () => Promise<{ data?: string; mimeType?: string; signature?: string }>
  addListener(event: 'sharedImage', callback: (image: { data: string; mimeType: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'windowFocus', callback: () => void): Promise<PluginListenerHandle>
}

// 안드로이드 앱에서만 쓰는 네이티브 플러그인(ClipboardImagePlugin.java).
const ClipboardImage = registerPlugin<ClipboardImagePlugin>('ClipboardImage')

export const fitSize = (width: number, height: number, max = MAX_SIDE) => {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export const compressImage = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob)
  const size = fitSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')!
  // JPEG는 투명을 못 담아서, 투명한 PNG가 검게 저장되지 않게 흰색을 먼저 칠한다.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error('이미지를 줄이지 못했어요.'))), 'image/jpeg', JPEG_QUALITY),
  )
}

// 카드 그림은 4:3으로 저장한다. 고를 때 칸에 보이던 모습 그대로 잘라서 복습 카드와 같게 한다.
export const CARD_IMAGE_SIZE = { width: MAX_SIDE, height: (MAX_SIDE * 3) / 4 }

export const cropImage = async (blob: Blob, placement: Placement) => {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = CARD_IMAGE_SIZE.width
  canvas.height = CARD_IMAGE_SIZE.height
  const context = canvas.getContext('2d')!
  // 전체가 보이게 줄인 그림은 남는 곳을 흰색으로 채운다. 검색 그림은 대부분 흰 배경이다.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, placement.x, placement.y, placement.width, placement.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error('그림을 자르지 못했어요.'))), 'image/jpeg', JPEG_QUALITY),
  )
}

const fromBase64 = (data: string, mimeType: string) => {
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

export type ClipboardImage = { blob: Blob; signature: string }

// 웹은 사용자가 버튼을 누른 순간에만 읽을 수 있고(사파리는 '붙여넣기' 확인이 뜬다), 안드로이드 앱은 돌아왔을 때 바로 읽는다.
export const readClipboardImage = async (): Promise<ClipboardImage | null> => {
  if (Capacitor.isNativePlatform()) {
    const result = await ClipboardImage.read()
    if (!result.data || !result.mimeType) return null
    return { blob: fromBase64(result.data, result.mimeType), signature: result.signature ?? '' }
  }
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find(candidate => candidate.startsWith('image/'))
    if (type) return { blob: await item.getType(type), signature: '' }
  }
  return null
}

// 안드로이드 10부터는 앱 창이 입력 포커스를 받은 뒤에야 클립보드를 읽을 수 있어서, 돌아온 순간이 아니라 포커스를 받은 때 읽는다.
export const onWindowFocus = (callback: () => void) => {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = ClipboardImage.addListener('windowFocus', callback)
  return () => {
    handle.then(listener => listener.remove())
  }
}

export const onSharedImage = (callback: (blob: Blob) => void) => {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = ClipboardImage.addListener('sharedImage', image => callback(fromBase64(image.data, image.mimeType)))
  return () => {
    handle.then(listener => listener.remove())
  }
}
