import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// Returns the id to highlight (from ?<param>=) and whether the flash is currently active.
export function useHighlightOnArrival(param: string, opts?: { durationMs?: number }) {
  const [searchParams] = useSearchParams()
  const targetId = searchParams.get(param)
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (!targetId) return
    setFlashing(true)
    const t = setTimeout(() => setFlashing(false), opts?.durationMs ?? 2000)
    return () => clearTimeout(t)
  }, [targetId, opts?.durationMs])

  // isFlashing(id): true only for the matching row while the flash window is active
  const isFlashing = (id: string) => flashing && id === targetId
  return { targetId, isFlashing }
}
