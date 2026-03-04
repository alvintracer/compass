// supabase/functions/process-record/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── 활성 프롬프트 조회 헬퍼 ────────────────────────────────────────────────
const getActivePrompt = async (
  supabase: any,
  type: string,
  fallback: string,
): Promise<string> => {
  const { data } = await supabase
    .from("ai_prompts")
    .select("prompt")
    .eq("type", type)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  return data?.prompt ?? fallback;
};

// ── 기본 프롬프트 (fallback) ───────────────────────────────────────────────
const FALLBACK_SCHOOLLIFE = `당신은 대한민국 최고의 학생부 전문 컨설턴트입니다.
학생이 생활기록부에 기재하고 싶은 내용을 바탕으로 아래 형식으로 출력해 주세요.

[완성형 생기부 문장]
실제 학교 생활기록부에 들어갈 수 있는 완성형 문장을 작성해 주세요.
- 교사 서술형 문체 사용 (예: "~함", "~하였음", "~를 보임")
- 탐구력, 주도성, 성장, 사회적 가치 연결
- 구체적 활동 + 역량 발현 + 의미/성찰 구조
- 3~5문장, 200~350자 내외

[작성 포인트]
이 생기부 내용이 입시에서 효과적인 이유와 더 보완하면 좋을 점 2가지를 간결하게 설명해 주세요.`;

const FALLBACK_TASK =
  `당신은 대한민국 최고의 학생부 전문 컨설턴트이자 학습 코치입니다.
학생이 제출해야 할 과제(수행평가, 보고서 등)에 대해 아래 형식으로 출력해 주세요.

[과제 방향성]
이 과제에서 어떤 방향으로 접근해야 좋은 평가를 받을 수 있는지 핵심 전략을 2~3가지로 설명해 주세요.

[작성 초안]
위 방향성을 반영한 실제 제출 가능한 수준의 완성형 초안을 작성해 주세요.
(학생이 제출한 초안이 있다면 그것을 업그레이드 해주세요.)

[개선 포인트]
초안에서 더 보완하면 좋을 점 2~3가지를 간결하게 설명해 주세요.`;

// ── 텔레그램 알림 ─────────────────────────────────────────────────────────
const sendTelegram = async (message: string) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 이미지 텍스트 추출 ─────────────────────────────────────────────────
    if (action === "extract_text") {
      const { imageBase64, mimeType } = body;

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                },
                {
                  type: "text",
                  text:
                    "이 이미지에서 텍스트를 그대로 추출해 주세요. 서식이나 설명 없이 텍스트 내용만 출력하세요.",
                },
              ],
            }],
            max_tokens: 2000,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(`OpenAI 에러: ${data.error?.message}`);

      return new Response(
        JSON.stringify({ result: data.choices[0].message.content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── AI 첨삭 ────────────────────────────────────────────────────────────
    if (action === "ai_feedback") {
      const { recordId, requestText, contentText, category, categoryType } =
        body;

      let systemPrompt = "";
      let userMessage = "";

      if (categoryType === "task") {
        systemPrompt = await getActivePrompt(
          supabase,
          "record_task",
          FALLBACK_TASK,
        );
        userMessage = `[카테고리]: ${category}\n[요청 내용]: ${requestText}${
          contentText ? `\n\n[참고 자료 / 기존 초안]\n${contentText}` : ""
        }`;
      } else {
        systemPrompt = await getActivePrompt(
          supabase,
          "record_schoollife",
          FALLBACK_SCHOOLLIFE,
        );
        userMessage =
          `[카테고리]: ${category}\n[학생이 담고 싶은 내용]: ${requestText}${
            contentText ? `\n\n[참고 자료 / 활동 기록]\n${contentText}` : ""
          }`;
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: 0.65,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(`OpenAI 에러: ${data.error?.message}`);

      const feedbackResult = data.choices[0].message.content;

      await supabase
        .from("record_feedbacks")
        .update({
          feedback_result: feedbackResult,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", recordId);

      return new Response(
        JSON.stringify({ result: feedbackResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 휴먼 컨설턴트 요청 + 텔레그램 알림 ────────────────────────────────
    if (action === "human_request") {
      const { recordId, requestText, category } = body;

      await supabase
        .from("record_feedbacks")
        .update({ status: "submitted", updated_at: new Date().toISOString() })
        .eq("id", recordId);

      const preview = (requestText || "").substring(0, 100);
      await sendTelegram(
        `🔔 <b>새 생기부 첨삭 요청</b>\n\n` +
          `📂 카테고리: ${category}\n` +
          `📝 내용: ${preview}${
            (requestText || "").length > 100 ? "..." : ""
          }\n\n` +
          `👉 어드민 페이지에서 확인해 주세요.`,
      );

      return new Response(
        JSON.stringify({ result: "submitted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("지원하지 않는 액션입니다.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 에러 발생";
    console.error("Record Function Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
