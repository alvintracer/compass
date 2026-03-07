// supabase/functions/process-interview/index.ts
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
        throw new Error(`OpenAI 에러: ${data.error?.message || res.status}`);
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
      if (attempt < maxRetries && !err.message?.includes("OpenAI 에러")) {
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

// ── 기본 프롬프트 (fallback) ───────────────────────────────────────────────
const FALLBACK_QUESTIONS =
  `당신은 대한민국 최고의 대학 입시 면접관입니다. 학생의 '정의서' 내용과 희망하는 '진로 Path'를 바탕으로, 실제 면접에서 나올 법한 날카롭고 본질적인 맞춤형 면접 질문 3개를 생성해 주세요. 반드시 기존에 이미 생성된 질문들과 다른 새로운 각도의 질문을 만들어야 합니다. 반드시 다른 말은 빼고 질문 3개를 JSON 배열(Array of strings) 형태로만 출력하세요. 예: ["질문1", "질문2", "질문3"]`;

const FALLBACK_EVALUATE =
  `당신은 날카로우면서도 따뜻한 입시 컨설턴트입니다. 면접 질문에 대한 학생의 답변을 읽고 아래 형식으로 반드시 출력하세요.

[첨삭된 답변]
학생의 원문 의도를 살리되, 더 구체적이고 임팩트 있게 업그레이드된 완성형 답변을 작성해 주세요. 수동적 표현은 능동적으로, 추상적 표현은 구체적 사례로 보완하세요.

[컨설턴트 코멘트]
잘한 점 1가지, 개선된 핵심 포인트 2가지를 간결하게 작성해 주세요.`;

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
    const {
      action,
      identityContent,
      pathName,
      questionText,
      answerText,
      existingQuestions,
      qnaId,
      // 탐구 과제용
      existingTopics,
      topic,
      contentText,
    } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 질문 생성 ───────────────────────────────────────────────────────────
    if (action === "generate_questions") {
      const hasExisting = existingQuestions && existingQuestions.length > 0;
      const existingBlock = hasExisting
        ? `\n\n[이미 생성된 질문 목록 - 아래 질문들과 유사하거나 중복되는 질문은 절대 생성하지 마세요]\n${
          existingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`)
            .join("\n")
        }`
        : "";

      // DB에서 활성 프롬프트 로드
      let basePrompt = await getActivePrompt(
        supabase,
        "interview_questions",
        FALLBACK_QUESTIONS,
      );

      // 기존 질문 중복 방지 블록은 항상 동적으로 추가
      const systemPrompt = basePrompt + (
        hasExisting
          ? " 반드시 기존에 이미 생성된 질문들과 다른 새로운 각도의 질문을 만들어야 합니다."
          : ""
      );
      const userMessage =
        `[진로 Path]: ${pathName}\n\n[학생 정의서]\n${identityContent}${existingBlock}`;

      const data = await callOpenAI(OPENAI_API_KEY, {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      return new Response(
        JSON.stringify({ result: data.choices[0].message.content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── AI 답변 평가 ────────────────────────────────────────────────────────
    if (action === "evaluate_answer") {
      const systemPrompt = await getActivePrompt(
        supabase,
        "interview_evaluate",
        FALLBACK_EVALUATE,
      );

      const data = await callOpenAI(OPENAI_API_KEY, {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              `[면접 질문]\n${questionText}\n\n[학생 원문 답변]\n${answerText}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      return new Response(
        JSON.stringify({ result: data.choices[0].message.content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 탐구 과제 주제 생성 ──────────────────────────────────────────────────
    if (action === "generate_research_topics") {
      const hasExisting = existingTopics && existingTopics.length > 0;
      const existingBlock = hasExisting
        ? `\n\n[이미 생성된 주제 목록 - 아래 주제들과 유사하거나 중복되는 주제는 절대 생성하지 마세요]\n${
          existingTopics.map((t: string, i: number) => `${i + 1}. ${t}`)
            .join("\n")
        }`
        : "";

      const systemPrompt = await getActivePrompt(
        supabase,
        "research_topics",
        `당신은 대한민국 최고의 입시 컨설턴트입니다. 학생의 '정의서'와 '진로 Path'를 바탕으로, 해당 분야에 대한 깊이 있는 탐구 과제 주제 3개를 생성해 주세요.

각 주제는:
- 해당 진로 분야의 핵심 인물, 최신 이슈, 학문적 개념, 산업 트렌드 등을 포함
- 학생이 1000자 이상의 깊이 있는 조사 보고서를 작성할 수 있는 구체적인 주제
- 면접에서 "이 분야에 대해 어떤 탐구를 했나요?"라는 질문에 답변 소재가 될 수 있는 주제

반드시 다른 말은 빼고 주제 3개를 JSON 배열(Array of strings) 형태로만 출력하세요.
예: ["주제1", "주제2", "주제3"]`,
      );

      const data = await callOpenAI(OPENAI_API_KEY, {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              `[진로 Path]: ${pathName}\n\n[학생 정의서]\n${identityContent}${existingBlock}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      return new Response(
        JSON.stringify({ result: data.choices[0].message.content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 탐구 과제 첨삭 ──────────────────────────────────────────────────────
    if (action === "evaluate_research") {
      const systemPrompt = await getActivePrompt(
        supabase,
        "research_evaluate",
        `당신은 날카로우면서도 따뜻한 입시 컨설턴트입니다. 학생이 진로 탐구 과제로 작성한 조사 내용을 읽고 아래 형식으로 반드시 출력하세요.

[첨삭된 내용]
학생의 원문 의도를 살리되, 논리 구조를 개선하고 더 깊이 있는 분석과 구체적 사례를 보완한 업그레이드된 조사 내용을 작성해 주세요. 학술적 용어 활용, 출처 언급 방식, 자기 견해 제시 등을 강화하세요.

[컨설턴트 코멘트]
- 잘한 점 1가지
- 보완이 필요한 핵심 포인트 2가지
- 면접에서 이 탐구 내용을 활용하는 팁 1가지`,
      );

      const data = await callOpenAI(OPENAI_API_KEY, {
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              `[탐구 주제]\n${topic}\n\n[학생의 조사 내용]\n${contentText}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      return new Response(
        JSON.stringify({ result: data.choices[0].message.content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 휴먼 컨설턴트 요청 + 텔레그램 알림 ────────────────────────────────
    if (action === "human_request") {
      const preview = (questionText || "").substring(0, 80);
      await sendTelegram(
        `🔔 <b>새 면접 Q&A 첨삭 요청</b>\n\n` +
          `❓ 질문: ${preview}${
            (questionText || "").length > 80 ? "..." : ""
          }\n\n` +
          `👉 어드민 페이지에서 확인해 주세요.`,
      );
      return new Response(
        JSON.stringify({ result: "notified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("지원하지 않는 액션입니다.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 에러 발생";
    console.error("Interview Function Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
