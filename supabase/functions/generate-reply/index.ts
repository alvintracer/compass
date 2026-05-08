// supabase/functions/generate-reply/index.ts
// AI 답변 생성 — 학생의 전체 컨텍스트를 주입하여 입시컨설턴트 답변 대행
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
            `OpenAI ${res.status}, ${wait}ms 대기 후 재시도 (${attempt + 1}/${maxRetries})`,
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
          `OpenAI 네트워크 오류, 재시도 (${attempt + 1}/${maxRetries}): ${err.message}`,
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

// ── 기본 시스템 프롬프트 (DB에 없을 때 fallback) ───────────────────────────
const FALLBACK_SYSTEM_PROMPT = `당신은 대한민국 최고의 대학 입시 컨설턴트 "컴파스"입니다.
학생/학부모와 메세지를 주고받으며 입시 컨설팅을 진행합니다.

## 작성 규칙
- 부모님 대상: 정중한 존댓말, 안심시키는 톤, 진행상황 중심으로 소통
- 학생 대상: 친근하면서도 동기부여가 되는 톤, 구체적 액션 제시
- 답변은 메신저 메세지 형태로 자연스럽게 작성 (너무 길지 않게)
- 학생의 정의서, 면접 준비 현황, 탐구 활동 등 제공된 컨텍스트를 적극 활용
- 마크다운 형식 사용하지 말고 일반 텍스트로 작성
- 인사말/서명 없이 본문만 작성`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      student_id,
      student_name,
      selected_messages,
      receiver_role,
      additional_instruction,
      model,
    } = body;

    // 모델 화이트리스트 검증
    const ALLOWED_MODELS = ["gpt-4.1-mini", "gpt-4.1"];
    const selectedModel = ALLOWED_MODELS.includes(model) ? model : "gpt-4.1-mini";

    if (!student_id || !selected_messages || selected_messages.length === 0) {
      throw new Error("student_id와 selected_messages는 필수입니다.");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. 학생 정의서 조회 ──────────────────────────────────────────────
    let identityContent = "";
    const { data: identityDoc } = await supabaseAdmin
      .from("identity_documents")
      .select("content")
      .eq("user_id", student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (identityDoc?.content) {
      identityContent = identityDoc.content;
    }

    // ── 2. 최근 면접 Q&A 조회 (최근 10개) ────────────────────────────────
    let qnaSummary = "";
    const { data: qnas } = await supabaseAdmin
      .from("interview_qnas")
      .select("question, answer_text, feedback_content, revised_answer, status")
      .eq("user_id", student_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (qnas && qnas.length > 0) {
      qnaSummary = qnas
        .map(
          (q: any, i: number) =>
            `Q${i + 1}: ${q.question}\nA: ${(q.answer_text || "").substring(0, 200)}${(q.answer_text || "").length > 200 ? "..." : ""}\n상태: ${q.status === "completed" ? "완료" : "준비중"}`,
        )
        .join("\n\n");
    }

    // ── 3. 최근 탐구 과제 조회 (최근 5개) ────────────────────────────────
    let researchSummary = "";
    const { data: researches } = await supabaseAdmin
      .from("research_tasks")
      .select("topic, content_text, status")
      .eq("user_id", student_id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (researches && researches.length > 0) {
      researchSummary = researches
        .map(
          (r: any, i: number) =>
            `${i + 1}. ${r.topic} (${r.status === "completed" ? "완료" : "진행중"}) — ${(r.content_text || "").substring(0, 150)}${(r.content_text || "").length > 150 ? "..." : ""}`,
        )
        .join("\n");
    }

    // ── 4. 시스템 프롬프트 조회 ──────────────────────────────────────────
    const baseSystemPrompt = await getActivePrompt(
      supabaseAdmin,
      "message_reply",
      FALLBACK_SYSTEM_PROMPT,
    );

    // ── 5. Context 조합 ──────────────────────────────────────────────────
    const roleLabel = receiver_role === "student" ? "학생" : "부모님";

    let contextBlock = `\n\n## 현재 답장 대상: ${student_name || "학생"}의 ${roleLabel}`;

    if (identityContent) {
      contextBlock += `\n\n## 이 학생에 대한 정의서\n${identityContent}`;
    }

    if (qnaSummary) {
      contextBlock += `\n\n## 면접 준비 현황 (최근 Q&A)\n${qnaSummary}`;
    }

    if (researchSummary) {
      contextBlock += `\n\n## 탐구 활동 현황\n${researchSummary}`;
    }

    const fullSystemPrompt = baseSystemPrompt + contextBlock;

    // ── 6. 선택된 대화 메세지 → user message 구성 ────────────────────────
    const conversationText = selected_messages
      .map((m: any) => {
        const sender =
          m.sender === "consultant"
            ? "컨설턴트"
            : m.sender === "student"
              ? "학생"
              : "부모님";
        const time = new Date(m.created_at).toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `[${sender} ${time}] ${m.content}`;
      })
      .join("\n");

    let userMessage = `아래는 ${roleLabel}과의 대화 내용입니다. 이 대화의 맥락을 이해하고 컨설턴트로서 적절한 답변을 작성해주세요.\n\n---\n${conversationText}\n---`;

    if (additional_instruction?.trim()) {
      userMessage += `\n\n## 컨설턴트 추가 지시사항\n${additional_instruction}`;
    }

    userMessage += `\n\n위 대화에 대해 컨설턴트 입장에서 ${roleLabel}에게 보낼 답변 메세지를 작성해주세요.`;

    // ── 7. GPT 호출 ──────────────────────────────────────────────────────
    const data = await callOpenAI(OPENAI_API_KEY, {
      model: selectedModel,
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const generatedReply = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ generatedReply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "알 수 없는 오류가 발생했습니다.";
    console.error("generate-reply Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
