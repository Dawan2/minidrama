import { createContext, useContext } from 'react';

import type { Session } from './session';

/**
 * How a surface reaches the session.
 *
 * Context rather than a module singleton, and with no default value, for the same two reasons as
 * `CatalogApiProvider`: a singleton cannot be swapped in a test without module mocking, and a
 * screen rendered with no provider above it is a wiring bug that is far cheaper to find as a thrown
 * error than as a profile screen that quietly claims every viewer is a guest.
 *
 * Defaulting to an anonymous session would be the tempting alternative and it is the wrong one
 * here. "Anonymous" is a *claim about the viewer*, and a claim nobody supplied is a claim nobody
 * checked.
 */
const SessionContext = createContext<Session | null>(null);

export interface SessionProviderProps {
  readonly session: Session;
  readonly children: React.ReactNode;
}

export function SessionProvider({ session, children }: SessionProviderProps): React.JSX.Element {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession requires a <SessionProvider> above it');
  }
  return session;
}
