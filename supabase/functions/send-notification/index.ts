// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 텔레그램 알림
const sendTelegram = async (message: string, targetType: "admin" | "student" = "admin") => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = targetType === "student" 
    ? Deno.env.get("STUDENT_TELEGRAM_CHAT_ID") 
    : Deno.env.get("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    console.error(`Missing Token or ChatId for targetType: ${targetType}`);
    return;
  }
  
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });

  if (!response.ok) {
    console.error("Failed to send telegram message:", await response.text());
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { action, recordId, qnaId, user_id } = payload;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 생기부 첨삭 완료 알림 ────────────────────────────────────────────
    if (action === "record_completed") {
      const { data: record } = await supabase
        .from("record_feedbacks")
        .select("user_id, request_text, category")
        .eq("id", recordId)
        .single();

      if (!record) throw new Error("요청을 찾을 수 없습니다.");

      const preview = (record.request_text || "").substring(0, 120) +
        ((record.request_text || "").length > 120 ? "..." : "");

      const message = `<b>📝 생기부 ${record.category || "기본"} 첨삭 완료 알림</b>

한태우 컨설턴트가 첨삭을 마쳤어요. 지금 바로 확인해보세요!

<b>✍️ 요청 내용 요약</b>
<i>${preview}</i>

<b>👉 <a href="https://compass-edu.netlify.app">Compass에서 확인하기</a></b>`;

      await sendTelegram(message, "student");

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 면접 Q&A 첨삭 완료 알림 ─────────────────────────────────────────
    if (action === "interview_completed") {
      const { data: qna } = await supabase
        .from("interview_qnas")
        .select("user_id, question")
        .eq("id", qnaId)
        .single();

      if (!qna) throw new Error("요청을 찾을 수 없습니다.");

      const preview = (qna.question || "").substring(0, 120) +
        ((qna.question || "").length > 120 ? "..." : "");

      const message = `<b>🎙️ 면접 Q&A 첨삭 완료 알림</b>

한태우 컨설턴트가 첨삭을 마쳤어요. 지금 바로 확인해보세요!

<b>💡 면접 질문 요약</b>
<i>${preview}</i>

<b>👉 <a href="https://compass-edu.netlify.app">Compass에서 확인하기</a></b>`;

      await sendTelegram(message, "student");

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 앱 확인 요청 알림 ─────────────────────────────────────────
    if (action === "app_alert") {
      const { user_id, alertMessage } = payload;
      if (!user_id) throw new Error("필수 정보가 누락되었습니다.");

      const messageContent = alertMessage ? `\n\n<b>✉️ 메시지:</b>\n<i>${alertMessage}</i>` : '';

      const message = `<b>🚨 컴파스 앱 확인 요청</b>

한태우 컨설턴트님이 컴파스 앱 접속을 요청하셨습니다. 앱에서 상세 내용을 확인해보세요!${messageContent}

<b>👉 <a href="https://compass-edu.netlify.app">Compass에서 확인하기</a></b>`;

      await sendTelegram(message, "student");

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 과제 출제 알림 ─────────────────────────────────────────
    if (action === "task_assigned") {
      const { user_id, taskTitle } = payload;
      if (!user_id || !taskTitle) throw new Error("필수 정보가 누락되었습니다.");

      const message = `<b>📋 새 과제 출제 알림</b>

한태우 컨설턴트님이 새로운 과제를 출제했습니다. 기한 내에 확인하고 진행해주세요!

<b>📌 과제명:</b> <i>${taskTitle}</i>

<b>👉 <a href="https://compass-edu.netlify.app">Compass에서 확인하기</a></b>`;

      await sendTelegram(message, "student");

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 어드민 텔레그램 푸시 ─────────────────────────────────────────
    if (action === "admin_telegram") {
      const { message } = payload;
      if (!message) throw new Error("메세지 내용이 없습니다.");

      // 어드민용 텔레그램 발송
      await sendTelegram(message, "admin");

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("지원하지 않는 액션입니다.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 에러 발생";
    console.error("Notification Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
