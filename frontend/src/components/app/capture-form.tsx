"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { FolderPicker } from "@/components/app/folder-picker";
import { Panel } from "@/components/app/panel";
import { Section } from "@/components/app/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, keys } from "@/lib/api";
import {
  approveCapture,
  CAPTURE_TYPES,
  captureNotes,
  discardCapture,
  recordingFilename,
  recordingMimeType,
  type CaptureProposal,
  type CaptureResult,
  type ProposedConcept,
  type ProposedQuestion,
} from "@/lib/capture";
import { cn } from "@/lib/utils";

const KIND_LABELS = {
  image: "picture",
  pdf: "PDF",
  text: "notes",
  audio: "recording",
  video: "video",
} as const;

/** A proposed concept as the student is editing it. */
interface Draft extends ProposedConcept {
  id: string;
  subject: string;
  /** Struck out by the student: shown, but not filed. */
  keep: boolean;
  /** Keep the model's match to an existing concept, or file this as a new one. */
  merge: boolean;
}

/** A proposed practice question as the student is editing it. */
interface QuestionDraft {
  id: string;
  question_text: string;
  /** One choice per line; empty means a free-answer question. */
  choices: string;
  correct_answer: string;
  concept_title: string;
  where: string | null;
  origin: "material" | "generated";
  keep: boolean;
}

function toQuestionDraft(
  question: ProposedQuestion,
  index: number,
): QuestionDraft {
  return {
    id: `q${index}-${question.question_text}`,
    question_text: question.question_text,
    choices: (question.choices ?? []).join("\n"),
    correct_answer: question.correct_answer,
    concept_title: question.concept_title,
    where: question.where,
    origin: question.origin ?? "material",
    keep: true,
  };
}

/** The proposal in map order: each branch, then the details that hang off it.
 *
 *  The model is asked for parents before children and usually obliges, but
 *  "usually" is not an order — and a list where a detail floats three cards away
 *  from the concept it belongs to hides the one thing this pass is for. Anything
 *  whose parent is not in the list is a branch here, exactly as the map draws it. */
function inMapOrder(drafts: Draft[]): Draft[] {
  const titles = new Set(drafts.map((draft) => draft.title));
  const children = new Map<string, Draft[]>();
  const branches: Draft[] = [];

  for (const draft of drafts) {
    const parent = draft.parent_title;
    if (parent && parent !== draft.title && titles.has(parent)) {
      const siblings = children.get(parent);
      if (siblings) siblings.push(draft);
      else children.set(parent, [draft]);
    } else {
      branches.push(draft);
    }
  }

  const ordered = branches.flatMap((branch) => [
    branch,
    ...(children.get(branch.title) ?? []),
  ]);
  // Anything left is caught in a cycle. Append it rather than lose it.
  const seen = new Set(ordered.map((draft) => draft.id));
  return [...ordered, ...drafts.filter((draft) => !seen.has(draft.id))];
}

function toDraft(concept: ProposedConcept, index: number): Draft {
  return {
    ...concept,
    id: `${index}-${concept.title}`,
    subject: concept.subject ?? "",
    keep: true,
    merge: concept.existing_id !== null,
  };
}

