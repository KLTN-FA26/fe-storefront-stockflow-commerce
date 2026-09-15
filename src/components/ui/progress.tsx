import { cn } from "@/lib/cn";

interface ProgressProps extends React.ComponentProps<"div"> {
  value?: number | null;
}

function Progress({ className, value, ...props }: ProgressProps) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-bg-muted", className)} {...props}>
      <div className="h-full bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

export { Progress };
