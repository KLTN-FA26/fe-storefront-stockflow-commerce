import { CreditCard } from "@/features/customer/credit";
import { CreditRequestSection } from "@/features/customer/credit-request";
import { LegalProfileCard } from "@/features/customer/legal-profile";
import { CustomerProfileForm } from "@/features/customer/profile/components/customer-profile-form";
import { AccountTodo } from "@/features/customer/todo";

import { PageHeader } from "@/components/shared/PageHeader";

/** The installment schedule is not repeated here: it has its own "Thanh toán" page in the account menu. */
export default function AccountPage() {
  return (
    <div>
      <PageHeader
        titleHidden
        title="Hồ sơ của tôi"
        subtitle="Việc cần làm, thông tin liên hệ, pháp lý và công nợ."
      />
      <div className="space-y-4">
        <AccountTodo />
        <CustomerProfileForm />
        <LegalProfileCard />
        <CreditCard requests={<CreditRequestSection enabled />} />
      </div>
    </div>
  );
}
