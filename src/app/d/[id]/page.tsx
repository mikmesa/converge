import type { Metadata } from "next";
import { DecisionApp } from "@/components/decision/DecisionApp";
import { InvalidDecision } from "@/components/decision/States";

export const metadata: Metadata = { title: "Converge — decision" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DecisionPage(props: PageProps<"/d/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!UUID_RE.test(id)) return <InvalidDecision />;
  return <DecisionApp id={id.toLowerCase()} justCreated={sp.created === "1"} />;
}
