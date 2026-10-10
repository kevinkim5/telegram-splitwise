'use client'

import { createContext, useContext, useEffect, useRef } from 'react'

// Tabs stay mounted while hidden, so a tab needs to be told when it is shown again.
export const TabActiveContext = createContext<boolean>(true)

export function useTabActive(): boolean {
  return useContext(TabActiveContext)
}

// Runs `onShown` each time the tab goes from hidden to shown (not on the first mount, which loads
// its own data). Used to quietly refresh data that may have changed while the tab was away.
export function useOnTabShown(onShown: () => void) {
  const active = useTabActive()
  const was = useRef(active)
  const cb = useRef(onShown)
  cb.current = onShown
  useEffect(() => {
    if (active && !was.current) cb.current()
    was.current = active
  }, [active])
}

// How old (ms) a tab's data may be before coming back to the tab refreshes it
export const STALE_AFTER_MS = 20_000