function describe(file: File): string {
  const kb = Math.max(1, Math.round(file.size / 1024));
  return `${file.name} · ${kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`}`;
}

/** Records from the microphone into a File the capture endpoint accepts. */
function useRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  // Assumed until the browser can be asked. `typeof window !== "undefined"`
  // here is the exact branch React's hydration error names: the server decides
  // "no microphone", the browser decides "microphone", and the two renders
  // disagree — so React throws the tree away and builds it again.
  //
  // Optimistic rather than pessimistic, because the two are not symmetrical.
  // Starting from "supported" renders the button on the server and the same
  // button on the client's first pass, and only the rare browser that cannot
  // record sees anything change. Starting from "unsupported" would flash
  // "this browser cannot record" at everyone else. `start` already bails when
  // there is no usable mime type, so the button is harmless while unproven.
  const supported = useSyncExternalStore(
    // Nothing to subscribe to: whether this browser can record does not change
    // while the page is open.
    () => () => {},
    () => recordingMimeType() !== null,
    () => true,
  );

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  const start = async () => {
    const mimeType = recordingMimeType();
    if (!mimeType) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream, { mimeType });
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        const blob = new Blob(chunks.current, { type: mimeType });
        onDone(
          new File([blob], recordingFilename(mimeType), { type: mimeType }),
        );
        setRecording(false);
      };
      recorder.current = media;
      setSeconds(0);
      media.start();
      setRecording(true);
    } catch {
      toast.error(
        "Could not use the microphone. Check the browser's permission for this site.",
      );
    }
  };

  const stop = () => recorder.current?.stop();

  return { supported, recording, seconds, start, stop };
}

/** The typed part of the form, kept in session storage.
 *
 *  A student pastes a YouTube link, wanders off to the bank to check which
 *  folder they meant, comes back — and it had been thrown away. Session storage
 *  rather than local: this is a half-finished action, not a saved document, and
 *  it should not still be waiting a week later in another tab.
 */
const DRAFT_KEY = "focusflow:study-draft";

interface Draft2 {
  text: string;
  url: string;
  subject: string;
  folderId: string | null;
}

const EMPTY_DRAFT: Draft2 = { text: "", url: "", subject: "", folderId: null };

/** Reads the kept draft. Only ever called from an effect: reading storage while
 *  rendering gives the server one answer and the browser another, and React
 *  answers that by throwing the whole tree away and rendering it again — which
 *  it reports as "Hydration failed", and which the student sees as the page
 *  flickering on arrival. */
function restored(): Draft2 {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft2>) } : EMPTY_DRAFT;
  } catch {
    // A corrupt or unreadable draft is not worth a broken page.
    return EMPTY_DRAFT;
  }
}

function useDraft({ text, url, subject, folderId }: Draft2, ready: boolean) {
  useEffect(() => {
    // Nothing is written until the kept draft has been read back. The restore
    // effect above runs first and sets the state, but this effect is in the
    // same commit and still closes over the empty values — so without the
    // guard it deletes the stored draft and only writes it back on the next
    // pass. Navigate away in between and it is gone for good.
    if (!ready || typeof window === "undefined") return;
    const empty = !text.trim() && !url.trim() && !subject.trim() && !folderId;
    try {
      if (empty) window.sessionStorage.removeItem(DRAFT_KEY);
      else
        window.sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ text, url, subject, folderId }),
        );
    } catch {
      // Private mode, or a full quota. Losing the draft is the old behaviour.
    }
  }, [ready, text, url, subject, folderId]);
}

export function CaptureForm() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [subject, setSubject] = useState("");
  // Chosen before the material is read: it steers the reading, and it is where
  // everything approved from this capture is filed.
  const [folderId, setFolderId] = useState<string | null>(null);
  // Empty on the first pass, filled immediately after mount, which is the only
  // point at which the browser's storage may be read.
  const [draftRead, setDraftRead] = useState(false);

  // Kept across a navigation. Pasting a link and then glancing at the bank used
  // to throw the link away, which is the one thing a page you paste into must
  // not do. The file is deliberately not kept - a File cannot be serialised, and
  // pretending one had survived would be worse than plainly losing it.
  // Restoring browser-only state after hydration is the one thing an effect
  // that calls setState is actually for: the value cannot be read while
  // rendering (that is the bug above), and it has to become editable state
  // rather than a derived value, because the student types over it.
  useEffect(() => {
    const draft = restored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(draft.text);
    setUrl(draft.url);
    setSubject(draft.subject);
    setFolderId(draft.folderId);
    setDraftRead(true);
  }, []);
  useDraft({ text, url, subject, folderId }, draftRead);
  // Three stages: the form, the proposal being edited, and what was filed.
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([]);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  // Which concepts are open for editing. Reading is the default; correcting the
  // model is the exception, so the fields are what costs a click, not the prose.
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());

  const { data: concepts } = useQuery({
    queryKey: keys.concepts(),
    queryFn: api.listConcepts,
  });
  const subjects = Array.from(
    new Set((concepts ?? []).map((concept) => concept.subject).filter(Boolean)),
  ) as string[];

  const recorder = useRecorder((recorded) => {
    setFile(recorded);
    setText("");
  });

  const send = useMutation({
    mutationFn: () => captureNotes({ file, text, url, subject, folderId }),
    onSuccess: (proposed) => {
      setResult(null);
      setProposal(proposed);
      setDrafts(inMapOrder(proposed.concepts.map(toDraft)));
      setQuestionDrafts((proposed.questions ?? []).map(toQuestionDraft));
      setEditing(new Set());
      setShowTranscript(false);
      setFile(null);
      setText("");
      setUrl("");
      const count = proposed.concepts.length;
      const asked = proposed.questions?.length ?? 0;
      toast.success(
        count === 0 && asked === 0
          ? "Read it, but found nothing to file."
          : `Found ${count} concept${count === 1 ? "" : "s"} and ${asked} question${asked === 1 ? "" : "s"}. Check them, then approve.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: () =>
      approveCapture({
        concepts: drafts
          .filter((draft) => draft.keep && draft.title.trim())
          .map((draft) => ({
            title: draft.title.trim(),
            body: draft.body.trim(),
            subject: draft.subject.trim() || null,
            parent_title: draft.parent_title,
            // Sent back as the reading gave it. The order is the model's, and
            // nothing on this page edits it yet — dropping it here would file a
            // map with no sequence at all while the proposal plainly showed one.
            order: draft.order,
            when: draft.when,
            existing_id: draft.merge ? draft.existing_id : null,
          })),
        questions: questionDrafts
          .filter(
            (draft) =>
              draft.keep &&
              draft.question_text.trim() &&
              draft.correct_answer.trim(),
          )
          .map((draft) => ({
            question_text: draft.question_text.trim(),
            choices: draft.choices
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            correct_answer: draft.correct_answer.trim(),
            concept_titles: draft.concept_title ? [draft.concept_title] : [],
            origin: draft.origin,
          }))
          .map((question) => ({
            ...question,
            choices: question.choices.length > 0 ? question.choices : null,
          })),
        image_filename: proposal?.image_filename ?? null,
        folder_id: folderId,
        subject: subject.trim() || null,
        title: proposal?.title ?? null,
        kind: proposal?.kind ?? "text",
        summary: proposal?.summary ?? null,
        source: proposal?.title
          ? `Video: ${proposal.title}`.slice(0, 200)
          : proposal
            ? `Scanned ${KIND_LABELS[proposal.kind]}`
            : null,
      }),
    onSuccess: (outcome) => {
      setResult(outcome);
      setProposal(null);
      setDrafts([]);
      setQuestionDrafts([]);
      setEditing(new Set());
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      // The folder's counts just changed, and the bank draws its strip from them.
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      const count = outcome.changes.length;
      const asked = outcome.questions?.length ?? 0;
      toast.success(
        `Filed ${count} concept${count === 1 ? "" : "s"}` +
          (asked > 0
            ? ` and ${asked} question${asked === 1 ? "" : "s"}.`
            : "."),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discard = () => {
    if (proposal?.image_filename) void discardCapture(proposal.image_filename);
    setProposal(null);
    setDrafts([]);
    setQuestionDrafts([]);
    setEditing(new Set());
  };

  const toggleEditing = (id: string) =>
    setEditing((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) =>
    setQuestionDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  const keptQuestions = questionDrafts.filter(
    (draft) =>
      draft.keep && draft.question_text.trim() && draft.correct_answer.trim(),
  ).length;
  // Where a question can be filed: the concepts on this proposal that are kept.
  const conceptTitles = drafts
    .filter((draft) => draft.keep)
    .map((draft) => draft.title.trim());

  const updateDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  const kept = drafts.filter(
    (draft) => draft.keep && draft.title.trim(),
  ).length;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: CAPTURE_TYPES,
    multiple: false,
    disabled: send.isPending || recorder.recording,
    onDrop: (accepted) => {
      if (accepted.length > 0) {
        setFile(accepted[0]);
        setText("");
      }
    },
  });

  const ready =
    (file !== null || text.trim() !== "" || url.trim() !== "") &&
    !send.isPending &&
    !recorder.recording;
  const busyLabel = url.trim()
    ? "Fetching the video, then reading…"
    : file?.type.startsWith("audio/")
      ? "Transcribing, then reading…"
      : "Reading your notes…";

  return (
    <div className="space-y-8">
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !approve.isPending) send.mutate();
        }}
      >
        <Section title="From a file">
          <div
            {...getRootProps()}
            aria-label="Drop notes here, or click to choose a file"
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              isDragActive
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
              (send.isPending || recorder.recording) &&
                "pointer-events-none opacity-50",
            )}
          >
            <input
              {...getInputProps({ "aria-label": "Choose a file of notes" })}
            />
            {file ? (
              <p className="text-sm">
                <span className="font-medium">{describe(file)}</span>
                <span className="block text-xs text-muted-foreground">
                  Drop another to replace it
                </span>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {isDragActive
                    ? "Drop it here"
                    : "Drag notes here, or click to choose"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PNG, JPEG, WebP, HEIC, PDF, TXT, or MP3, M4A, WAV, WebM
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {recorder.supported ? (
              recorder.recording ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={recorder.stop}
                >
                  Stop recording · {Math.floor(recorder.seconds / 60)}:
                  {String(recorder.seconds % 60).padStart(2, "0")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={recorder.start}
                >
                  Record a voice note
                </Button>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                This browser cannot record; upload an audio file instead.
              </p>
            )}
            {file && !recorder.recording && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFile(null)}
              >
                Remove file
              </Button>
            )}
          </div>
        </Section>

        <Section title="Or a YouTube video">
          <Input
            aria-label="YouTube link"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            disabled={file !== null || send.isPending}
            onChange={(event) => {
              setUrl(event.target.value);
              if (event.target.value.trim()) setText("");
            }}
          />
        </Section>

        <Section title="Or paste them">
          <Textarea
            aria-label="Notes to file"
            rows={8}
            placeholder="Integration by parts: pick u to be the thing that gets simpler…"
            value={text}
            disabled={file !== null || url.trim() !== "" || send.isPending}
            onChange={(event) => setText(event.target.value)}
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              A file is chosen; remove it to paste text instead.
            </p>
          )}
        </Section>

        <FolderPicker
          id="capture-folder"
          value={folderId}
          onChange={setFolderId}
        />

        {/* Only when there is no folder to file into. A subject and a folder are
            two ways of saying where this goes, and offering both is how they end
            up disagreeing — the folder wins on the server either way. */}
        {folderId === null && (
          <div>
            <Label htmlFor="capture-subject">Subject</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Optional. A steer for the reading, e.g. &ldquo;Chemistry&rdquo;.
            </p>
            <Input
              id="capture-subject"
              className="mt-1.5 max-w-xs"
              list="capture-subjects"
              placeholder="Chemistry"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <datalist id="capture-subjects">
              {subjects.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!ready}>
            {send.isPending ? busyLabel : "Scan for concepts"}
          </Button>
          {send.isPending && (
            <p className="text-xs text-muted-foreground" role="status">
              This can take a minute for a long recording.
            </p>
          )}
        </div>
      </form>

      {proposal && (
        <Section
          title="Check before filing"
          description={
            proposal.title
              ? `${proposal.title} — ${proposal.summary}`
              : proposal.summary
          }
          actions={
            <span className="text-xs text-muted-foreground">
              read by {proposal.extractor} · from your{" "}
              {KIND_LABELS[proposal.kind]}
            </span>
          }
        >
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in there looked like a concept worth keeping. Try a
              clearer photo, or paste the part that matters.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {drafts.map((draft, index) => {
                  // A detail is indented under the branch above it, and names it:
                  // the indent alone is a guess once a card is tall enough to push
                  // its branch off the top of the screen.
                  const under =
                    draft.parent_title && draft.parent_title !== draft.title
                      ? drafts.find(
                          (other) => other.title === draft.parent_title,
                        )
                      : undefined;
                  return (
                    <li
                      key={draft.id}
                      className={cn(under && "ml-6 border-l pl-4 sm:ml-9")}
                    >
                      <Panel className={cn(!draft.keep && "opacity-50")}>
                        <div className="space-y-3 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={draft.keep}
                                  aria-label={`Keep concept ${index + 1}`}
                                  onChange={(event) =>
                                    updateDraft(draft.id, {
                                      keep: event.target.checked,
                                    })
                                  }
                                />
                                <span className="text-xs text-muted-foreground">
                                  {index + 1} of {drafts.length}
                                </span>
                              </label>
                              {draft.where && (
                                <span className="text-xs text-muted-foreground">
                                  {draft.where}
                                </span>
                              )}
                              {under && (
                                <span className="text-xs text-muted-foreground">
                                  under {under.title}
                                </span>
                              )}
                              {draft.subject && !editing.has(draft.id) && (
                                <span className="text-xs text-muted-foreground">
                                  {draft.subject}
                                </span>
                              )}
                            </div>
                            {/* One name per button, not six called "Edit": a duplicate
                              accessible name is a bug, and the index is what tells
                              them apart. */}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label={
                                editing.has(draft.id)
                                  ? `Stop editing concept ${index + 1}`
                                  : `Edit concept ${index + 1}`
                              }
                              aria-expanded={editing.has(draft.id)}
                              disabled={!draft.keep || approve.isPending}
                              onClick={() => toggleEditing(draft.id)}
                            >
                              {editing.has(draft.id) ? "Done" : "Edit"}
                            </Button>
                          </div>

                          {/* Read first, edit second. What the model made of the
                            material is something to understand before it is
                            something to correct, and a page of form fields is the
                            one shape that cannot be read. */}
                          {editing.has(draft.id) ? (
                            <>
                              <div>
                                <Label htmlFor={`draft-title-${index}`}>
                                  Concept
                                </Label>
                                <Input
                                  id={`draft-title-${index}`}
                                  className="mt-1"
                                  value={draft.title}
                                  disabled={!draft.keep || approve.isPending}
                                  onChange={(event) =>
                                    updateDraft(draft.id, {
                                      title: event.target.value,
                                    })
                                  }
                                />
                              </div>

                              <div>
                                <Label htmlFor={`draft-body-${index}`}>
                                  Description
                                </Label>
                                <Textarea
                                  id={`draft-body-${index}`}
                                  className="mt-1"
                                  rows={4}
                                  value={draft.body}
                                  disabled={!draft.keep || approve.isPending}
                                  onChange={(event) =>
                                    updateDraft(draft.id, {
                                      body: event.target.value,
                                    })
                                  }
                                />
                              </div>

                              <div>
                                <Label htmlFor={`draft-subject-${index}`}>
                                  Subject
                                </Label>
                                <Input
                                  id={`draft-subject-${index}`}
                                  className="mt-1 max-w-xs"
                                  list="capture-subjects"
                                  value={draft.subject}
                                  disabled={!draft.keep || approve.isPending}
                                  onChange={(event) =>
                                    updateDraft(draft.id, {
                                      subject: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1.5">
                              <h3 className="text-base font-medium tracking-[-0.01em]">
                                {draft.title || "Untitled"}
                              </h3>
                              {draft.body.trim() ? (
                                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                                  {draft.body}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">
                                  No description came back for this one. Edit it
                                  to write your own.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Merging is a decision about where this lands, so it stays
                            visible while reading rather than hiding behind Edit. */}
                          {draft.existing_id && (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={draft.merge}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateDraft(draft.id, {
                                    merge: event.target.checked,
                                  })
                                }
                              />
                              <span>
                                Add to existing{" "}
                                <span className="font-medium">
                                  &ldquo;{draft.existing_title}&rdquo;
                                </span>
                              </span>
                            </label>
                          )}
                        </div>
                      </Panel>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {questionDrafts.length > 0 && (
            <div className="space-y-3 border-t pt-5">
              <div>
                <h3 className="text-[11px] font-medium tracking-[0.09em] text-muted-foreground uppercase">
                  Practice questions
                </h3>
              </div>
              <ul className="space-y-3">
                {questionDrafts.map((draft, index) => (
                  <li key={draft.id}>
                    <Panel className={cn(!draft.keep && "opacity-50")}>
                      <div className="space-y-3 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={draft.keep}
                              aria-label={`Keep question ${index + 1}`}
                              onChange={(event) =>
                                updateQuestion(draft.id, {
                                  keep: event.target.checked,
                                })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              Q{index + 1} of {questionDrafts.length}
                            </span>
                          </label>
                          {draft.where && (
                            <span className="text-xs text-muted-foreground">
                              {draft.where}
                            </span>
                          )}
                          {draft.origin === "generated" && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                              written for you
                            </span>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`question-text-${index}`}>
                            Question
                          </Label>
                          <Textarea
                            id={`question-text-${index}`}
                            className="mt-1"
                            rows={2}
                            value={draft.question_text}
                            disabled={!draft.keep || approve.isPending}
                            onChange={(event) =>
                              updateQuestion(draft.id, {
                                question_text: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`question-choices-${index}`}>
                              Choices
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              One per line; leave empty for a typed answer.
                            </p>
                            <Textarea
                              id={`question-choices-${index}`}
                              className="mt-1"
                              rows={3}
                              value={draft.choices}
                              disabled={!draft.keep || approve.isPending}
                              onChange={(event) =>
                                updateQuestion(draft.id, {
                                  choices: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor={`question-answer-${index}`}>
                                Answer
                              </Label>
                              <Input
                                id={`question-answer-${index}`}
                                className="mt-1"
                                value={draft.correct_answer}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateQuestion(draft.id, {
                                    correct_answer: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor={`question-concept-${index}`}>
                                Under concept
                              </Label>
                              <select
                                id={`question-concept-${index}`}
                                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                                value={draft.concept_title}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateQuestion(draft.id, {
                                    concept_title: event.target.value,
                                  })
                                }
                              >
                                {!conceptTitles.includes(
                                  draft.concept_title,
                                ) && (
                                  <option value={draft.concept_title}>
                                    {draft.concept_title}
                                  </option>
                                )}
                                {conceptTitles.map((title) => (
                                  <option key={title} value={title}>
                                    {title}
                                  </option>
                                ))}
                                <option value="">No concept</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={
                (kept === 0 && keptQuestions === 0) || approve.isPending
              }
              onClick={() => approve.mutate()}
            >
              {approve.isPending
                ? "Filing…"
                : `Approve and log ${kept} concept${kept === 1 ? "" : "s"}` +
                  (keptQuestions > 0
                    ? ` and ${keptQuestions} question${keptQuestions === 1 ? "" : "s"}`
                    : "")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={approve.isPending}
              onClick={discard}
            >
              Discard
            </Button>
          </div>

          {proposal.transcript && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showTranscript}
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "Hide transcript" : "Show transcript"}
              </Button>
              {showTranscript && (
                <p className="mt-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap">
                  {proposal.transcript}
                </p>
              )}
            </div>
          )}
        </Section>
      )}

      {result && (
        <Section title="What was filed">
          {result.questions && result.questions.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium">
                {result.questions.length} practice question
                {result.questions.length === 1 ? "" : "s"} logged and tagged.
              </p>
              <ul className="mt-2 space-y-1">
                {result.questions.map((question) => (
                  <li
                    key={question.id}
                    className="flex flex-wrap gap-x-2 text-muted-foreground"
                  >
                    <Link href={`/bank/${question.id}`} className="underline">
                      {question.question_text.length > 90
                        ? `${question.question_text.slice(0, 90)}…`
                        : question.question_text}
                    </Link>
                    {question.concepts.length > 0 && (
                      <span>
                        · {question.concepts.map((c) => c.title).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                They are on the ladder now: the first comes round in Review in
                an hour.
              </p>
            </div>
          )}
          {result.changes.length === 0 &&
          (!result.questions || result.questions.length === 0) ? (
            <p className="text-sm text-muted-foreground">Nothing was filed.</p>
          ) : (
            <ul className="space-y-2">
              {result.changes.map((change) => (
                <li key={change.concept.id}>
                  <Panel interactive>
                    <Link
                      href={`/concepts/${change.concept.id}`}
                      className="block px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{change.concept.title}</h3>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            change.action === "created"
                              ? "border-transparent bg-primary/10 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {change.action === "created"
                            ? "new"
                            : "added to existing"}
                        </span>
                        {change.concept.subject && (
                          <span className="text-xs text-muted-foreground">
                            {change.concept.subject}
                          </span>
                        )}
                        {change.concept.images.length > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            picture attached
                          </span>
                        )}
                      </div>
                      {change.concept.body && (
                        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                          {change.concept.body}
                        </p>
                      )}
                    </Link>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
