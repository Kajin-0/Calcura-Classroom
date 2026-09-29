import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes';
import { AuthSessionProvider } from '../features/auth/AuthSessionProvider';
import { getRouterBasename } from './routerBasename';

export function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter basename={getRouterBasename(import.meta.env.BASE_URL)}>
        <AppRoutes />
      </BrowserRouter>
    </AuthSessionProvider>
  );
}
