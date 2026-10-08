import { Skeleton } from "@/components/shared/Skeleton";

export default function OrdersLoading() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-9 w-48" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </section>
  );
}
