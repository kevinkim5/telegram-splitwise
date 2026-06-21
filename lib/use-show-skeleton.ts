import { useEffect, useState } from 'react'

export function useShowSkeleton(isLoading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!isLoading) { setShow(false); return }
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [isLoading, delay])
  return show
}
