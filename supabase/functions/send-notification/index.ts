// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const sendEmail = async (to: string, subject: string, html: string) => {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Compass <noreply@compass-edu.netlify.app>", // 🌟 도메인 설정 후 변경
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend 에러: ${JSON.stringify(err)}`);
  }
};

// 이메일 템플릿
const makeEmailHtml = (
  type: "record" | "interview" | "message",
  previewText: string,
) => `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compass 첨삭 완료</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden;">

          <!-- 헤더 -->
          <tr>
            <td style="background:#0f172a;padding:28px 36px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">
                    🧭 Compass
                  </td>
                </tr>
              </table>
            </td>
          </tr>

              <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#0f172a;">
                ${
  type === "record"
    ? "📝 생기부 첨삭이 완료됐어요!"
    : type === "interview"
    ? "🎙️ 면접 Q&A 첨삭이 완료됐어요!"
    : "💬 컴파스 컨설턴트의 새 메세지가 도착했어요!"
}
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#64748b;line-height:1.6;">
                ${
  type === "message"
    ? "한태우 컨설턴트가 메세지를 보냈어요. 지금 바로 확인해보세요."
    : "한태우 컨설턴트가 첨삭을 마쳤어요. 지금 바로 확인해보세요."
}
              </p>

              <!-- 미리보기 -->
              <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;margin-bottom:28px;">
                <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;">
                  ${
  type === "record"
    ? "요청 내용"
    : type === "interview"
    ? "면접 질문"
    : "메세지 내용"
}
                </p>
                <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
                  ${previewText}
                </p>
              </div>

              <!-- CTA 버튼 -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="https://compass-edu.netlify.app" 
                       style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;">
                      Compass에서 확인하기
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                Compass · 입시 컨설팅 서비스 · 이 메일은 발신 전용입니다.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, recordId, qnaId } = await req.json();

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

      // 유저 이메일 조회 (profiles 테이블)
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", record.user_id)
        .single();
      if (!profile?.email) throw new Error("유저 이메일을 찾을 수 없습니다.");

      const preview = (record.request_text || "").substring(0, 120) +
        ((record.request_text || "").length > 120 ? "..." : "");

      await sendEmail(
        profile.email,
        `[Compass] ${record.category} 첨삭이 완료됐어요!`,
        makeEmailHtml("record", preview),
      );

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

      // 유저 이메일 조회 (profiles 테이블)
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", qna.user_id)
        .single();
      if (!profile?.email) throw new Error("유저 이메일을 찾을 수 없습니다.");

      const preview = (qna.question || "").substring(0, 120) +
        ((qna.question || "").length > 120 ? "..." : "");

      await sendEmail(
        profile.email,
        "[Compass] 면접 Q&A 첨삭이 완료됐어요!",
        makeEmailHtml("interview", preview),
      );

      return new Response(
        JSON.stringify({ result: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 메세지 알림 ─────────────────────────────────────────
    if (action === "new_message") {
      const { user_id, message } = await req.json();

      if (!user_id || !message) throw new Error("필수 정보가 누락되었습니다.");

      // 유저 이메일 조회 (profiles 테이블)
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user_id)
        .single();
      if (!profile?.email) throw new Error("유저 이메일을 찾을 수 없습니다.");

      const preview = message.substring(0, 120) +
        (message.length > 120 ? "..." : "");

      await sendEmail(
        profile.email,
        "[Compass] 컨설턴트의 새 메세지가 도착했어요!",
        makeEmailHtml("message", preview),
      );

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
