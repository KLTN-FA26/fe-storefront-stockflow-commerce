import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SecurityPage() {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div><h1 className="font-display text-3xl font-bold">Bảo mật</h1><p className="text-ink-secondary">Đổi mật khẩu và cấu hình 2FA mock.</p></div>
      <div className="space-y-4 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md"><ShieldCheck className="h-6 w-6 text-accent" /><div className="space-y-2"><Label>Mật khẩu hiện tại</Label><Input type="password" /></div><div className="space-y-2"><Label>Mật khẩu mới</Label><Input type="password" /></div><Button className="rounded-full">Cập nhật mật khẩu</Button></div>
      <div className="flex items-center justify-between rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md"><div><h2 className="font-semibold">Xác thực 2 bước</h2><p className="text-sm text-ink-secondary">Bật lớp bảo vệ bổ sung cho tài khoản.</p></div><Switch /></div>
    </section>
  );
}
