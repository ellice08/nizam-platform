import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useHighlightOnArrival(
  param: string,
  ready: boolean = true,
  opts?: { durationMs?: number },
) {
  const [searchParams] = useSearchParams()
  const targetId = searchParams.get(param)
  const [flashing, setFlashing] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!targetId || !ready || started.current) return
    started.current = true
    setFlashing(true)
    const t = setTimeout(() => setFlashing(false), opts?.durationMs ?? 3000)
    return () => clearTimeout(t)
  }, [targetId, ready, opts?.durationMs])

  const isFlashing = (id: string) => flashing && id === targetId
  return { targetId, isFlashing }
}
