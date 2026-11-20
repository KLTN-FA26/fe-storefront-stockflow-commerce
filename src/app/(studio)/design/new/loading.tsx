import {
  LauncherFrame,
  LauncherLoading,
} from "@/features/product-design/components/launcher-states";

export default function NewDesignLoading() {
  return (
    <LauncherFrame>
      <LauncherLoading label="Đang chuẩn bị thiết kế…" />
    </LauncherFrame>
  );
}
