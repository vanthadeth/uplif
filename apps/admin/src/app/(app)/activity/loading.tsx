import { Card, CardBody, Skeleton } from "@uplif/ui";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-72" />
      <Card><CardBody className="flex flex-col gap-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
    </div>
  );
}
