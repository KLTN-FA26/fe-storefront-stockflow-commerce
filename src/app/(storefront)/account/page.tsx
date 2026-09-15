import Link from "next/link";
import { Lock, MapPin, Package } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

const links = [{ href: STORE_ROUTES.account.orders.list, label: "Đơn hàng", icon: Package }, { href: STORE_ROUTES.account.addresses, label: "Sổ địa chỉ", icon: MapPin }, { href: STORE_ROUTES.account.security, label: "Bảo mật", icon: Lock }];

export default function AccountPage() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md"><p className="text-sm text-ink-secondary">Xin chào</p><h1 className="font-display text-3xl font-bold">Nguyễn An</h1><p className="mt-2 text-sm text-ink-secondary">an@example.com · khách hàng thân thiết</p></div>
      <div className="grid gap-3 sm:grid-cols-3">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="rounded-xl bg-bg-surface p-4 shadow-md transition hover:shadow-lg"><Icon className="h-5 w-5 text-accent" /><p className="mt-3 font-semibold">{label}</p></Link>)}</div>
    </section>
  );
}
