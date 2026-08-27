import { Navigate, Route, Routes } from 'react-router';

import { FallbackPage } from './routes/FallbackPage';
import { HomePage } from './routes/HomePage';
import { PlayPage } from './routes/PlayPage';
import { ROUTES } from './routes/routes';
import type { PlatformBridge } from './platform/types';

export interface AppProps {
  readonly bridge: PlatformBridge;
}

export function App({ bridge }: AppProps): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ROUTES.home} replace />} />
      <Route path={ROUTES.home} element={<HomePage />} />
      <Route path={ROUTES.play} element={<PlayPage bridge={bridge} />} />
      <Route path={ROUTES.fallback} element={<FallbackPage />} />
      <Route path="*" element={<Navigate to={ROUTES.fallback} replace />} />
    </Routes>
  );
}
