"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, keys } from "@/lib/api";
import type { Mistake, MistakeEdit } from "@/lib/types";

/** Every write to a question lands here, so the caches it affects stay in step.
 *
 *  Materials and subjects are invalidated alongside the question itself: both
 *  carry counts of what is filed where, and an edit that moves a question
 *  between folders changes two of them. */
export function useUpdateMistake(id: string, onDone?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (edit: MistakeEdit) => api.updateMistake(id, edit),
    onSuccess: (updated: Mistake) => {
      queryClient.setQueryData(keys.mistake(id), updated);
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      toast.success("Saved.");
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
