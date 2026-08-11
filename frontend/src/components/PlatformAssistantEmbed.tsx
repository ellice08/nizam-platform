import { useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useThemeStore } from "@/store"
import { PLATFORM_ORG_ID, PLATFORM_ASSISTANT_BRANCH_ID } from "@/lib/platformAssistant"

// Floating Nizam Assistant widget for the TENANT dashboard shell (CLAUDE.md
// §8 Tier 3 [8a] step 5) — dogfoods Nizam's own product to support Nizam's
// own users. Reuses public/widget.js UNCHANGED IN BEHAVIOR for a normal
// (public, tokenless) embed; this component only adds embed-time data
// attributes that widget.js reads as opt-in extras (auth token, capture
// disable, theme overrides — see widget.js's EMBED_OVERRIDES/DISABLE_CAPTURE
// for the counterpart). Mounted only for variant === "dashboard" in
// AppLayout.tsx — never on /admin/* (the operator manages Platform Support
// directly there, per the architecture decision in CLAUDE.md) and never on
// public/marketing pages.
const SCRIPT_ID = "nizam-platform-assistant-embed"

export function PlatformAssistantEmbed() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  useEffect(() => {
    let cancelled = false

    async function mount() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      // Always same-origin: this embed runs inside the dashboard, which
      // serves widget.js as its own static asset, so there is no host to
      // resolve. The PUBLIC snippet for external tenant sites goes through
      // lib/widgetEmbed.ts instead (it has a host to pick, and honours
      // VITE_WIDGET_URL for a custom domain/CDN).
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://nizam-platform-production.up.railway.app"

      const script = document.createElement("script")
      script.id = SCRIPT_ID
      script.setAttribute("data-org-id", PLATFORM_ORG_ID)
      // Ellice Systems has TWO branches (Headquarters + Platform Support) —
      // without an explicit branch the backend's org-default resolution
      // (first branch by created_at) lands on Headquarters, a different
      // agent with no KB. Pin the Platform Support branch explicitly; the
      // backend verifies it belongs to the org.
      script.setAttribute("data-branch-id", PLATFORM_ASSISTANT_BRANCH_ID)
      script.setAttribute("data-api", apiBase)
      script.setAttribute("data-disable-capture", "true")
      script.setAttribute("data-theme-mode", resolvedTheme)
      if (session?.access_token) {
        script.setAttribute("data-token", session.access_token)
      }
      script.src = `${window.location.origin}/widget.js`
      document.body.appendChild(script)
    }

    void mount()

    // The widget reads its bearer token fresh on every send — keep the
    // script tag's data-token in sync as Supabase rotates the session
    // (autoRefreshToken) so a long-open dashboard tab never falls back to
    // an unattributed ticket just because the original token expired.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const tag = document.getElementById(SCRIPT_ID)
      if (!tag) return
      if (session?.access_token) {
        tag.setAttribute("data-token", session.access_token)
      } else {
        tag.removeAttribute("data-token")
      }
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
      // widget.js appends its DOM (#nizam-widget-root) directly to
      // document.body, outside React's tree — must be torn down manually so
      // switching to /admin (a different AppLayout instance) doesn't leave
      // a stray bubble behind. The injected <style id="nizam-widget-styles">
      // is left in place (harmless, idempotent CSS) so a remount doesn't
      // need to re-inject it — see widget.js's own dedupe guard.
      document.getElementById("nizam-widget-root")?.remove()
      document.getElementById(SCRIPT_ID)?.remove()
    }
  }, [])

  // Manual in-app theme toggles aren't a `prefers-color-scheme` change, so
  // widget.js's own auto-detection never re-fires for them — push the
  // dashboard's real resolved theme through explicitly instead of relying
  // on the widget's best-effort host-page detection (see CLAUDE.md §8 Tier 3
  // [8a] step 5's theme note).
  useEffect(() => {
    window.NizamAssistantWidget?.setThemeMode?.(resolvedTheme)
  }, [resolvedTheme])

  return null
}

declare global {
  interface Window {
    NizamAssistantWidget?: {
      setThemeMode?: (mode: "light" | "dark") => void
    }
  }
}

export default PlatformAssistantEmbed
