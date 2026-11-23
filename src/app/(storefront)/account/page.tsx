import { Suspense } from "react";

import { CreditCard } from "@/features/customer/credit";
import { LegalProfileCard } from "@/features/customer/legal-profile";
import { CustomerProfileForm } from "@/features/customer/profile/components/customer-profile-form";
import { MyInstallments } from "@/features/customer/installments";
import { AccountTodo } from "@/features/customer/todo";

export default function AccountPage() {
  return (
    <div className="max-w-5xl space-y-5">
      <AccountTodo />
      <CustomerProfileForm />
      <LegalProfileCard />
      <CreditCard />
      {/* nuqs reads search params (the installments filter and page): Suspense keeps the rest of the route static. */}
      <Suspense fallback={null}>
        <MyInstallments />
      </Suspense>
    </div>
  );
}
