import { createHashRouter } from 'react-router'
import RootLayout from './components/RootLayout'
import TabLayout from './components/TabLayout'
import BookPage from './pages/BookPage'
import ExamPage from './pages/ExamPage'
import MakePage from './pages/MakePage'
import SettingsPage from './pages/SettingsPage'
import ShopPage from './pages/ShopPage'
import StudyPage from './pages/StudyPage'
import VillagePage from './pages/VillagePage'
import VocabTestPage from './pages/VocabTestPage'
import WordsPage from './pages/WordsPage'

export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <TabLayout />,
        children: [
          { path: '/', element: <VillagePage /> },
          { path: '/words', element: <WordsPage /> },
          { path: '/words/:bookId', element: <BookPage /> },
          { path: '/shop', element: <ShopPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      { path: '/study', element: <StudyPage /> },
      { path: '/make/:wordId', element: <MakePage /> },
      { path: '/test', element: <VocabTestPage /> },
      { path: '/exam', element: <ExamPage /> },
    ],
  },
])
