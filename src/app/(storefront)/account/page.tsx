import Link from "next/link";
import { Lock, MapPin, Package } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { CustomerProfileForm } from "@/features/customer/profile/components/customer-profile-form";

const links = [
  { href: STORE_ROUTES.account.orders.list, label: "Đơn hàng", icon: Package },
  { href: STORE_ROUTES.account.addresses, label: "Sổ địa chỉ", icon: MapPin },
  { href: STORE_ROUTES.account.security, label: "Bảo mật", icon: Lock },
];

export default function AccountPage() {
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <CustomerProfileForm />
      <div className="grid gap-3 sm:grid-cols-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-bg-surface rounded-xl p-4 shadow-md transition hover:shadow-lg"
          >
            <Icon className="text-accent h-5 w-5" />
            <p className="mt-3 font-semibold">{label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
