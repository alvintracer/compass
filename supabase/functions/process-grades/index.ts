// supabase/functions/process-grades/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, images, year } = await req.json();
    // images: { base64: string, mimeType: string }[]

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    }

    if (action === "extract_grades") {
      // 이미지 여러 장을 content 배열로 구성
      const imageContents = images.map((
        img: { base64: string; mimeType: string },
      ) => ({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
          detail: "high",
        },
      }));

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
              {
                role: "system",
                content:
                  `당신은 한국 고등학교 학교생활기록부 성적표 분석 전문가입니다.
업로드된 이미지(1장 이상)에서 ${year}학년의 성적 정보를 추출합니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트나 마크다운 없이 순수 JSON만 출력하세요.

출력 형식:
[
  {
    "semKey": "${year}-1",
    "subjects": [
      { "name": "과목명", "credit": 단위수, "grade": 등급숫자_또는_null }
    ]
  },
  {
    "semKey": "${year}-2",
    "subjects": [...]
  }
]

규칙:
- semKey는 반드시 "${year}-1" 또는 "${year}-2" 형식
- 이미지에 1학기만 있으면 "${year}-1"만, 2학기만 있으면 "${year}-2"만 포함
- 이미지에 ${year}학년이 아닌 다른 학년 성적이 있으면 무시
- 석차등급이 없는 과목(음악/미술/체육/탐구실험/성취도 A·B·C 표기 과목)은 grade를 null로
- 논술·P(이수) 과목도 grade null
- 단위수는 반드시 숫자
- 이수단위 합계 행, 소계 행은 제외
- 여러 이미지에서 동일 학기 데이터가 나오면 합쳐서 하나의 학기로 처리`,
              },
              {
                role: "user",
                content: [
                  ...imageContents,
                  {
                    type: "text",
                    text:
                      `위 이미지들은 ${year}학년 성적표입니다. 학기별로 구분하여 모든 과목의 과목명, 단위수, 석차등급을 추출해 JSON으로만 응답해주세요.`,
                  },
                ],
              },
            ],
            max_tokens: 3000,
            temperature: 0.1,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(`OpenAI 에러: ${data.error?.message}`);

      let resultText = data.choices[0].message.content.trim()
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(resultText);
      if (!Array.isArray(parsed)) throw new Error("올바른 형식이 아닙니다.");

      return new Response(
        JSON.stringify({ result: JSON.stringify(parsed) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("지원하지 않는 액션입니다.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 에러 발생";
    console.error("Grades Function Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
