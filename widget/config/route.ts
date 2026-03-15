import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { checkDomainAccess } from "@/lib/check-domain";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  const chatbotId = req.nextUrl.searchParams.get("chatbot_id")?.trim();

  if (!chatbotId) {
    return NextResponse.json(
      { error: "chatbot_id is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const domainCheck = await checkDomainAccess(req, chatbotId, { corsHeaders });
  if (!domainCheck.ok) {
    return domainCheck.response!;
  }

  const supabase = createServiceClient();
  const { data: assistant } = await supabase
    .from("assistants")
    .select("id, name, accent_color, bg_color")
    .eq("id", chatbotId)
    .single();

  if (!assistant) {
    return NextResponse.json(
      { error: "Chatbot not found" },
      { status: 404, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    {
      chatbot: {
        id: assistant.id,
        name: assistant.name,
        accent_color: assistant.accent_color,
        bg_color: assistant.bg_color,
      },
    },
    { headers: corsHeaders },
  );
}
