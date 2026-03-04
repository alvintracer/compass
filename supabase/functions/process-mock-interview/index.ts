// supabase/functions/process-mock-interview/index.ts
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
    const body = await req.json();
    const { action } = body;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    }

    // ── TTS ───────────────────────────────────────────────────────────────
    if (action === "tts") {
      const { text, voice } = body;
      // voice: 'onyx'(남성) | 'nova'(여성) — 기본값 onyx
      const selectedVoice = voice === "nova" ? "nova" : "onyx";

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: selectedVoice,
          input: text,
          speed: 0.95,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`TTS 에러: ${err.error?.message}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      const base64 = btoa(binary);

      return new Response(
        JSON.stringify({ audioBase64: base64, mimeType: "audio/mpeg" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── STT (Whisper) ─────────────────────────────────────────────────────
    if (action === "transcribe") {
      const { audioBase64, mimeType } = body;

      const binaryStr = atob(audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const formData = new FormData();
      formData.append(
        "file",
        new Blob([bytes], { type: mimeType || "audio/webm" }),
        "recording.webm",
      );
      formData.append("model", "whisper-1");
      formData.append("language", "ko");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
          body: formData,
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(`Whisper 에러: ${data.error?.message}`);

      return new Response(
        JSON.stringify({ text: data.text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("지원하지 않는 액션입니다.");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "알 수 없는 에러 발생";
    console.error("Mock Interview Function Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
