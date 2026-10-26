'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useMe } from './me';
import { useLiveSource, type LiveSource } from './live';

interface GroupLive {
  live: LiveSource | null;
  /** Who has Kyon open right now (any page). */
  online: string[];
}

const GroupLiveContext = createContext<GroupLive>({ live: null, online: [] });

/**
 * One socket to the group room for the whole app: presence ("chi è online") on every page,
 * reused by the group chat instead of opening a second one.
 */
export function GroupLiveProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const live = useLiveSource(me.data ? 'room=general' : null);
  const [online, setOnline] = useState<string[]>([]);
  useEffect(
    () =>
      live.subscribe((event) => {
        if (event.type === 'presence') setOnline(event.userIds);
      }),
    [live],
  );
  return (
    <GroupLiveContext.Provider value={{ live: me.data ? live : null, online }}>
      {children}
    </GroupLiveContext.Provider>
  );
}

export const useGroupLive = () => useContext(GroupLiveContext);
