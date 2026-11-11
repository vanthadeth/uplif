import { Card, CardBody, Skeleton } from "@uplif/ui";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => <Card key={i}><CardBody className="flex flex-col gap-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-40" /></CardBody></Card>)}
      </div>
    </div>
  );
}
