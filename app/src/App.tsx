import { Navigate, Route, Routes } from 'react-router';

import { DramaPage } from './routes/DramaPage';
import { FallbackPage } from './routes/FallbackPage';
import { HomePage } from './routes/HomePage';
import { PlayPage } from './routes/PlayPage';
import { ROUTES, fallbackPath } from './routes/routes';
import type { PlatformBridge } from './platform/types';

export interface AppProps {
  readonly bridge: PlatformBridge;
}

export function App({ bridge }: AppProps): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={ROUTES.home} replace />} />
      <Route path={ROUTES.home} element={<HomePage />} />
      <Route path={ROUTES.drama} element={<DramaPage bridge={bridge} />} />
      <Route path={ROUTES.play} element={<PlayPage bridge={bridge} />} />
      <Route path={ROUTES.fallback} element={<FallbackPage />} />
      {/*
        A static ZIP has no server to answer 404, so an unmatched path is resolved here and given
        the reason the fallback screen needs to explain itself (IA §5).
      */}
      <Route path="*" element={<Navigate to={fallbackPath('NOT_FOUND')} replace />} />
    </Routes>
  );
}
