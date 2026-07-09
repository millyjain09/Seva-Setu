// Speech synthesis helpers extracted for testability.
// Emits console warnings when we chunk a long response or fall back to a
// non-matching voice — the test harness spies on these to detect regressions.

export const loadVoices = (): Promise<SpeechSynthesisVoice[]> =>
  new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing && existing.length) return resolve(existing);
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices() || []);
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 1200);
  });

export type VoiceMatch = {
  voice?: SpeechSynthesisVoice;
  /** "exact" (hi-IN==hi-IN), "region" (hi-* for hi-IN), "base" (hi==hi-IN), or "none" */
  quality: "exact" | "region" | "base" | "none";
};

export const pickVoice = (voices: SpeechSynthesisVoice[], language: string): VoiceMatch => {
  if (!voices.length) return { quality: "none" };
  const lower = language.toLowerCase();
  const base = lower.split("-")[0];
  let v = voices.find((x) => x.lang.toLowerCase() === lower);
  if (v) return { voice: v, quality: "exact" };
  v = voices.find((x) => x.lang.toLowerCase().startsWith(base + "-"));
  if (v) return { voice: v, quality: "region" };
  v = voices.find((x) => x.lang.toLowerCase() === base);
  if (v) return { voice: v, quality: "base" };
  return { quality: "none" };
};

export const chunkText = (text: string, max = 180): string[] => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?。！？|।])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).trim().length <= max) {
      buf = (buf ? buf + " " : "") + p;
    } else {
      if (buf) chunks.push(buf);
      if (p.length <= max) {
        buf = p;
      } else {
        const words = p.split(" ");
        let sub = "";
        for (const w of words) {
          if ((sub + " " + w).trim().length > max) {
            if (sub) chunks.push(sub);
            sub = w;
          } else {
            sub = (sub ? sub + " " : "") + w;
          }
        }
        buf = sub;
      }
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
};

export type SpeakResult = {
  spoken: boolean;
  chunks: string[];
  totalChars: number;
  chosenLang: string;
  voiceName?: string;
  voiceQuality: VoiceMatch["quality"];
  truncated: boolean;
  fallback: boolean;
  method: "gateway" | "browser" | "none";
};

export type SpeakOptions = {
  preferServer?: boolean;
  fallbackToBrowser?: boolean;
  authToken?: string;
  endpoint?: string;
  apiKey?: string;
  voice?: "nova" | "shimmer" | "alloy";
};

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;

export const stopSpeaking = () => {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
};

// Strip common markdown syntax so TTS doesn't read "asterisk asterisk" etc.
export const stripMarkdown = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, " ")            // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")                 // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")       // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")     // links -> text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")          // headings
    .replace(/^\s*[-*+]\s+/gm, "")               // bullet markers
    .replace(/^\s*\d+\.\s+/gm, "")               // ordered list markers
    .replace(/^\s*>\s?/gm, "")                   // blockquotes
    .replace(/(\*\*|__)(.*?)\1/g, "$2")          // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")             // italic
    .replace(/~~(.*?)~~/g, "$1")                 // strikethrough
    .replace(/\|/g, " ")                          // table pipes
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const playBlob = async (blob: Blob) => {
  stopSpeaking();
  const url = URL.createObjectURL(blob);
  activeAudioUrl = url;
  const audio = new Audio(url);
  activeAudio = audio;

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed."));
    audio.play().catch(reject);
  });

  if (activeAudio === audio) activeAudio = null;
  if (activeAudioUrl === url) {
    URL.revokeObjectURL(url);
    activeAudioUrl = null;
  }
};

const speakWithGateway = async (
  text: string,
  language: string,
  options: SpeakOptions,
): Promise<SpeakResult> => {
  const endpoint = options.endpoint;
  if (!endpoint || !options.authToken || !options.apiKey) {
    throw new Error("Secure voice playback is not configured.");
  }

  const chunks = chunkText(stripMarkdown(text), 900);
  const result: SpeakResult = {
    spoken: chunks.length > 0,
    chunks,
    totalChars: chunks.reduce((n, c) => n + c.length, 0),
    chosenLang: language,
    voiceQuality: "exact",
    voiceName: options.voice || "nova",
    truncated: chunks.length > 1,
    fallback: false,
    method: "gateway",
  };

  if (chunks.length > 1) {
    console.warn(`[speakText] response sent to multilingual TTS in ${chunks.length} safe chunks`);
  }

  for (const chunk of chunks) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.authToken}`,
        apikey: options.apiKey,
      },
      body: JSON.stringify({ text: chunk, language, voice: options.voice || "nova" }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(details || `Voice playback failed (${response.status}).`);
    }

    await playBlob(await response.blob());
  }

  return result;
};

const speakWithBrowser = async (text: string, language: string): Promise<SpeakResult> => {
  const result: SpeakResult = {
    spoken: false,
    chunks: [],
    totalChars: 0,
    chosenLang: language,
    voiceQuality: "none",
    truncated: false,
    fallback: false,
    method: "none",
  };
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return result;
  const synth = window.speechSynthesis;
  synth.cancel();
  result.method = "browser";

  const voices = await loadVoices();
  const match = pickVoice(voices, language);
  result.voiceQuality = match.quality;
  result.voiceName = match.voice?.name;
  result.chosenLang = match.voice?.lang || language;

  if (match.quality !== "exact") {
    result.fallback = true;
    // Log so the test flow (and devs in the console) can see any voice fallback.
    console.warn(
      `[speakText] voice fallback for "${language}": using ${match.voice ? `${match.voice.name} (${match.voice.lang}, ${match.quality})` : "OS default"}`
    );
  }

  const chunks = chunkText(stripMarkdown(text));
  result.chunks = chunks;
  result.totalChars = chunks.reduce((n, c) => n + c.length, 0);
  if (chunks.length > 1) {
    result.truncated = true;
    console.warn(`[speakText] response chunked into ${chunks.length} pieces to avoid browser truncation`);
  }

  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = result.chosenLang;
    if (match.voice) u.voice = match.voice;
    u.rate = 0.95;
    u.pitch = 1;
    synth.speak(u);
  }
  result.spoken = chunks.length > 0;
  return result;
};

export const speakText = async (
  text: string,
  language: string,
  options: SpeakOptions = {},
): Promise<SpeakResult> => {
  if (options.preferServer) {
    try {
      return await speakWithGateway(text, language, options);
    } catch (err) {
      if (options.fallbackToBrowser === false) throw err;
      console.warn(`[speakText] multilingual TTS fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return speakWithBrowser(text, language);
};