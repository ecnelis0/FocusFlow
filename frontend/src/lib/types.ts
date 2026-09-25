/** Mirrors `backend/app/schemas.py`. Keep the two in step. */

export interface TagCount {
  tag: string;
  count: number;
  /** True while nothing carries it — a starting suggestion, not a chosen tag. */
  suggested: boolean;
}

/** A topic inside a subject. Holds both the concepts filed under it and the
 *  questions logged against it. */
export interface Folder {
  id: string;
  subject_id: string;
  name: string;
  position: number;
  created_at: string;
  concept_count: number;
  question_count: number;
}

/** A course — "APUSH", "SAT", "Calculus". One tab on the bank.
 *
 *  A row rather than a distinct string found by grouping, because an empty one has
 *  to exist: you set your courses up before you log anything into them. */
export interface Subject {
  id: string;
  name: string;
  position: number;
  created_at: string;
  folders: Folder[];
  concept_count: number;
  question_count: number;
  /** How much of the subject is in no folder yet — what the "Unfiled" card shows. */
  unfiled_concept_count: number;
  unfiled_question_count: number;
}

export interface ConceptSummary {
  id: string;
  title: string;
}

export interface Concept extends ConceptSummary {
  created_at: string;
  updated_at: string | null;
  body: string | null;
  /** Free text — "Biology", "Calculus" — or nothing. The folder's name when it
   *  is in one; the backend keeps the two in step. */
  subject: string | null;
  /** The topic folder it is filed in, or null for loose in the subject. */
  folder_id: string | null;
  /** The broader concept this hangs under — "The Battle of Yorktown" beneath
   *  "The American Revolution" — or null for one of the big organising ideas.
   *  Sent as a parent pointer, not nested children, so the tree is assembled
   *  once where it is drawn. */
  parent_id: string | null;
  /** Where it sits in the order the material runs, counted among its own
   *  siblings — branches against branches, a branch's details against each
   *  other. Null when the reading gave no order. Not a global rank: sorting one
   *  flat list by it interleaves every branch's first detail. */
  sequence: number | null;
  /** What that position is called, shown to the student: "1763", "Step 2".
   *  Null whenever the material named no moment; the order still holds. */
  when_label: string | null;
  /** The scene the map draws for it, from the extractor's closed list. Null for
   *  everything filed before there was one — `lib/motif.ts` matches those from
   *  their own words. */
  motif: string | null;
  /** Where it was dragged on the map, or null while the layout decides. Both or
   *  neither: half a position reads as a 0 on the other axis. */
  map_x: number | null;
  map_y: number | null;
  question_count: number;
  images: MistakeImage[];
}

export interface ConceptDetail extends Concept {
  mistakes: Mistake[];
}

export interface ConceptDraft {
  title: string;
  body?: string | null;
  /** Ignored when `folder_id` is sent: the folder decides the subject. */
  subject?: string | null;
  folder_id?: string | null;
  /** Where it was dragged on the map. Sent as a pair or not at all. */
  map_x?: number | null;
  map_y?: number | null;
}

export interface MistakeImage {
  id: string;
  url: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  position: number;
}

export interface Mistake {
  id: string;
  created_at: string;
  subject: string | null;
  folder_id: string | null;
  source: string | null;
  question_text: string;
  choices: string[] | null;
  correct_answer: string;
  student_note: string | null;
  topic: string | null;
  tags: string[] | null;
  /** The upload this came out of, or null for one that predates materials. */
  material_id: string | null;

  concepts: ConceptSummary[];
  images: MistakeImage[];
}

/** Every field is editable; only the keys sent are changed. */
export type MistakeEdit = Partial<
  Pick<
    Mistake,
    | "subject"
    | "folder_id"
    | "source"
    | "question_text"
    | "choices"
    | "correct_answer"
    | "student_note"
    | "topic"
    | "tags"
  >
>;

export type BankSort = "newest" | "oldest";

/** Mirrors `backend/app/query.py`. The assistant's reading of your sentence. */
export interface BankQuery {
  concept_ids: string[];
  concepts: string[];
  tags: string[];
  subjects: string[];
  topics: string[];
  folder_ids: string[];
  text: string | null;
  logged_after: string | null;
  logged_before: string | null;
  has_concept: boolean | null;
  /** False for questions in a subject but in none of its folders. */
  has_folder: boolean | null;
  sort: BankSort;
  limit: number;
}

export interface Answer {
  question: string;
  answer: string;
  analyzer: string;
  analyzer_ready: boolean;
  filter_description: string;
  query: BankQuery;
  mistakes: Mistake[];
  error: string | null;
}

export interface MistakeDraft {
  subject?: string | null;
  folder_id?: string | null;
  concept_ids?: string[];
  tags?: string[];
  question_text: string;
  correct_answer: string;
  choices?: string[] | null;
  source?: string | null;
  student_note?: string | null;
}

/** What the AI read out of a picture of a question. Everything but the question
 *  itself can be null: a half-filled form beats a blank one. `your_answer` is
 *  deliberately absent — the picture cannot know what the student put. */
export interface ScannedQuestion {
  question_text: string;
  choices?: string[] | null;
  correct_answer?: string | null;
  subject?: string | null;
  source?: string | null;
  note?: string | null;
}

/** One thing you put in: a PDF, a video, a recording, a page of notes.
 *
 *  The receipt for a capture. A folder lists these rather than one pooled heap
 *  of concepts, because "what have I put in here" is the question you ask when
 *  you come back to a unit a month later. */
export interface Material {
  id: string;
  created_at: string;
  title: string;
  /** "pdf" | "image" | "text" | "audio" | "video" — free text on the server, so
   *  a new kind needs no migration and no change here. */
  kind: string;
  source: string | null;
  summary: string | null;
  subject: string | null;
  folder_id: string | null;
  concept_count: number;
  question_count: number;
  /** True once a revision page has been written from it. */
  has_notes: boolean;
}

/** A material opened: everything that came out of that one upload. */
export interface MaterialDetail extends Material {
  concepts: Concept[];
  questions: Mistake[];
}

/** A figure the app draws itself, described as data.
 *
 *  A closed vocabulary, mirroring `backend/app/analysis/notes.py`. Asking a
 *  model for "a diagram" gets prose describing one or SVG that renders like a
 *  ransom note; asking for four named shapes gets something drawable. A new
 *  member here needs a new branch in `note-figure.tsx`. */
export type FigureKind = "timeline" | "process" | "parts" | "compare";

export interface NoteStep {
  label: string;
  text: string;
}

export interface NotePart {
  name: string;
  text: string;
}

export interface NoteRow {
  label: string;
  cells: string[];
}

export interface NoteFigure {
  kind: FigureKind;
  title: string;
  /** "timeline" and "process". */
  steps: NoteStep[];
  /** "parts": the thing being pulled apart. */
  centre: string | null;
  parts: NotePart[];
  /** "compare". */
  columns: string[];
  rows: NoteRow[];
}

export interface NoteSection {
  heading: string;
  points: string[];
  figure: NoteFigure | null;
}

/** A written-up revision page for one material. */
export interface NoteDocument {
  title: string;
  in_a_sentence: string;
  sections: NoteSection[];
  /** The mix-ups the material sets — where the marks actually go. */
  traps: string[];
}
