// supabase/functions/parse-admission/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParsedRow {
  university: string;
  admission_year: number;
  admission_type: string;
  college: string | null;
  department: string;
  major: string | null;
  quota: number | null;
  competition_rate: number | null;
  waitlist_rank: number | null;
  grade_top: number | null;
  grade_avg: number | null;
  grade_bottom: number | null;
  nat_science: boolean;
}

const SYSTEM_PROMPT =
  `당신은 대한민국 대학 입시 결과 데이터를 추출하는 전문가입니다.

입력 형식:
- PDF 표에서 좌표 기반으로 추출된 텍스트로 각 셀이 탭으로 구분됩니다
- 한 행에 여러 전형 데이터가 연속으로 나열될 수 있습니다
- 헤더 행을 먼저 파악해서 각 컬럼이 어떤 전형의 어떤 값인지 매핑하세요

응답 형식: 반드시 {"rows": [...]} JSON만 출력. 마크다운 불가. 설명 불가.

각 객체 스키마:
{
  "university": string,
  "admission_year": number,
  "admission_type": string,
  "college": string | null,
  "department": string,
  "major": string | null,
  "quota": number | null,
  "competition_rate": number | null,
  "waitlist_rank": number | null,
  "grade_top": number | null,
  "grade_avg": number | null,
  "grade_bottom": number | null,
  "nat_science": boolean
}

규칙:
- 한 행에 전형이 여러 개면 전형 수만큼 별도 객체 생성
- 모집인원이 "-"이거나 없으면 해당 전형 건너뜀
- "9.4 : 1" → competition_rate: 9.4
- [자연] 표시 있으면 nat_science: true
- 숫자 불명확 시 null`;

// ── GPT 호출 (재시도 포함) ──────────────────────────────────────────────────
async function callGPT(
  openaiKey: string,
  fileName: string,
  university: string,
  headerLines: string,
  chunkText: string,
  retryCount = 0,
): Promise<ParsedRow[]> {
  const userMsg =
    `파일명: ${fileName}\n대학교: ${university}\n\n=== 헤더 ===\n${headerLines}\n\n=== 데이터 ===\n${chunkText}`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano", // 4.1-nano: 빠르고 저렴, 구조적 데이터에 충분
        max_tokens: 3000,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
  } catch (fetchErr: any) {
    if (retryCount < 2) {
      console.warn(`네트워크 오류, ${retryCount + 1}회 재시도...`);
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      return callGPT(
        openaiKey,
        fileName,
        university,
        headerLines,
        chunkText,
        retryCount + 1,
      );
    }
    throw new Error(`OpenAI 연결 실패: ${fetchErr.message}`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 429 Rate Limit → 잠시 대기 후 재시도
    if (res.status === 429 && retryCount < 3) {
      const wait = 2000 * (retryCount + 1);
      console.warn(`Rate limit, ${wait}ms 대기 후 재시도...`);
      await new Promise((r) => setTimeout(r, wait));
      return callGPT(
        openaiKey,
        fileName,
        university,
        headerLines,
        chunkText,
        retryCount + 1,
      );
    }
    throw new Error(`OpenAI 오류: ${err.error?.message || res.status}`);
  }

  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

  console.log(`finish_reason: ${finishReason}, 응답길이: ${raw.length}자`);

  // 응답이 잘린 경우 (length) → 부분 복구
  if (finishReason === "length") {
    console.warn("토큰 초과로 잘림 — 부분 복구 시도");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("JSON 파싱 실패(앞300자):", raw.slice(0, 300));
    parsed = recoverPartialJson(raw);
    if (!parsed) return []; // 복구 실패 시 빈 배열 (전체 실패 막기)
  }

  const rows: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rows)
    ? parsed.rows
    : [];

  return rows;
}

// ── 잘린 JSON 부분 복구 ─────────────────────────────────────────────────────
function recoverPartialJson(raw: string): any | null {
  try {
    const startArr = raw.indexOf("[");
    if (startArr === -1) return null;
    const lastBrace = raw.lastIndexOf("},");
    if (lastBrace === -1) return null;
    const recovered = JSON.parse(raw.slice(startArr, lastBrace + 1) + "]");
    console.log(`부분 복구 성공: ${recovered.length}행`);
    return { rows: recovered };
  } catch {
    return null;
  }
}

