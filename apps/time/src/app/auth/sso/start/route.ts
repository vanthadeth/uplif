import { ssoStartRoute } from "@uplif/auth/server";

// Signed out: ask the hub (UPLIF Admin) whether this person is signed in there (single sign-on, see packages/auth).
export const GET = ssoStartRoute;
