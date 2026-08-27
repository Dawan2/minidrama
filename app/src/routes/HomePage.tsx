import { Link } from 'react-router';

import { playPath } from './routes';
import { translate } from '../core/i18n';

export function HomePage(): React.JSX.Element {
  return (
    <main data-testid="home-page">
      <h1>{translate('home.heading')}</h1>
      <p>{translate('home.skeletonNotice')}</p>
      <Link to={playPath('ep_demo_0001')}>{translate('home.openPlayer')}</Link>
    </main>
  );
}
