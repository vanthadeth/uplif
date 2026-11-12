/** What my_sign_in_methods() returns: the ways the signed-in user can sign in. `count` never includes placeholders. */
export interface SignInMethodsData {
  google: { email: string | null } | null;
  telegram: { name: string | null; username: string | null; linked_at: string } | null;
  phone: string | null;
  count: number;
}
