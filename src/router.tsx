import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { LessonEditorPage } from './features/lessons/LessonEditorPage'
import { LessonsListPage } from './features/lessons/LessonsListPage'
import { StudentPlayer } from './features/player/StudentPlayer'
import { PublishPage } from './features/publish/PublishPage'
import { AssignmentDetailPage } from './features/results/AssignmentDetailPage'
import { ResultsPage } from './features/results/ResultsPage'

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:token" element={<StudentPlayer />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/lessons" replace />} />
          <Route path="/lessons" element={<LessonsListPage />} />
          <Route path="/lessons/:id" element={<LessonEditorPage />} />
          <Route path="/lessons/:id/publish" element={<PublishPage />} />
          <Route path="/lessons/:id/results" element={<ResultsPage />} />
          <Route path="/assignments/:id" element={<AssignmentDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/lessons" replace />} />
      </Routes>
    </HashRouter>
  )
}
