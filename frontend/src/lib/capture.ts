import { API_URL, ApiError } from "./api";
import type { Concept, Mistake } from "./types";

/** Mirrors `backend/app/routers/capture.py`. */
export type CaptureKind = "image" | "pdf" | "text" | "audio" | "video";

/** One concept the model found, before the student has approved it. */
export interface ProposedConcept {
  title: string;
  body: string;
  subject: string | null;
  /** The title of the broader concept in this same proposal that it sits under,
   *  or null for one of the branches the map is built around. */
  parent_title: string | null;
  /** Its place in the order the material runs, among its siblings. */
  order: number;
  /** What that place is called — "1763", "Step 2" — or null. */
  when: string | null;
  /** Where in the notes it came from ("page 3"), when the model could tell. */
  where: string | null;
  /** The existing concept the model says this is. Dropping it files a new one. */
  existing_id: string | null;
  existing_title: string | null;
}

/** A practice question found in the material, tied to a proposed concept. */
export interface ProposedQuestion {
  question_text: string;
  choices: string[] | null;
  correct_answer: string;
  /** Title of the proposed concept it exercises. */
  concept_title: string;
  where: string | null;
  /** "material" when posed in the notes; "generated" when the model wrote it. */
  origin?: "material" | "generated";
}

export interface CaptureProposal {
  kind: CaptureKind;
  /** The video's title, when the notes came from a YouTube link. */
  title?: string | null;
  extractor: string;
  transcript: string | null;
  summary: string;
  concepts: ProposedConcept[];
  questions: ProposedQuestion[];
  /** A stored copy of the picture, attached on approval. */
  image_filename: string | null;
}

export interface ApprovedQuestion {
  question_text: string;
  choices: string[] | null;
  correct_answer: string;
  concept_titles: string[];
  origin: "material" | "generated";
}

export interface ApprovedConcept {
  title: string;
  body: string;
  subject: string | null;
  /** The title of the concept this nests under. The server resolves it by title
   *  once every row exists, and ignores one it cannot find — so a parent the
   *  student struck out leaves its children at the top rather than unfiled. */
  parent_title: string | null;
  order: number;
  when: string | null;
  existing_id: string | null;
}

export interface ConceptChange {
  concept: Concept;
  /** Whether the notes made a new concept or were added to one that existed. */
  action: "created" | "updated";
}

export interface CaptureResult {
  changes: ConceptChange[];
  /** Practice questions logged into the bank, tagged under their concepts. */
  questions: Mistake[];
}

/** What the dropzone accepts. The server decides the real kind from the bytes. */
export const CAPTURE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "audio/webm": [".webm"],
  "audio/ogg": [".ogg", ".oga"],
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/aac": [".aac"],
};

async function failure(response: Response): Promise<ApiError> {
  const detail = await response
    .json()
    .then((parsed) => parsed?.detail)
    .catch(() => null);
  return new ApiError(typeof detail === "string" ? detail : response.statusText, response.status);
}

/** Send either a file or pasted text; the API reads it and proposes concepts.
 *  Nothing is filed until `approveCapture`. Multipart, so the JSON Content-Type
 *  the main client sets must not apply. */
export async function captureNotes(input: {
  file?: File | null;
  text?: string;
  url?: string;
  subject?: string;
  /** The topic folder this is being filed into. A stronger steer than `subject`:
   *  its subject is a course the student has actually set up. */
  folderId?: string | null;
}): Promise<CaptureProposal> {
  const body = new FormData();
  if (input.file) body.append("file", input.file, input.file.name);
  if (input.text?.trim()) body.append("text", input.text);
  if (input.url?.trim()) body.append("url", input.url.trim());
  if (input.subject?.trim()) body.append("subject", input.subject.trim());
  if (input.folderId) body.append("folder_id", input.folderId);

  const response = await fetch(`${API_URL}/capture`, { method: "POST", body });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as CaptureProposal;
}

/** File the concepts the student kept, as edited. */
export async function approveCapture(input: {
  concepts: ApprovedConcept[];
  questions: ApprovedQuestion[];
  image_filename: string | null;
  /** Everything filed by this capture lands here and takes its subject. */
  folder_id?: string | null;
  /** The course, when no folder was chosen. Ignored when one was: the folder's
   *  own subject is authoritative. Without this a capture filed with no folder
   *  left its material under no subject, so it never appeared under the course
   *  the student had just typed. */
  subject?: string | null;
  /** What to call it in the listing, and what it was. */
  title?: string | null;
  kind?: string;
  summary?: string | null;
  source: string | null;
}): Promise<CaptureResult> {
  const response = await fetch(`${API_URL}/capture/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as CaptureResult;
}

/** Throw away the stored picture of a proposal that was not approved. */
export async function discardCapture(imageFilename: string): Promise<void> {
  await fetch(`${API_URL}/capture/source/${encodeURIComponent(imageFilename)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

/** Which container this browser's recorder can write. Chrome and Firefox do
 *  webm; Safari does mp4. Either is fine for the transcriber. */
export function recordingMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function recordingFilename(mimeType: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = mimeType.startsWith("audio/mp4")
    ? "m4a"
    : mimeType.startsWith("audio/ogg")
      ? "ogg"
      : "webm";
  return `recording-${stamp}.${extension}`;
}
