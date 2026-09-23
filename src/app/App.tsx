import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { AuthSessionProvider } from '../features/auth/AuthSessionProvider';

export function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthSessionProvider>
  );
}
