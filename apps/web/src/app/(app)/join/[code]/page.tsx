"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const preview = useQuery(orpc.crews.previewInvite.queryOptions({ input: { inviteCode: code }, retry: false }));
  const join = useMutation(
    orpc.crews.join.mutationOptions({
      onSuccess: (crew) => {
        qc.invalidateQueries();
        router.push(`/crews/${crew.id}`);
      },
    }),
  );
  if (preview.isLoading) return <p className="text-muted">Checking invite…</p>;
  if (preview.error)
    return (
      <div className="card mx-auto max-w-sm p-6 text-center">
        <p className="font-medium">That invite link doesn&apos;t work.</p>
        <p className="mt-1 text-sm text-muted">It may have been reset. Ask for a fresh one.</p>
      </div>
    );
  const crew = preview.data!;
  return (
    <div className="card mx-auto max-w-sm p-6 text-center">
      <div className="text-5xl">{crew.emoji}</div>
      <h1 className="mt-3 text-xl font-semibold">Join {crew.name}?</h1>
      <p className="mt-1 text-sm text-muted">{crew.memberCount} {crew.memberCount === 1 ? "person is" : "people are"} already in.</p>
      {join.error && <p className="mt-3 text-sm text-nope">{join.error.message}</p>}
      <button className="btn-primary mt-5 w-full" disabled={join.isPending} onClick={() => join.mutate({ inviteCode: code })}>
        {join.isPending ? "Joining…" : "I'm in"}
      </button>
    </div>
  );
}
