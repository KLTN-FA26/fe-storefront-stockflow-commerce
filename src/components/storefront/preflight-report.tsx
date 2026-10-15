import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";

interface PreflightIssue {
  id: string;
  level: "pass" | "warning" | "fail";
  message: string;
}

interface PreflightReportProps {
  issues: PreflightIssue[];
}

const tone = {
  pass: { icon: CheckCircle2, className: "text-positive", label: "Pass" },
  warning: { icon: AlertCircle, className: "text-warning", label: "Warning" },
  fail: { icon: XCircle, className: "text-danger", label: "Fail" },
} as const;

export function PreflightReport({ issues }: PreflightReportProps) {
  return (
    <section className="space-y-3 rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]">
      <h2 className="font-display text-lg font-semibold">Preflight report</h2>
      <div className="space-y-2">
        {issues.map((issue) => {
          const meta = tone[issue.level];
          const Icon = meta.icon;
          return (
            <div key={issue.id} className="flex items-start gap-3 rounded-[var(--r-md)] bg-bg-subtle p-3">
              <Icon className={`mt-0.5 h-4 w-4 ${meta.className}`} />
              <div>
                <p className={`text-sm font-semibold ${meta.className}`}>{meta.label}</p>
                <p className="text-sm text-ink-secondary">{issue.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
