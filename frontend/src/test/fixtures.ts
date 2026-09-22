import type { Concept, Material, Mistake, Subject } from "@/lib/types";

export function makeMistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: "m1",
    created_at: new Date().toISOString(),
    subject: "Algebra",
    folder_id: null,
    source: "Practice Test 4",
    question_text: "If 3x + 7 = 22, what is the value of x?",
    choices: ["3", "5", "7", "15"],
    correct_answer: "5",
    student_note: null,
    topic: "linear equations",
    tags: ["algebra"],
    material_id: null,
    concepts: [],
    images: [],
    ...overrides,
  };
}

export function makeConcept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: "c1",
    title: "Circumference gives you the radius first",
    body: null,
    subject: "Math",
    folder_id: null,
    parent_id: null,
    sequence: null,
    when_label: null,
    map_x: null,
    map_y: null,
    created_at: new Date().toISOString(),
    updated_at: null,
    question_count: 0,
    images: [],
    ...overrides,
  };
}

/** A subject with one folder in it, which is the shape the bank's tab strip draws. */
export function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: "s1",
    name: "APUSH",
    position: 1,
    created_at: new Date().toISOString(),
    folders: [],
    concept_count: 0,
    question_count: 0,
    unfiled_concept_count: 0,
    unfiled_question_count: 0,
    ...overrides,
  };
}

export function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat1",
    created_at: new Date().toISOString(),
    title: "cell-biology.pdf",
    kind: "pdf",
    source: "cell-biology.pdf",
    summary: "Four concepts on transport across a membrane.",
    subject: "Biology",
    folder_id: "f1",
    concept_count: 4,
    question_count: 8,
    ...overrides,
  };
}
