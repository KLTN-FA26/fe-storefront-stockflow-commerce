import { ChangePasswordForm } from "@/features/customer/security/components/change-password-form";

import { PageHeader } from "@/components/shared/PageHeader";

export default function SecurityPage() {
  return (
    <div>
      <PageHeader titleHidden title="Bảo mật" subtitle="Mật khẩu đăng nhập cổng khách hàng." />
      <ChangePasswordForm />
    </div>
  );
}
