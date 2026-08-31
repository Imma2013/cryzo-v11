export type CryzoPlan = "free" | "starter" | "builder" | "pro" | "elite";

const PLAN_RANK: Record<CryzoPlan, number> = {
  free: 0,
  starter: 1,
  builder: 2,
  pro: 3,
  elite: 4,
};

export function normalizeCryzoPlan(plan?: string | null): CryzoPlan {
  if (plan === "starter" || plan === "builder" || plan === "pro" || plan === "elite") {
    return plan;
  }
  if (plan === "pro_plus" || plan === "business") return "builder";
  return "free";
}

export function atLeast(plan: string | null | undefined, required: CryzoPlan) {
  return PLAN_RANK[normalizeCryzoPlan(plan)] >= PLAN_RANK[required];
}

export function canRemoveManagedBranding(plan?: string | null) {
  return atLeast(plan, "starter");
}

// Like Base44, a real custom domain is an upgrade feature. Cryzo-owned
// subdomains can still be published and renamed on every plan.
export function canUseManagedCustomDomains(plan?: string | null) {
  return atLeast(plan, "builder");
}

// App creation is unlimited. Cryzo does not put the EAS build/submission
// buttons behind a subscription tier; users still provide their own store and
// Expo credentials and pay Apple/Google fees directly.
export function canUseManagedMobileBuilds(_plan?: string | null) {
  return true;
}

export function canUseManagedStoreSubmission(_plan?: string | null) {
  return true;
}

export function canUseManagedBackendProvisioning(_plan?: string | null) {
  return true;
}

export function canUseCustomBackendFunctions(plan?: string | null) {
  return atLeast(plan, "builder");
}

export function entitlementSnapshot(plan?: string | null) {
  const normalized = normalizeCryzoPlan(plan);
  return {
    plan: normalized,
    unlimitedProjects: true,
    freeModelAccess: true,
    byok: true,
    sourceExport: true,
    githubSync: true,
    diyDeployments: true,
    storeReadinessScan: true,
    cryzoCloudDatabase: true,
    cryzoCloudAuth: true,
    cryzoCloudUsers: true,
    cryzoCloudRealtime: false,
    managedBrandingRemoval: canRemoveManagedBranding(normalized),
    managedCustomDomains: canUseManagedCustomDomains(normalized),
    managedMobileBuilds: true,
    managedStoreSubmission: true,
    managedBackendProvisioning: true,
    customBackendFunctions: canUseCustomBackendFunctions(normalized),
  };
}
