import { CreditCard } from "@/features/customer/credit";
import { CustomerProfileForm } from "@/features/customer/profile/components/customer-profile-form";

export default function AccountPage() {
  return (
    <div className="max-w-5xl space-y-5">
      <CustomerProfileForm />
      <CreditCard />
    </div>
  );
}
