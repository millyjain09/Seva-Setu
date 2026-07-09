import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chunkText, pickVoice, speakText } from "./speak";

type FakeVoice = { name: string; lang: string };

const setupSynth = (voices: FakeVoice[]) => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synth = {
    getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    cancel: vi.fn(),
    speak: vi.fn((u: SpeechSynthesisUtterance) => spoken.push(u)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (window as any).speechSynthesis = synth;
  (window as any).SpeechSynthesisUtterance = class {
    text: string;
    lang = "";
    voice: any = null;
    rate = 1;
    pitch = 1;
    constructor(text: string) {
      this.text = text;
    }
  };
  return { synth, spoken };
};

describe("pickVoice", () => {
  it("prefers exact BCP-47 match over regional/base", () => {
    const voices = [
      { name: "A", lang: "hi-IN" },
      { name: "B", lang: "hi" },
      { name: "C", lang: "en-US" },
    ] as any;
    expect(pickVoice(voices, "hi-IN")).toEqual({ voice: voices[0], quality: "exact" });
  });

  it("falls back to region, then base, then none", () => {
    expect(pickVoice([{ name: "A", lang: "hi-LATN" }] as any, "hi-IN").quality).toBe("region");
    expect(pickVoice([{ name: "A", lang: "hi" }] as any, "hi-IN").quality).toBe("base");
    expect(pickVoice([{ name: "A", lang: "en-US" }] as any, "hi-IN").quality).toBe("none");
  });
});

describe("chunkText", () => {
  it("returns [] for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("keeps a short response as a single chunk", () => {
    expect(chunkText("Drink water and rest.")).toEqual(["Drink water and rest."]);
  });

  it("splits long Devanagari text into multiple chunks under the cap", () => {
    const sentence = "यह एक बहुत लंबा उत्तर है जिसमें कई वाक्य हैं। ";
    const long = sentence.repeat(12);
    const chunks = chunkText(long, 180);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(180);
    // Nothing dropped: joined chunks contain every original character (whitespace-normalized).
    const rejoined = chunks.join(" ").replace(/\s+/g, " ").trim();
    const original = long.replace(/\s+/g, " ").trim();
    expect(rejoined).toBe(original);
  });
});

describe("speakText (Listen flow)", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => warn.mockClear());
  afterEach(() => {
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
  });

  it("reads the full Hindi response using a Hindi voice and logs no fallback", async () => {
    const { spoken } = setupSynth([
      { name: "Google हिन्दी", lang: "hi-IN" },
      { name: "English US", lang: "en-US" },
    ]);
    const text = "नमस्ते! कृपया पानी पिएँ और आराम करें।";
    const result = await speakText(text, "hi-IN");

    expect(result.spoken).toBe(true);
    expect(result.voiceQuality).toBe("exact");
    expect(result.chosenLang).toBe("hi-IN");
    expect(result.fallback).toBe(false);
    expect(result.method).toBe("browser");
    // Every utterance is tagged hi-IN — so nothing falls back to en-US.
    expect(spoken.length).toBe(result.chunks.length);
    for (const u of spoken) {
      expect(u.lang).toBe("hi-IN");
      expect((u.voice as any).lang).toBe("hi-IN");
    }
    // Full text preserved across chunks.
    expect(spoken.map((u) => u.text).join(" ").replace(/\s+/g, " ").trim()).toBe(text);
    expect(warn).not.toHaveBeenCalled();
  });

  it("chunks a long Tamil response and logs a truncation warning", async () => {
    const { spoken } = setupSynth([{ name: "Tamil", lang: "ta-IN" }]);
    const long = "தயவுசெய்து தண்ணீர் குடிக்கவும் மற்றும் ஓய்வு எடுக்கவும். ".repeat(15);
    const result = await speakText(long, "ta-IN");

    expect(result.truncated).toBe(true);
    expect(result.method).toBe("browser");
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(spoken.length).toBe(result.chunks.length);
    for (const u of spoken) expect(u.lang).toBe("ta-IN");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[speakText] response chunked")
    );
  });

  it("logs a voice fallback when no matching voice is installed but still tags the selected language", async () => {
    const { spoken } = setupSynth([{ name: "English US", lang: "en-US" }]);
    const result = await speakText("வணக்கம்!", "ta-IN");

    expect(result.fallback).toBe(true);
    expect(result.voiceQuality).toBe("none");
    // Even without a Tamil voice, utterance.lang is forced to ta-IN so the OS
    // engine picks the closest voice instead of skipping non-Latin characters.
    expect(spoken[0].lang).toBe("ta-IN");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[speakText] voice fallback for "ta-IN"')
    );
  });
});