import { CaptureForm } from "@/components/app/capture-form";
import { PageHeader } from "@/components/app/page-header";

export default function CapturePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Scan notes" />
      <CaptureForm />
    </div>
  );
}
