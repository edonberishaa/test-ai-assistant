import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Assistant } from "@/types";
import ChatInterface from "@/components/chat/ChatInterface";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: assistant } = await supabase
    .from("assistants")
    .select("*")
    .eq("id", id)
    .single<Assistant>();

  if (!assistant) notFound();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      {/* Chat header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(13,13,20,0.9)",
          backdropFilter: "blur(12px)",
          height: 60,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <Link
          href={`/assistants/${id}`}
          style={{
            color: "var(--text-muted)",
            textDecoration: "none",
            fontSize: "0.8rem",
          }}
        >
          ← Back
        </Link>
        <div
          style={{
            width: 1,
            height: 20,
            background: "var(--border)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            fontSize: 14,
            flexShrink: 0,
            background:
              "linear-gradient(135deg, rgba(124,92,252,0.35), rgba(34,211,168,0.18))",
            border: "1px solid rgba(124,92,252,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          🤖
        </div>
        <div>
          <p
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              marginBottom: 1,
            }}
          >
            Chat with
          </p>
          <h1
            style={{
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "var(--text-primary)",
            }}
          >
            {assistant.name}
          </h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <span className="badge">{assistant.tone}</span>
          <span className="badge">{assistant.language}</span>
        </div>
      </header>
      <ChatInterface assistantId={id} assistantName={assistant.name} />
    </div>
  );
}
