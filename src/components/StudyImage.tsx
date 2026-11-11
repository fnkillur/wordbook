import { useCallback } from 'react'

// 그림 주소는 그림이 붙을 때 만들고 떨어질 때 지운다. 개발 모드가 두 번 붙였다 떼도 지운 주소를 쓰지 않는다.
function StudyImage({ image }: { image: Blob }) {
  const attach = useCallback(
    (element: HTMLImageElement | null) => {
      if (!element) return
      const url = URL.createObjectURL(image)
      element.src = url
      return () => URL.revokeObjectURL(url)
    },
    [image],
  )

  return <img ref={attach} className="study-image" alt="" />
}

export default StudyImage
