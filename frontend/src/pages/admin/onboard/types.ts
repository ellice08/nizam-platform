import type { AgentIntent } from '@/api'

import type { NicheValue } from "@/lib/niches";

export type Industry = "real_estate" | "hospitality" | "other";

export type TelephonyMode =
  | "new_standard"
  | "new_vanity"
  | "existing_sim"
  | "existing_vanity";

export type WhatsappMode = "dedicated" | "migrate";

export type AgentRole = "branch_admin";

export type BranchUser = {
  id: string;
  name: string;
  email: string;
  role: AgentRole;
};

export type Branch = {
  id: string;
  name: string;
  city: string;
  timezone: string;
  telephony: TelephonyMode;
  vanityOperator?: string;
  existingNumber?: string;
  vanityNumber?: string;
  whatsapp: WhatsappMode;
  users: BranchUser[];
  agentName: string;
  voice: string;
  tone: "professional" | "friendly" | "formal";
  language: string;
  confirmationHours: number;
  confirmationEnabled: boolean;
  callbackHours: number;
  escalationContacts: { id: string; name: string; phone: string; email: string }[];
  afterHoursEnabled: boolean;
  afterHoursMessage: string;
  businessHours: {
    enabled: boolean;
    mode: "simple" | "custom";
    days: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
      { open: string; close: string; closed: boolean }>;
  };
  intents: AgentIntent[];
  files: { id: string; name: string; size: string; file?: File }[];
  crawlEnabled: boolean;
  crawlUrl: string;
  crawlFrequency: "ondemand" | "weekly" | "monthly";
  labels: [string, string, string, string];
};

export type WizardState = {
  // Step 1
  companyName: string;
  slug: string;
  slugEdited: boolean;
  industry: Industry;
  // Explicit, operator-confirmed agent niche. Defaults from `industry` but is
  // a separate field on purpose — it selects the agent's behavioural template
  // and used to be derived silently, so the two could drift with no signal.
  niche: NicheValue;
  nicheEdited: boolean;
  branchCount: number;
  feePaid: boolean;

  // Step 2
  logoFile: File | null;
  logoName: string | null;
  logoDarkFile: File | null;
  logoDarkName: string | null;
  primaryColor: string;
  primaryHoverColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;

  // Step 3-5 per branch
  branches: Branch[];

  // Step 6
  clientEmail: string;
};

export const defaultLabelsByIndustry: Record<Industry, [string, string, string, string]> = {
  real_estate: ["Enquiries", "Viewings booked", "Offers received", "Tenants signed"],
  hospitality: ["Enquiries", "Bookings", "Check-ins", "Reviews"],
  other: ["Conversations", "Leads", "Resolutions", "Escalations"],
};

export const newBranch = (i: number, industry: Industry): Branch => ({
  id: `b${Date.now()}-${i}`,
  name: `Branch ${i + 1}`,
  city: "",
  timezone: "Africa/Lagos",
  telephony: "new_standard",
  whatsapp: "dedicated",
  users: [],
  agentName: "Aria",
  voice: "professional_female",
  tone: "professional",
  language: "English",
  confirmationHours: 2,
  confirmationEnabled: false,
  callbackHours: 1,
  escalationContacts: [],
  afterHoursEnabled: false,
  afterHoursMessage:
    "Our team is currently offline. We have captured your enquiry and will follow up first thing tomorrow morning.",
  businessHours: {
    enabled: false,
    mode: "simple",
    days: {
      mon: { open: "09:00", close: "17:00", closed: false },
      tue: { open: "09:00", close: "17:00", closed: false },
      wed: { open: "09:00", close: "17:00", closed: false },
      thu: { open: "09:00", close: "17:00", closed: false },
      fri: { open: "09:00", close: "17:00", closed: false },
      sat: { open: "09:00", close: "17:00", closed: true },
      sun: { open: "09:00", close: "17:00", closed: true },
    },
  },
  intents: [],
  files: [],
  crawlEnabled: false,
  crawlUrl: "",
  crawlFrequency: "ondemand",
  labels: defaultLabelsByIndustry[industry],
});

export const initialState: WizardState = {
  companyName: "",
  slug: "",
  slugEdited: false,
  industry: "real_estate",
  niche: "real_estate",
  nicheEdited: false,
  branchCount: 1,
  feePaid: false,
  logoFile: null,
  logoName: null,
  logoDarkFile: null,
  logoDarkName: null,
  primaryColor: "#7A2535",
  primaryHoverColor: "#8F2D3F",
  secondaryColor: "#C4909A",
  accentColor: "#7A2535",
  backgroundColor: "#0E0E0C",
  branches: [newBranch(0, "real_estate")],
  clientEmail: "",
};

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
