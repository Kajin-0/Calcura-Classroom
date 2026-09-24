import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireSession } from '../features/auth/RequireSession';
import { SignInPage } from '../features/auth/SignInPage';
import { WorkspaceProvider } from '../features/workspaces/WorkspaceProvider';
import { ClassDetailPage } from '../features/classes/ClassDetailPage';
import { ClassListPage } from '../features/classes/ClassListPage';
import { TeacherLayout } from './TeacherLayout';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route element={<RequireSession />}>
        <Route element={<WorkspaceProvider />}>
          <Route path="/app" element={<TeacherLayout />}>
            <Route index element={<ClassListPage />} />
            <Route path="classes/:classId" element={<ClassDetailPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