// ── 텍스트 → 헤더 + 청크 분리 ──────────────────────────────────────────────
function splitHeaderAndData(rawText: string): {
  university: string;
  headerLines: string;
  dataChunks: string[];
} {
  const allLines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--- PAGE"));

  // 대학교명: 앞 15줄 중 "대학교" 포함, 탭 없고 짧은 줄
  let university = "";
  for (const line of allLines.slice(0, 15)) {
    const noTab = line.replace(/\t/g, "").trim();
    if (noTab.includes("대학교") && noTab.length < 20 && !line.includes("\t")) {
      university = noTab;
      break;
    }
  }

  // 헤더: "모집인원" "경쟁률" "최고" "평균" 포함 행 위치
  const headerIdx = allLines.findIndex((l) =>
    l.includes("모집인원") || l.includes("경쟁률") ||
    (l.includes("최고") && l.includes("평균"))
  );
  const headerLines = allLines
    .slice(0, headerIdx >= 0 ? Math.min(headerIdx + 4, 10) : 6)
    .join("\n");

  // ★ 핵심 필터: 소수점 숫자 포함 + 탭 5개 이상인 행만 → 실제 데이터 행
  // (헤더/빈줄/페이지제목 등 걸러냄 → 35청크 → ~3청크로 감소)
  const dataLines = allLines.filter((l) => {
    const tabCount = (l.match(/\t/g) || []).length;
    const hasDecimal = /\d+\.\d+/.test(l); // 소수점 숫자 (등급값)
    return tabCount >= 5 && hasDecimal;
  });

  console.log(`전체줄: ${allLines.length}, 데이터행: ${dataLines.length}`);

  // 25줄씩 청크 (4o-mini는 빠르므로 조금 더 크게)
  const CHUNK = 25;
  const chunks: string[] = [];
  for (let i = 0; i < dataLines.length; i += CHUNK) {
    chunks.push(dataLines.slice(i, i + CHUNK).join("\n"));
  }

  return {
    university,
    headerLines,
    dataChunks: chunks.length > 0 ? chunks : [],
  };
}

// ── 타입 보정 ───────────────────────────────────────────────────────────────
function cleanRow(r: any, university: string, year: number): ParsedRow {
  return {
    university: String(r.university || university || ""),
    admission_year: Number(r.admission_year) || year,
    admission_type: String(r.admission_type || ""),
    college: r.college ? String(r.college) : null,
    department: String(r.department || ""),
    major: r.major ? String(r.major) : null,
    quota: r.quota != null ? (Number(r.quota) || null) : null,
    competition_rate: r.competition_rate != null
      ? (Number(r.competition_rate) || null)
      : null,
    waitlist_rank: r.waitlist_rank != null
      ? (Number(r.waitlist_rank) || null)
      : null,
    grade_top: r.grade_top != null ? (Number(r.grade_top) || null) : null,
    grade_avg: r.grade_avg != null ? (Number(r.grade_avg) || null) : null,
    grade_bottom: r.grade_bottom != null
      ? (Number(r.grade_bottom) || null)
      : null,
    nat_science: Boolean(r.nat_science),
  };
}

function extractYear(fileName: string): number {
  const m = fileName.match(/20\d{2}/);
  return m ? parseInt(m[0]) : new Date().getFullYear();
}

// ── 메인 핸들러 ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "인증 필요" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "인증 실패" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "관리자만 사용할 수 있어요" }),
        { status: 403, headers: corsHeaders },
      );
    }

    const { action, fileName, rawText } = await req.json();
    if (action !== "parse_text" || !rawText) {
      return new Response(
        JSON.stringify({ error: "action: parse_text 와 rawText가 필요해요" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const admissionYear = extractYear(fileName);
    const { university, headerLines, dataChunks } = splitHeaderAndData(rawText);

    console.log(
      `대학: "${university}", 연도: ${admissionYear}, 청크: ${dataChunks.length}개`,
    );

    if (dataChunks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "데이터 행을 찾지 못했어요. PDF 구조를 확인해 주세요.",
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const allRows: ParsedRow[] = [];

    // 청크 순차 처리 + 청크 간 300ms 딜레이 (Rate limit 방어)
    for (let i = 0; i < dataChunks.length; i++) {
      const lineCount = dataChunks[i].split("\n").length;
      console.log(`청크 ${i + 1}/${dataChunks.length} 처리중 (${lineCount}줄)`);

      const rows = await callGPT(
        openaiKey,
        fileName,
        university,
        headerLines,
        dataChunks[i],
      );
      const cleaned = rows
        .map((r) => cleanRow(r, university, admissionYear))
        .filter((r) => r.university && r.department && r.admission_type);

      allRows.push(...cleaned);
      console.log(`청크 ${i + 1} 완료: ${cleaned.length}행`);

      // 청크 간 딜레이 (마지막 청크 제외)
      if (i < dataChunks.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    console.log(`최종 완료: ${allRows.length}행`);
    return new Response(
      JSON.stringify({ rows: allRows, total: allRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("parse-admission error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "알 수 없는 오류" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
