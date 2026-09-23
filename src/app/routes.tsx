import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireSession } from '../features/auth/RequireSession';
import { SignInPage } from '../features/auth/SignInPage';
import { ClassroomHome } from './views/ClassroomHome';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route element={<RequireSession />}>
        <Route path="/app" element={<ClassroomHome />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
