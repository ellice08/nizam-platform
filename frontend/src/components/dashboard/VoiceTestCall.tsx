import { useEffect, useRef, useState } from 'react'
import { RetellWebClient } from 'retell-client-js-sdk'
import { Phone, PhoneOff, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { voiceApi } from '@/api'

// In-app voice test (CLAUDE.md §5.2). Audio runs over WebRTC in the browser —
// no phone number, no telephony leg — but the call still reaches the SAME
// Custom LLM WebSocket brain as a real inbound call, so what you hear here is
// exactly what a caller would hear, and the call lands in Conversations with
// transcript and recording like any other.
type CallState = 'idle' | 'starting' | 'connecting' | 'live' | 'ended' | 'error'

type TranscriptTurn = { role: string; content: string }

export function VoiceTestCall({ retellAgentId, label }: { retellAgentId: string; label: string }) {
  const [state, setState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([])

  // The live client lives in a ref, not state: it is a mutable resource with
  // its own lifecycle, and re-renders must never recreate or drop it.
  const clientRef = useRef<RetellWebClient | null>(null)
  // Guards against setState after unmount — the SDK can emit during teardown.
  const mountedRef = useRef(true)

  const teardown = () => {
    const client = clientRef.current
    clientRef.current = null
    if (!client) return
    try {
      client.removeAllListeners()
      client.stopCall()
    } catch {
      // Already stopped or never fully started — nothing to salvage.
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      // Unmounting with a call in flight (navigating away mid-call) must not
      // leave a live WebRTC connection or a hot mic behind.
      mountedRef.current = false
      teardown()
    }
  }, [])

  const startCall = async () => {
    setError(null)
    setTranscript([])
    setState('starting')

    // Ask for the mic explicitly BEFORE minting a token. Two reasons: the
    // token is short-lived (~30s), so burning it while the user stares at a
    // permission prompt would waste it; and an explicit request lets us tell
    // "denied" apart from a generic failure and say something useful.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Release immediately — the SDK opens its own stream; holding this one
      // would leave a second mic indicator lit.
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      const name = (err as { name?: string })?.name
      setState('error')
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Connect one and try again.'
            : 'Could not access your microphone.',
      )
      return
    }

    let accessToken: string
    try {
      const res = await voiceApi.createTestCall(retellAgentId)
      accessToken = res.accessToken
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      setState('error')
      setError(msg ?? 'Could not start the test call. Please try again.')
      return
    }

    const client = new RetellWebClient()
    clientRef.current = client

    client.on('call_started', () => { if (mountedRef.current) setState('live') })
    client.on('call_ended', () => {
      if (mountedRef.current) setState('ended')
      teardown()
    })
    client.on('update', (update: { transcript?: TranscriptTurn[] }) => {
      if (mountedRef.current && Array.isArray(update?.transcript)) {
        setTranscript(update.transcript)
      }
    })
    client.on('error', (e: unknown) => {
      if (mountedRef.current) {
        setState('error')
        setError(typeof e === 'string' ? e : 'The call ended unexpectedly.')
      }
      teardown()
    })

    try {
      setState('connecting')
      await client.startCall({ accessToken })
    } catch {
      if (mountedRef.current) {
        setState('error')
        setError('Could not connect the call. Please try again.')
      }
      teardown()
    }
  }

  const endCall = () => {
    teardown()
    if (mountedRef.current) setState('ended')
  }

  const busy = state === 'starting' || state === 'connecting'
  const active = busy || state === 'live'

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        {!active ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { void startCall() }}
            className="border-border text-[hsl(var(--text-secondary))]"
            title={`Talk to ${label} from your browser`}
          >
            <Phone className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            {state === 'ended' || state === 'error' ? 'Test again' : 'Test call'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={endCall}
            className="border-rose-400 text-rose-400 hover:bg-rose-400/10"
            title="End the call"
          >
            <PhoneOff className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            End call
          </Button>
        )}

        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-tertiary))]">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
            {state === 'starting' ? 'Preparing…' : 'Connecting…'}
          </span>
        )}
        {state === 'live' && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live — speak now
          </span>
        )}
        {state === 'ended' && (
          <span className="text-xs text-[hsl(var(--text-tertiary))]">
            Call ended — it will appear in Conversations shortly.
          </span>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-400 mt-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" strokeWidth={1.5} />
          {error}
        </p>
      )}

      {transcript.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface px-3 py-2 space-y-1.5">
          {transcript.map((t, i) => (
            <p key={i} className="text-xs leading-relaxed">
              <span className="text-[hsl(var(--text-tertiary))] uppercase tracking-wider mr-1.5">
                {t.role === 'agent' ? 'Agent' : 'You'}
              </span>
              <span className="text-foreground">{t.content}</span>
            </p>
          ))}
        </div>
      )}

      {!active && state !== 'ended' && (
        <p className="text-[11px] text-[hsl(var(--text-tertiary))] mt-1.5">
          Talks to your agent in the browser — no phone call. Uses your voice minutes.
        </p>
      )}
    </div>
  )
}

export default VoiceTestCall
