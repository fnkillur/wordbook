import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import { todaysWords } from './db/repository'
import { onSharedImage } from './media/image'
import { receiveSharedImage } from './media/sharedImage'
import { DEVICE_PERSON, LANGUAGE_OF } from './platform'
import { router } from './router'
import { getSettings } from './settings'

// 공유로 그림이 들어왔는데 만들기 화면이 아니면, 오늘 만들 다음 단어 화면을 열어 그 그림을 넣는다.
onSharedImage(image =>
  receiveSharedImage(image, async () => {
    const [next] = await todaysWords(LANGUAGE_OF[getSettings().person ?? DEVICE_PERSON], 1)
    router.navigate(next ? `/make/${next.id}` : '/words')
  }),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
