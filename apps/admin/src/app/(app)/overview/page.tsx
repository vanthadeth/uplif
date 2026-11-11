import { Card, EmptyState } from "@uplif/ui";

export default function OverviewPage() {
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted">The state of the platform: subscribers, revenue and what needs attention.</p>
      </div>
      <Card>
        <EmptyState title="Nothing to show yet" body="Plans, subscribers and billing arrive in the next steps. This page will read them through checked database functions only." />
      </Card>
    </div>
  );
}
