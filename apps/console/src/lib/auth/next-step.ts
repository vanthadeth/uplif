export interface SessionState {
  signedIn: boolean;
  hasProfile: boolean;
  hasCompanyClaim: boolean;
  companyCount: number;
}

/** Where a signed-in user belongs next. Pure so it can be tested. */
export function nextStep(s: SessionState): "/login" | "/profile" | "/companies/new" | "/companies" | "/dashboard" {
  if (!s.signedIn) return "/login";
  if (!s.hasProfile) return "/profile";
  if (s.hasCompanyClaim) return "/dashboard";
  return s.companyCount === 0 ? "/companies/new" : "/companies";
}
