"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

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

function toQuestionDraft(question: ProposedQuestion, index: number): QuestionDraft {
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
  const supported = typeof window !== "undefined" && recordingMimeType() !== null;

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
        onDone(new File([blob], recordingFilename(mimeType), { type: mimeType }));
        setRecording(false);
      };
      recorder.current = media;
      setSeconds(0);
      media.start();
      setRecording(true);
    } catch {
      toast.error("Could not use the microphone. Check the browser's permission for this site.");
    }
  };

  const stop = () => recorder.current?.stop();

  return { supported, recording, seconds, start, stop };
}

export function CaptureForm() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [subject, setSubject] = useState("");
  // Three stages: the form, the proposal being edited, and what was filed.
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([]);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const { data: concepts } = useQuery({ queryKey: keys.concepts(), queryFn: api.listConcepts });
  const subjects = Array.from(
    new Set((concepts ?? []).map((concept) => concept.subject).filter(Boolean)),
  ) as string[];

  const recorder = useRecorder((recorded) => {
    setFile(recorded);
    setText("");
  });

  const send = useMutation({
    mutationFn: () => captureNotes({ file, text, url, subject }),
    onSuccess: (proposed) => {
      setResult(null);
      setProposal(proposed);
      setDrafts(proposed.concepts.map(toDraft));
      setQuestionDrafts((proposed.questions ?? []).map(toQuestionDraft));
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
            existing_id: draft.merge ? draft.existing_id : null,
          })),
        questions: questionDrafts
          .filter((draft) => draft.keep && draft.question_text.trim() && draft.correct_answer.trim())
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
      queryClient.invalidateQueries({ queryKey: keys.concepts() });
      queryClient.invalidateQueries({ queryKey: keys.stats() });
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      const count = outcome.changes.length;
      const asked = outcome.questions?.length ?? 0;
      toast.success(
        `Filed ${count} concept${count === 1 ? "" : "s"}` +
          (asked > 0 ? ` and ${asked} question${asked === 1 ? "" : "s"}.` : "."),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discard = () => {
    if (proposal?.image_filename) void discardCapture(proposal.image_filename);
    setProposal(null);
    setDrafts([]);
    setQuestionDrafts([]);
  };

  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) =>
    setQuestionDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  const keptQuestions = questionDrafts.filter(
    (draft) => draft.keep && draft.question_text.trim() && draft.correct_answer.trim(),
  ).length;
  // Where a question can be filed: the concepts on this proposal that are kept.
  const conceptTitles = drafts.filter((draft) => draft.keep).map((draft) => draft.title.trim());

  const updateDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  const kept = drafts.filter((draft) => draft.keep && draft.title.trim()).length;

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
              isDragActive ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              (send.isPending || recorder.recording) && "pointer-events-none opacity-50",
            )}
          >
            <input {...getInputProps({ "aria-label": "Choose a file of notes" })} />
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
                  {isDragActive ? "Drop it here" : "Drag notes here, or click to choose"}
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
                <Button type="button" variant="destructive" onClick={recorder.stop}>
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
              <Button type="button" variant="ghost" onClick={() => setFile(null)}>
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
          description={proposal.title ? `${proposal.title} — ${proposal.summary}` : proposal.summary}
          actions={
            <span className="text-xs text-muted-foreground">
              read by {proposal.extractor} · from your {KIND_LABELS[proposal.kind]}
            </span>
          }
        >
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in there looked like a concept worth keeping. Try a clearer photo,
              or paste the part that matters.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {drafts.map((draft, index) => (
                  <li key={draft.id}>
                    <Panel className={cn(!draft.keep && "opacity-50")}>
                      <div className="space-y-3 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={draft.keep}
                              aria-label={`Keep concept ${index + 1}`}
                              onChange={(event) =>
                                updateDraft(draft.id, { keep: event.target.checked })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              {index + 1} of {drafts.length}
                            </span>
                          </label>
                          {draft.where && (
                            <span className="text-xs text-muted-foreground">{draft.where}</span>
                          )}
                        </div>

                        <div>
                          <Label htmlFor={`draft-title-${index}`}>Concept</Label>
                          <Input
                            id={`draft-title-${index}`}
                            className="mt-1"
                            value={draft.title}
                            disabled={!draft.keep || approve.isPending}
                            onChange={(event) =>
                              updateDraft(draft.id, { title: event.target.value })
                            }
                          />
                        </div>

                        <div>
                          <Label htmlFor={`draft-body-${index}`}>Description</Label>
                          <Textarea
                            id={`draft-body-${index}`}
                            className="mt-1"
                            rows={4}
                            value={draft.body}
                            disabled={!draft.keep || approve.isPending}
                            onChange={(event) =>
                              updateDraft(draft.id, { body: event.target.value })
                            }
                          />
                        </div>

                        <div className="flex flex-wrap items-end gap-4">
                          <div>
                            <Label htmlFor={`draft-subject-${index}`}>Subject</Label>
                            <Input
                              id={`draft-subject-${index}`}
                              className="mt-1 max-w-xs"
                              list="capture-subjects"
                              value={draft.subject}
                              disabled={!draft.keep || approve.isPending}
                              onChange={(event) =>
                                updateDraft(draft.id, { subject: event.target.value })
                              }
                            />
                          </div>
                          {draft.existing_id && (
                            <label className="flex items-center gap-2 pb-2 text-sm">
                              <input
                                type="checkbox"
                                checked={draft.merge}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateDraft(draft.id, { merge: event.target.checked })
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
                      </div>
                    </Panel>
                  </li>
                ))}
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
                                updateQuestion(draft.id, { keep: event.target.checked })
                              }
                            />
                            <span className="text-xs text-muted-foreground">
                              Q{index + 1} of {questionDrafts.length}
                            </span>
                          </label>
                          {draft.where && (
                            <span className="text-xs text-muted-foreground">{draft.where}</span>
                          )}
                          {draft.origin === "generated" && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                              written for you
                            </span>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`question-text-${index}`}>Question</Label>
                          <Textarea
                            id={`question-text-${index}`}
                            className="mt-1"
                            rows={2}
                            value={draft.question_text}
                            disabled={!draft.keep || approve.isPending}
                            onChange={(event) =>
                              updateQuestion(draft.id, { question_text: event.target.value })
                            }
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`question-choices-${index}`}>Choices</Label>
                            <p className="text-xs text-muted-foreground">One per line; leave empty for a typed answer.</p>
                            <Textarea
                              id={`question-choices-${index}`}
                              className="mt-1"
                              rows={3}
                              value={draft.choices}
                              disabled={!draft.keep || approve.isPending}
                              onChange={(event) =>
                                updateQuestion(draft.id, { choices: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor={`question-answer-${index}`}>Answer</Label>
                              <Input
                                id={`question-answer-${index}`}
                                className="mt-1"
                                value={draft.correct_answer}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateQuestion(draft.id, { correct_answer: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor={`question-concept-${index}`}>Under concept</Label>
                              <select
                                id={`question-concept-${index}`}
                                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                                value={draft.concept_title}
                                disabled={!draft.keep || approve.isPending}
                                onChange={(event) =>
                                  updateQuestion(draft.id, { concept_title: event.target.value })
                                }
                              >
                                {!conceptTitles.includes(draft.concept_title) && (
                                  <option value={draft.concept_title}>{draft.concept_title}</option>
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
              disabled={(kept === 0 && keptQuestions === 0) || approve.isPending}
              onClick={() => approve.mutate()}
            >
              {approve.isPending
                ? "Filing…"
                : `Approve and log ${kept} concept${kept === 1 ? "" : "s"}` +
                  (keptQuestions > 0
                    ? ` and ${keptQuestions} question${keptQuestions === 1 ? "" : "s"}`
                    : "")}
            </Button>
            <Button type="button" variant="ghost" disabled={approve.isPending} onClick={discard}>
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
                  <li key={question.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <Link href={`/bank/${question.id}`} className="underline">
                      {question.question_text.length > 90
                        ? `${question.question_text.slice(0, 90)}…`
                        : question.question_text}
                    </Link>
                    {question.concepts.length > 0 && (
                      <span>· {question.concepts.map((c) => c.title).join(", ")}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                They are on the ladder now: the first comes round in Review in an hour.
              </p>
            </div>
          )}
          {result.changes.length === 0 && (!result.questions || result.questions.length === 0) ? (
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
                          {change.action === "created" ? "new" : "added to existing"}
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
