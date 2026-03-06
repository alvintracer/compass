// supabase/functions/generate-identity/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── OpenAI 호출 (retry + timeout) ──────────────────────────────────────────
async function callOpenAI(
  apiKey: string,
  body: Record<string, unknown>,
  maxRetries = 3,
  timeoutMs = 55000,
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const wait = 2000 * (attempt + 1);
          console.warn(
            `OpenAI ${res.status}, ${wait}ms 대기 후 재시도 (${
              attempt + 1
            }/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          `OpenAI API 에러: ${data.error?.message || res.status}`,
        );
      }
      return data;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        if (attempt < maxRetries) {
          console.warn(
            `OpenAI 타임아웃, 재시도 (${attempt + 1}/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error("OpenAI 요청 시간 초과 (55초)");
      }
      if (attempt < maxRetries && !err.message?.includes("OpenAI API 에러")) {
        console.warn(
          `OpenAI 네트워크 오류, 재시도 (${
            attempt + 1
          }/${maxRetries}): ${err.message}`,
        );
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("OpenAI 호출 실패: 최대 재시도 횟수 초과");
}

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

// ── 기본 프롬프트 (DB에 없을 때 fallback) ──────────────────────────────────
const FALLBACK_INITIAL =
  `당신은 대한민국 최고의 대학 입시 컨설턴트입니다. 학생이 입력한 '온보딩 설문 답변'을 분석하여 마크다운 형식의 '학생 본질 정의서'를 작성해주세요. 학생의 본질(Core Identity), 진로 방향성(Career Path), 그리고 핵심 키워드 3가지를 포함하여 전문가적이고 통찰력 있게 분석해 주세요. 반드시 마크다운 형식의 본문만 출력하고 인사말은 생략하세요.`;

const FALLBACK_EDIT =
  `당신은 대한민국 최고의 대학 입시 컨설턴트입니다. 학생의 기존 '정의서(마크다운)' 내용을 바탕으로, 사용자가 요청한 수정 프롬프트를 정확히 반영하여 더욱 정돈되고 매력적인 마크다운 형식으로 재작성해주세요. 반드시 마크다운 형식의 본문만 출력하세요.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, currentContent, userPrompt, onboardingData } = body;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error(
        "Supabase에 OPENAI_API_KEY 환경변수가 설정되지 않았습니다.",
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let systemPrompt = "";
    let userMessage = "";

    if (action === "edit") {
      systemPrompt = await getActivePrompt(
        supabase,
        "identity_edit",
        FALLBACK_EDIT,
      );
      userMessage =
        `[기존 내용]\n${currentContent}\n\n[수정 요청사항]\n${userPrompt}`;
    } else if (action === "initial") {
      systemPrompt = await getActivePrompt(
        supabase,
        "identity_initial",
        FALLBACK_INITIAL,
      );
      userMessage = `[학생 온보딩 데이터]\n${onboardingData}`;
    } else {
      throw new Error("지원하지 않는 액션입니다.");
    }

    const data = await callOpenAI(OPENAI_API_KEY, {
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const editedContent = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ editedContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "알 수 없는 오류가 발생했습니다.";
    console.error("Function Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
