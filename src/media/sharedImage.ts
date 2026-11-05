// 다른 앱에서 '공유 → wordbook'으로 보낸 그림. 만들기 화면이 열려 있으면 바로 넣고, 아니면 맡아 두었다가 화면을 열어 넣는다.
let pending: Blob | null = null
let subscriber: ((image: Blob) => void) | null = null

export const receiveSharedImage = (image: Blob, openMake: () => void) => {
  if (subscriber) {
    subscriber(image)
    return
  }
  pending = image
  openMake()
}

export const takeSharedImage = () => {
  const image = pending
  pending = null
  return image
}

export const subscribeSharedImage = (onImage: (image: Blob) => void) => {
  subscriber = onImage
  return () => {
    if (subscriber === onImage) subscriber = null
  }
}

export const resetSharedImage = () => {
  pending = null
  subscriber = null
}
