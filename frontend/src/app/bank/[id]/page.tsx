"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConceptTags } from "@/components/app/concept-tags";
import { Empty } from "@/components/app/empty";
import { MistakeImages } from "@/components/app/images";
import { MistakeFolder } from "@/components/app/mistake-folder";
import { MistakeLabels } from "@/components/app/mistake-labels";
import { Panel } from "@/components/app/panel";
import { QuestionCard } from "@/components/app/question-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, keys } from "@/lib/api";

export default function MistakePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: mistake, isPending, isError } = useQuery({
    queryKey: keys.mistake(id),
    queryFn: () => api.getMistake(id),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteMistake(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mistakes"] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: keys.subjects() });
      toast.success("Removed from the bank.");
      router.push("/bank");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !mistake) {
    return (
      <Empty
        title="Not in your bank."
        body="This question either never existed or belongs to someone else."
        action={{ href: "/bank", label: "Back to the bank" }}
      />
    );
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/bank" className="text-sm text-muted-foreground hover:text-foreground">
          ← The bank
        </Link>
        {mistake.subject && (
          <Badge variant="outline" className="ml-auto">
            {mistake.subject}
          </Badge>
        )}
      </div>

      <Panel className="px-6 py-5">
        <QuestionCard mistake={mistake} />
      </Panel>

      <Panel className="px-6 py-5">
        <MistakeImages mistake={mistake} editable />
      </Panel>

      <Panel className="px-6 py-5">
        <MistakeFolder mistake={mistake} />
      </Panel>

      <Panel className="px-6 py-5">
        <MistakeLabels mistake={mistake} editable />
      </Panel>

      <Panel className="px-6 py-5">
        <ConceptTags mistake={mistake} />
      </Panel>

      <p className="text-xs text-muted-foreground">
        {mistake.source ? `From ${mistake.source}. ` : ""}
        Added {format(new Date(mistake.created_at), "d MMM yyyy, HH:mm")}.
      </p>

      <Button
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
      >
        Remove from the bank
      </Button>
    </article>
  );
}
