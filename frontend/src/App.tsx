import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

import Login from '@/pages/Login'
import StudentLayout from '@/pages/student/Layout'
import StudentHome from '@/pages/student/Home'
import StudentTopic from '@/pages/student/Topic'
import StudentLesson from '@/pages/student/Lesson'
import StudentLeaderboard from '@/pages/student/Leaderboard'
import StudentPod from '@/pages/student/Pod'
import StudentProfile from '@/pages/student/Profile'
import StudentTopics from '@/pages/student/Topics'
import StudentTest   from '@/pages/student/Test'
import StudentTestBank from '@/pages/student/TestBank'
import AdminLayout from '@/pages/admin/Layout'
import AdminDashboard from '@/pages/admin/Dashboard'
import AdminStudents from '@/pages/admin/Students'
import AdminContent from '@/pages/admin/Content'
import AdminPod from '@/pages/admin/Pod'
import AdminTestBank from '@/pages/admin/TestBank'

function RootRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/student" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentHome />} />
            <Route path="topic/:id" element={<StudentTopic />} />
            <Route path="lesson/:id" element={<StudentLesson />} />
            <Route path="leaderboard" element={<StudentLeaderboard />} />
            <Route path="pod" element={<StudentPod />} />
            <Route path="topics"    element={<StudentTopics />} />
            <Route path="test/:id" element={<StudentTest />} />
            <Route path="exam" element={<StudentTestBank />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="content" element={<AdminContent />} />
            <Route path="pod" element={<AdminPod />} />
            <Route path="test-bank" element={<AdminTestBank />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
