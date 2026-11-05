import { createHashRouter } from 'react-router'
import TabLayout from './components/TabLayout'
import CollectionPage from './pages/CollectionPage'
import MakePage from './pages/MakePage'
import SettingsPage from './pages/SettingsPage'
import StudyPage from './pages/StudyPage'
import VillagePage from './pages/VillagePage'
import WordsPage from './pages/WordsPage'

export const router = createHashRouter([
  {
    element: <TabLayout />,
    children: [
      { path: '/', element: <VillagePage /> },
      { path: '/words', element: <WordsPage /> },
      { path: '/collection', element: <CollectionPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '/study', element: <StudyPage /> },
  { path: '/make/:wordId', element: <MakePage /> },
])
