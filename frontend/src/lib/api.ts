import type {
  Answer,
  BankQuery,
  Concept,
  ConceptDetail,
  ConceptDraft,
  Folder,
  Material,
  MaterialDetail,
  NoteDocument,
  Mistake,
  MistakeEdit,
  ScannedQuestion,
  Subject,
  TagCount,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    // Only declare a JSON body when there is one. A Content-Type on a bare GET
    // makes it a non-simple request, which costs a CORS preflight per read.
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });

  if (!response.ok) {
    // FastAPI puts the readable part in `detail`; fall back to the status line.
    const detail = await response
      .json()
      .then((body) => body?.detail)
      .catch(() => null);
    throw new ApiError(
      typeof detail === "string" ? detail : response.statusText,
      response.status,
    );
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** Multipart POST. No Content-Type header: the browser writes its own boundary. */
async function postForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: "POST", body });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((parsed) => parsed?.detail)
      .catch(() => null);
    throw new ApiError(
      typeof detail === "string" ? detail : response.statusText,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export interface MistakeFilters {
  subject?: string;
  topic?: string;
  q?: string;
}

function query(filters: MistakeFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export const api = {
  updateMistake: (id: string, edit: MistakeEdit) =>
    request<Mistake>(`/mistakes/${id}`, { method: "PATCH", body: JSON.stringify(edit) }),

  listMistakes: (filters: MistakeFilters = {}) =>
    request<Mistake[]>(`/mistakes${query(filters)}`),

  /** Multi-facet filter: OR within a facet, AND across them. */
  searchMistakes: (query: Partial<BankQuery>) =>
    request<Mistake[]>("/mistakes/search", {
      method: "POST",
      body: JSON.stringify(query),
    }),

  getMistake: (id: string) => request<Mistake>(`/mistakes/${id}`),

  deleteMistake: (id: string) => request<void>(`/mistakes/${id}`, { method: "DELETE" }),

  /** Read a picture of a question and get the log form back, filled in. Writes
   *  nothing: the student checks it and logs it themselves. */
  scanQuestion: (file: File, subject?: string) => {
    const body = new FormData();
    body.append("file", file);
    if (subject?.trim()) body.append("subject", subject.trim());
    return postForm<ScannedQuestion>("/mistakes/scan", body);
  },

  /** Multipart, so the JSON Content-Type this client normally sets must not apply:
   *  the browser has to write its own boundary. */
  uploadImage: async (mistakeId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${API_URL}/mistakes/${mistakeId}/images`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((parsed) => parsed?.detail)
        .catch(() => null);
      throw new ApiError(
        typeof detail === "string" ? detail : response.statusText,
        response.status,
      );
    }
    return (await response.json()) as Mistake;
  },

  deleteImage: (mistakeId: string, imageId: string) =>
    request<Mistake>(`/mistakes/${mistakeId}/images/${imageId}`, { method: "DELETE" }),

  uploadConceptImage: async (conceptId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`${API_URL}/concepts/${conceptId}/images`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      const detail = await response
        .json()
        .then((parsed) => parsed?.detail)
        .catch(() => null);
      throw new ApiError(
        typeof detail === "string" ? detail : response.statusText,
        response.status,
      );
    }
    return (await response.json()) as ConceptDetail;
  },

  deleteConceptImage: (conceptId: string, imageId: string) =>
    request<ConceptDetail>(`/concepts/${conceptId}/images/${imageId}`, {
      method: "DELETE",
    }),

  /** Every label in use, commonest first, then the unused suggestions. */
  listTags: () => request<TagCount[]>("/tags"),

  listConcepts: () => request<Concept[]>("/concepts"),

  getConcept: (id: string) => request<ConceptDetail>(`/concepts/${id}`),

  createConcept: (draft: ConceptDraft) =>
    request<Concept>("/concepts", { method: "POST", body: JSON.stringify(draft) }),

  updateConcept: (id: string, draft: Partial<ConceptDraft>) =>
    request<Concept>(`/concepts/${id}`, { method: "PATCH", body: JSON.stringify(draft) }),

  deleteConcept: (id: string) => request<void>(`/concepts/${id}`, { method: "DELETE" }),

  tagQuestion: (conceptId: string, mistakeId: string) =>
    request<ConceptDetail>(`/concepts/${conceptId}/questions/${mistakeId}`, {
      method: "POST",
    }),

  untagQuestion: (conceptId: string, mistakeId: string) =>
    request<ConceptDetail>(`/concepts/${conceptId}/questions/${mistakeId}`, {
      method: "DELETE",
    }),

  /** Every subject with its folders and their counts — the whole tab strip in
   *  one request, rather than a call per folder to draw it. */
  listSubjects: () => request<Subject[]>("/subjects"),

  createSubject: (name: string) =>
    request<Subject>("/subjects", { method: "POST", body: JSON.stringify({ name }) }),

  /** A rename carries the new name to every question and concept under it. */
  updateSubject: (id: string, edit: { name?: string; position?: number }) =>
    request<Subject>(`/subjects/${id}`, { method: "PATCH", body: JSON.stringify(edit) }),

  /** Deletes the subject and its folders. The questions survive, unfiled. */
  deleteSubject: (id: string) => request<void>(`/subjects/${id}`, { method: "DELETE" }),

  /** Returns the whole subject, so the strip redraws from the one response. */
  createFolder: (subjectId: string, name: string) =>
    request<Subject>(`/subjects/${subjectId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  /** Moving a folder to another subject carries everything inside it. */
  updateFolder: (
    id: string,
    edit: { name?: string; subject_id?: string; position?: number },
  ) => request<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(edit) }),

  deleteFolder: (id: string) => request<void>(`/folders/${id}`, { method: "DELETE" }),

  /** Take a label off every question carrying it. The questions are untouched. */
  deleteTag: (tag: string) =>
    request<void>(`/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }),

  /** What you have put in, newest first. Narrowed to a folder, this is what a
   *  folder lists. */
  listMaterials: (filters: { folder_id?: string; subject?: string } = {}) =>
    request<Material[]>(`/materials${query(filters)}`),

  /** One material opened: the concepts and questions that came out of it. */
  getMaterial: (id: string) => request<MaterialDetail>(`/materials/${id}`),

  /** Throw away the record of an upload. What came out of it stays. */
  deleteMaterial: (id: string) =>
    request<void>(`/materials/${id}`, { method: "DELETE" }),

  /** The written-up revision page, or null when none has been asked for. */
  getNotes: (id: string) => request<NoteDocument | null>(`/materials/${id}/notes`),

  /** Write it. Kept once written: a second call returns the first call's page
   *  unless `force`, because a revision page that rewrites itself is one you
   *  cannot come back to. */
  writeNotes: (id: string, force = false) =>
    request<NoteDocument>(`/materials/${id}/notes?force=${force}`, { method: "POST" }),

  /** Ask a question about the bank. The model writes the filter; the rows are real. */
  ask: (question: string) =>
    request<Answer>("/ask", { method: "POST", body: JSON.stringify({ question }) }),
};

/** Query keys, in one place so mutations can invalidate precisely. */
export const keys = {
  mistakes: (filters: MistakeFilters = {}) => ["mistakes", filters] as const,
  search: (query: Partial<BankQuery>) => ["mistakes", "search", query] as const,
  mistake: (id: string) => ["mistake", id] as const,
  materials: (filters: { folder_id?: string; subject?: string } = {}) =>
    ["materials", filters] as const,
  material: (id: string) => ["material", id] as const,
  notes: (id: string) => ["material", id, "notes"] as const,
  concepts: () => ["concepts"] as const,
  subjects: () => ["subjects"] as const,
  tags: () => ["tags"] as const,
  concept: (id: string) => ["concept", id] as const,
};
