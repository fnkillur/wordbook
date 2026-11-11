import { act } from 'react'

// 저장소를 거친 화면 변화는 컴퓨터가 바쁘면 늦게 온다. 정해진 시간 대신 화면이 바뀔 때까지(최대 timeout) 기다린다.
export const waitUntil = async (isReady: () => boolean, timeout = 3000) => {
  const deadline = Date.now() + timeout
  while (!isReady() && Date.now() < deadline) await act(() => new Promise(resolve => setTimeout(resolve, 20)))
}
