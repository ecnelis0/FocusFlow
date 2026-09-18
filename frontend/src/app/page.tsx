import { CaptureForm } from "@/components/app/capture-form";
import { PageHeader } from "@/components/app/page-header";

/** The front door. Everything this app knows starts as material someone put in
 *  here — a video, a PDF, a photo of a page, a recording, or typed notes — so the
 *  first screen is the one that takes it, not a report on what is already filed. */
export default function StudyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Study"
        lede="Paste a YouTube link, drop a PDF or a photo of your notes, and every concept in
          it comes back with a description of its own. Check them over, then file the whole
          lot — concepts and practice questions — into a folder under its subject."
      />
      <CaptureForm />
    </div>
  );
}
