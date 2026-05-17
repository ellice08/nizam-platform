export type Industry = "real_estate" | "hospitality" | "other";

export type TelephonyMode =
  | "new_standard"
  | "new_vanity"
  | "existing_sim"
  | "existing_vanity";

export type WhatsappMode = "dedicated" | "migrate";

export type AgentRole = "org_admin" | "branch_admin" | "branch_staff" | "viewer";

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
  callbackHours: number;
  escalationContacts: { id: string; name: string; phone: string; email: string }[];
  afterHoursEnabled: boolean;
  afterHoursMessage: string;
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
  branchCount: number;
  feePaid: boolean;

  // Step 2
  logoName: string | null;
  primaryColor: string;
  secondaryColor: string;

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
  callbackHours: 1,
  escalationContacts: [],
  afterHoursEnabled: false,
  afterHoursMessage:
    "Our team is currently offline. We have captured your enquiry and will follow up first thing tomorrow morning.",
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
  branchCount: 1,
  feePaid: false,
  logoName: null,
  primaryColor: "#7A2535",
  secondaryColor: "#C4909A",
  branches: [newBranch(0, "real_estate")],
  clientEmail: "",
};

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
