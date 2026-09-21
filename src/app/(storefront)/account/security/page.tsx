import { ChangePasswordForm } from "@/features/customer/security/components/change-password-form";

export default function SecurityPage() {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <ChangePasswordForm />
    </section>
  );
}
