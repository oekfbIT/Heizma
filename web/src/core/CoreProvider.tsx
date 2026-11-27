/**
 * @file      CoreProvider.tsx – React-Context: stellt den CoreInteractor bereit (useCore)
 * @layer     Web · Core
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiService } from './ApiService';
import { getToken, handleUnauthorized } from './auth';
import { CoreInteractor } from './CoreInteractor';

const CoreContext = createContext<CoreInteractor | null>(null);

/** Erstellt einmal pro App den ApiService und den CoreInteractor */
export function CoreProvider({ children, core }: { children: ReactNode; core?: CoreInteractor }) {
  const [instance] = useState(() => core ?? new CoreInteractor(new ApiService({ getToken, onUnauthorized: handleUnauthorized })));
  // Automatisch neu planen: ändert sich der Datenstand, werden alle sichtbaren Ansichten nachgeladen
  useEffect(() => (core ? undefined : instance.watchForChanges()), [core, instance]);
  return <CoreContext.Provider value={instance}>{children}</CoreContext.Provider>;
}

/** Zugriff auf den CoreInteractor – der einzige Datenzugang für Views */
export function useCore(): CoreInteractor {
  const core = useContext(CoreContext);
  if (!core) throw new Error('useCore muss innerhalb von <CoreProvider> verwendet werden');
  return core;
}
