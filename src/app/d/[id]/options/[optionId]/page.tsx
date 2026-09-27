import type { Metadata } from "next";
import { OptionDetail } from "@/components/decision/OptionDetail";
import { InvalidDecision } from "@/components/decision/States";

export const metadata: Metadata = { title: "Converge — option detail" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OptionPage(props: PageProps<"/d/[id]/options/[optionId]">) {
  const { id, optionId } = await props.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(optionId)) return <InvalidDecision />;
  return <OptionDetail decisionId={id.toLowerCase()} optionId={optionId.toLowerCase()} />;
}
