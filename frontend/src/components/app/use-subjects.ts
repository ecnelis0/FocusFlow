"use client";

import { useQuery } from "@tanstack/react-query";

import { api, keys } from "@/lib/api";

/** Every subject already in the bank, so the subject box can offer them rather
 *  than have "Biology", "biology" and "Bio" drift apart. Free text is still free:
 *  this only feeds a `<datalist>`, it does not restrict what can be typed. */
export function useSubjects(): string[] {
  const { data: stats } = useQuery({ queryKey: keys.stats(), queryFn: api.stats });
  const { data: concepts } = useQuery({
    queryKey: keys.concepts(),
    queryFn: api.listConcepts,
  });

  const seen = new Set<string>();
  for (const slot of stats?.by_subject ?? []) seen.add(slot.key);
  for (const concept of concepts ?? []) if (concept.subject) seen.add(concept.subject);
  return [...seen].sort((a, b) => a.localeCompare(b));
}
