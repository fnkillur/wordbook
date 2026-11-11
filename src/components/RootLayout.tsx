import { Outlet, ScrollRestoration } from 'react-router'

// 새 화면은 맨 위부터 보여 주고, 뒤로 돌아오면 보던 위치로 되돌린다.
function RootLayout() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}

export default RootLayout
