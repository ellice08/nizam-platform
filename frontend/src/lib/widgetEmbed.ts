// Single source of truth for the PUBLIC embed snippet tenants copy onto
// their own websites. Shown on the Channels web-chat card and the Agent
// page — previously duplicated inline in both, which is how the wrong host
// below survived in two places at once.
//
// widget.js is a static asset of THIS frontend (frontend/public/widget.js),
// so it is served from the frontend's own origin. It is NOT served by the
// Railway backend: that origin returns a JSON 404 for /widget.js AND sends
// helmet()'s default `Cross-Origin-Resource-Policy: same-origin`, which
// blocks a cross-origin <script> load outright. An embed pointed there fails
// on a tenant's site with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin. Only
// `data-api` points at the backend — that's a fetch to /api/widget/*, which
// has its own permissive CORS.
const API_FALLBACK = 'https://nizam-platform-production.up.railway.app'

function normaliseOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

// VITE_WIDGET_URL exists to override the host (custom domain / CDN). It used
// to be documented as "the backend origin", which was the bug — so a value
// equal to the API base is treated as that stale misconfiguration and
// ignored rather than silently emitting a snippet that cannot load. This
// keeps production correct even if the deployment env still carries the old
// value.
export function resolveWidgetHost(): string {
  const configured = import.meta.env.VITE_WIDGET_URL as string | undefined
  const apiBase = resolveApiBase()

  if (configured) {
    const host = normaliseOrigin(configured)
    if (host !== apiBase) return host
  }

  return normaliseOrigin(window.location.origin)
}

export function resolveApiBase(): string {
  return normaliseOrigin((import.meta.env.VITE_API_URL as string | undefined) ?? API_FALLBACK)
}

export function buildEmbedCode(organisationId: string | null | undefined): string {
  return [
    `<script src="${resolveWidgetHost()}/widget.js"`,
    `  data-org-id="${organisationId ?? ''}"`,
    `  data-api="${resolveApiBase()}"></script>`,
  ].join('\n')
}
