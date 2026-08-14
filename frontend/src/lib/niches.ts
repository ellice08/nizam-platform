// Single source of truth for the agent niche list, shared by the onboarding
// wizard (Step 4) and the client-detail niche editor. Keeping one list is the
// point: the two surfaces set the same column, and a niche offered in one but
// not the other would silently strand clients on a value nobody can pick again.
//
// A niche selects the behavioural template an agent's instructions start from
// (`niche_templates.system_prompt_template`). It is NOT the same field as the
// organisation's `industry`, though the wizard defaults one from the other —
// they diverged silently once already, which is how a real-estate client ended
// up running a hospitality prompt.
export type NicheValue = 'real_estate' | 'hospitality'

export interface NicheOption {
  value: NicheValue
  label: string
  /** One line describing how the template makes the agent behave. */
  implies: string
}

export const NICHE_OPTIONS: NicheOption[] = [
  {
    value: 'real_estate',
    label: 'Real estate',
    implies: 'Introduces itself as a property consultant; expects questions about listings, viewings and availability.',
  },
  {
    value: 'hospitality',
    label: 'Hospitality',
    implies: 'Introduces itself as a reservations and guest services specialist; expects questions about rooms, bookings and facilities.',
  },
]

export const NICHE_LABELS: Record<string, string> = Object.fromEntries(
  NICHE_OPTIONS.map(n => [n.value, n.label]),
)

export function nicheLabel(niche: string | null | undefined): string {
  if (!niche) return 'Not set'
  return NICHE_LABELS[niche] ?? niche
}

// The wizard defaults niche from the org's industry. Industry has an "other"
// value with no matching template, so fall back to the first real niche rather
// than writing a value that resolves to no template at all.
export function defaultNicheForIndustry(industry: string | null | undefined): NicheValue {
  if (industry && NICHE_OPTIONS.some(n => n.value === industry)) return industry as NicheValue
  return NICHE_OPTIONS[0].value
}
