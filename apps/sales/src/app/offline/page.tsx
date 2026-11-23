import { OfflineShell } from "@/components/offline-shell";

// Plain static page with no account data. The service worker keeps it on the phone and opens it when a
// screen is requested without signal; it then draws the screen from the copy saved on this phone.
export default function OfflinePage() {
  return <OfflineShell />;
}
