import type { BankQuery, ErrorType, Urgency } from "./types";

/** The facets the bank can be sliced by. Each holds a list: OR inside, AND across. */
export interface Facets {
  concept_ids: string[];
  tags: string[];
  /** true = only questions with a concept, false = only those without. */
  hasConcept: boolean | null;
  urgency: Urgency[];
  subjects: string[];
  error_type: ErrorType[];
  topics: string[];
  /** Topic folders. Set by the folder cards on the bank, not by the rail. */
  folder_ids: string[];
  /** false = only what is in the subject but in none of its folders. */
  hasFolder: boolean | null;
  text: string;
}

export const NO_FACETS: Facets = {
  concept_ids: [],
  tags: [],
  hasConcept: null,
  urgency: [],
  subjects: [],
  error_type: [],
  topics: [],
  folder_ids: [],
  hasFolder: null,
  text: "",
};

export function isEmpty(facets: Facets): boolean {
  return (
    facets.tags.length === 0 &&
    facets.hasConcept === null &&
    facets.concept_ids.length === 0 &&
    facets.urgency.length === 0 &&
    facets.subjects.length === 0 &&
    facets.error_type.length === 0 &&
    facets.topics.length === 0 &&
    facets.folder_ids.length === 0 &&
    facets.hasFolder === null &&
    facets.text.trim() === ""
  );
}

export function countSelected(facets: Facets): number {
  return (
    facets.tags.length +
    (facets.hasConcept === null ? 0 : 1) +
    facets.concept_ids.length +
    facets.urgency.length +
    facets.subjects.length +
    facets.error_type.length +
    facets.topics.length +
    facets.folder_ids.length +
    (facets.hasFolder === null ? 0 : 1)
  );
}

/** Add or remove one value, leaving the other facets alone. */
export function toggle<
  K extends
    | "urgency"
    | "subjects"
    | "error_type"
    | "topics"
    | "concept_ids"
    | "tags"
    | "folder_ids",
>(
  facets: Facets,
  key: K,
  value: Facets[K][number],
): Facets {
  const current = facets[key] as string[];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return { ...facets, [key]: next };
}

export function has(facets: Facets, key: keyof Facets, value: string): boolean {
  const current = facets[key];
  return Array.isArray(current) && (current as string[]).includes(value);
}

/** Facets <-> the URL, so a filtered view is a link you can share or go back to. */
export function toSearchParams(facets: Facets): URLSearchParams {
  const params = new URLSearchParams();
  for (const value of facets.concept_ids) params.append("concept", value);
  for (const value of facets.tags) params.append("tag", value);
  if (facets.hasConcept !== null) params.set("tagged", facets.hasConcept ? "1" : "0");
  for (const value of facets.urgency) params.append("urgency", value);
  for (const value of facets.subjects) params.append("subject", value);
  for (const value of facets.error_type) params.append("error_type", value);
  for (const value of facets.topics) params.append("topic", value);
  for (const value of facets.folder_ids) params.append("folder", value);
  if (facets.hasFolder !== null) params.set("filed", facets.hasFolder ? "1" : "0");
  if (facets.text.trim()) params.set("q", facets.text.trim());
  return params;
}

export function fromSearchParams(params: URLSearchParams | ReadonlyURLSearchParamsLike): Facets {
  return {
    concept_ids: params.getAll("concept"),
    tags: params.getAll("tag"),
    hasConcept: params.get("tagged") === null ? null : params.get("tagged") === "1",
    urgency: params.getAll("urgency") as Urgency[],
    subjects: params.getAll("subject"),
    error_type: params.getAll("error_type") as ErrorType[],
    topics: params.getAll("topic"),
    folder_ids: params.getAll("folder"),
    hasFolder: params.get("filed") === null ? null : params.get("filed") === "1",
    text: params.get("q") ?? "",
  };
}

/** Next's `useSearchParams` returns a read-only shape rather than a URLSearchParams. */
interface ReadonlyURLSearchParamsLike {
  getAll(name: string): string[];
  get(name: string): string | null;
}

export function toQuery(facets: Facets): Partial<BankQuery> {
  return {
    concept_ids: facets.concept_ids,
    tags: facets.tags,
    has_concept: facets.hasConcept,
    urgency: facets.urgency,
    subjects: facets.subjects,
    error_type: facets.error_type,
    topics: facets.topics,
    folder_ids: facets.folder_ids,
    has_folder: facets.hasFolder,
    text: facets.text.trim() || null,
    sort: "newest",
    limit: 100,
  };
}
