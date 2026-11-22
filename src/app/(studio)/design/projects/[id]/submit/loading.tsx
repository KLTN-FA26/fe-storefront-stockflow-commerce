import { LauncherLoading } from "@/features/product-design/components/launcher-states";
import { SetFrame } from "@/features/product-design/components/submit-set-states";

export default function SubmitSetLoading() {
  return (
    <SetFrame>
      <LauncherLoading label="Đang tải dự án…" />
    </SetFrame>
  );
}
