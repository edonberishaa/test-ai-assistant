import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { retrieveContext, buildSystemPrompt } from "@/lib/rag";
import { groq, CHAT_MODEL, MAX_TOKENS } from "@/lib/ai";
import type { ChatHistoryMessage, ChatRequest, Assistant } from "@/types";
import { extractIp, logAuditEvent } from "@/lib/audit";
import { checkDomainAccess } from "@/lib/check-domain";
import { getVisitorIp } from "@/lib/get-ip";
import { checkRateLimit } from "@/lib/rate-limiter";
import { detectUnanswered } from "@/lib/detect-unanswered";
import { saveUnansweredQuestion } from "@/lib/unanswered-questions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { ipForLog } = extractIp(req);

    const body: ChatRequest = await req.json();
    const { assistant_id, session_id, history, message } = body;

    if (!assistant_id || !message) {
      return NextResponse.json(
        { error: "assistant_id and message are required" },
        { status: 400 },
      );
    }

    const domainCheck = await checkDomainAccess(req, assistant_id);
    if (!domainCheck.ok) {
      return domainCheck.response!;
    }

    // Sanitize user message (basic length cap to prevent prompt injection)
    const sanitizedMessage = message.slice(0, 2000).trim();

    // Validate assistant exists
    // We use the service client instead of the user client so that public widgets can query the assistant
    const serviceClient = createServiceClient();
    const { data: assistant } = await serviceClient
      .from("assistants")
      .select(
        "id, tone, language, organization_id, rate_limit_messages, rate_limit_window_minutes",
      )
      .eq("id", assistant_id)
      .single<Assistant>();

    if (!assistant) {
      await logAuditEvent("chat.request", {
        ip: ipForLog,
        userAgent: req.headers.get("user-agent"),
        details: {
          assistantId: assistant_id,
          sessionId: session_id ?? null,
          messageLength: sanitizedMessage.length,
          foundAssistant: false,
        },
      });
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 },
      );
    }

    if (!domainCheck.isAppDomain) {
      const hasIpHeader =
        !!req.headers.get("x-forwarded-for") ||
        !!req.headers.get("x-real-ip") ||
        !!req.headers.get("cf-connecting-ip");

      const extractedIp = getVisitorIp(req);
      const rateKeyAddress =
        !hasIpHeader && session_id
          ? `session-${session_id.slice(0, 128)}`
          : extractedIp;

      const limitResult = await checkRateLimit(
        assistant_id,
        rateKeyAddress,
        assistant.rate_limit_messages,
        assistant.rate_limit_window_minutes,
      );

      if (!limitResult.allowed) {
        return NextResponse.json(
          {
            error: "Too many messages. Please try again later.",
            code: "RATE_LIMITED",
            reset_at: limitResult.reset_at?.toISOString() ?? null,
          },
          { status: 429 },
        );
      }
    }

    // Retrieve relevant context via RAG
    const contextChunks = await retrieveContext(assistant_id, sanitizedMessage);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      assistant.tone,
      assistant.language,
      contextChunks,
    );

    const normalizedHistory: ChatHistoryMessage[] = Array.isArray(history)
      ? history
          .filter(
            (entry): entry is ChatHistoryMessage =>
              !!entry &&
              (entry.role === "user" || entry.role === "assistant") &&
              typeof entry.content === "string",
          )
          .map((entry) => ({
            role: entry.role,
            content: entry.content.slice(0, 4000).trim(),
          }))
          .filter((entry) => entry.content.length > 0)
          .slice(-20)
      : [];

    await logAuditEvent("chat.request", {
      ip: ipForLog,
      userAgent: req.headers.get("user-agent"),
      details: {
        assistantId: assistant_id,
        sessionId: session_id ?? null,
        organizationId: assistant.organization_id,
        historyCount: normalizedHistory.length,
        messageLength: sanitizedMessage.length,
      },
    });

    // Stream LLM response using Groq
    const stream = await groq().chat.completions.create({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...normalizedHistory,
        { role: "user", content: sanitizedMessage },
      ],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullResponse = "";

        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              fullResponse += delta;
              const sseChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
              controller.enqueue(encoder.encode(sseChunk));
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));

          const completedResponse = fullResponse.trim();

          if (detectUnanswered(completedResponse)) {
            void saveUnansweredQuestion({
              assistantId: assistant_id,
              sessionId: session_id ?? null,
              question: sanitizedMessage,
              botResponse: completedResponse,
            });
          }
        } catch (streamError) {
          console.error("[/api/chat] Stream error:", streamError);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[/api/chat] Error:", message);
    if (stack) console.error("[/api/chat] Stack:", stack);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
