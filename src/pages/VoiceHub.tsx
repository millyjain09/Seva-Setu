import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Globe, AlertCircle, Send, Bot, User, Sparkles, Volume2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { speakText } from "@/lib/speak";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const LANGUAGES = [
  { code: "hi-IN", label: "हिन्दी", short: "HI" },
  { code: "en-IN", label: "English", short: "EN" },
  { code: "bn-IN", label: "বাংলা", short: "BN" },
  { code: "ta-IN", label: "தமிழ்", short: "TA" },
  { code: "te-IN", label: "తెలుగు", short: "TE" },
  { code: "mr-IN", label: "मराठी", short: "MR" },
  { code: "gu-IN", label: "ગુજરાતી", short: "GU" },
  { code: "kn-IN", label: "ಕನ್ನಡ", short: "KN" },
  { code: "ml-IN", label: "മലയാളം", short: "ML" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ", short: "PA" },
];

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speech-to-text`;

async function streamChat({
  messages,
  language,
  onDelta,
  onDone,
}: {
  messages: Msg[];
  language: string;
  onDelta: (t: string) => void;
  onDone: () => void;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Please sign in to use the AI assistant.");
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ messages, language }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  if (!resp.body) throw new Error("No response body");
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") {
        done = true;
        break;
      }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
  onDone();
}

const pickAudioMime = (): { mime: string; ext: string } => {
  const MR: any = (window as any).MediaRecorder;
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4;codecs=mp4a.40.2", ext: "mp4" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  if (MR?.isTypeSupported) {
    for (const c of candidates) if (MR.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
};

const VoiceHub = () => {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordMimeRef = useRef<{ mime: string; ext: string }>({ mime: "", ext: "webm" });
  const cancelRecordingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supported =
    typeof window !== "undefined" && !!(window as any).MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const showMicError = (title: string, description: string) => {
    toast({ title, description, variant: "destructive" });
  };

  const ensureMicPermission = async (): Promise<boolean> => {
    // Secure context check (getUserMedia needs HTTPS or localhost)
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      showMicError("Insecure connection", "Voice input requires a secure (https) connection.");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showMicError("Not supported", "Voice input is not supported in this browser. Please type your question.");
      return false;
    }
    return true;
  };

  const startListening = async () => {
    if (!supported) {
      showMicError("Not supported", "Voice input is not available in this browser. Please type your question instead.");
      return;
    }
    if (!(await ensureMicPermission())) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        showMicError("Permission denied", "Please allow microphone access to use voice input.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        showMicError("No microphone found", "No microphone was detected on this device.");
      } else if (name === "NotReadableError") {
        showMicError("Microphone busy", "Your microphone is being used by another app. Close it and try again.");
      } else {
        showMicError("Microphone error", err?.message || "Could not access the microphone.");
      }
      return;
    }
    const picked = pickAudioMime();
    recordMimeRef.current = picked;
    let recorder: MediaRecorder;
    try {
      recorder = picked.mime ? new MediaRecorder(stream, { mimeType: picked.mime }) : new MediaRecorder(stream);
    } catch (err: any) {
      stream.getTracks().forEach((t) => t.stop());
      showMicError("Recording not supported", err?.message || "Your browser cannot record audio.");
      return;
    }
    audioChunksRef.current = [];
    cancelRecordingRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsListening(false);
      if (cancelRecordingRef.current) return;
      const type = picked.mime || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type });
      audioChunksRef.current = [];
      if (blob.size < 2048) {
        showMicError("Recording too short", "Please hold the button and speak for at least a second.");
        return;
      }
      await transcribeAndSend(blob, picked.ext);
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      setIsListening(false);
      showMicError("Recording error", "Something went wrong while recording. Please try again.");
    };
    mediaStreamRef.current = stream;
    mediaRecorderRef.current = recorder;
    setTranscript("");
    try {
      recorder.start(); // no timeslice — one complete container blob at stop
      setIsListening(true);
    } catch (err: any) {
      stream.getTracks().forEach((t) => t.stop());
      setIsListening(false);
      showMicError("Could not start voice input", err?.message || "Please try again.");
    }
  };

  const stopListening = () => {
    const r = mediaRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const transcribeAndSend = async (blob: Blob, ext: string) => {
    setIsTranscribing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to use voice input.");
      const fd = new FormData();
      fd.append("file", blob, `recording.${ext}`);
      fd.append("language", lang);
      const resp = await fetch(STT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || "Transcription failed");
      }
      const { text } = await resp.json();
      const clean = String(text || "").trim();
      if (!clean) {
        showMicError("No speech detected", "We could not hear you clearly. Please try again.");
        return;
      }
      setTranscript(clean);
      sendMessage(clean);
    } catch (e: any) {
      showMicError("Transcription failed", e?.message || "Please try again or type your question.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendMessage = async (text: string) => {
    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setTranscript("");
    setTextInput("");
    setIsStreaming(true);
    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant")
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };
    try {
      await streamChat({ messages: newMessages, language: lang, onDelta: upsert, onDone: () => setIsStreaming(false) });
    } catch (e: any) {
      setIsStreaming(false);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const speakAssistantMessage = async (content: string, index: number) => {
    try {
      setSpeakingIndex(index);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in to use voice playback.");
      await speakText(content, lang, {
        preferServer: true,
        fallbackToBrowser: false,
        authToken: token,
        apiKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        endpoint: TTS_URL,
        voice: "nova",
      });
    } catch (e: any) {
      toast({
        title: "Voice playback failed",
        description: e?.message || "Could not read the message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSpeakingIndex(null);
    }
  };

  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    return () => {
      cancelRecordingRef.current = true;
      try {
        mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
      } catch {}
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-5.5rem)] md:h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between border-b border-border/50 bg-card/50 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-foreground truncate">{t("header.aiAssistant")}</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{t("voice.headerSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Globe className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger className="w-24 sm:w-36 h-8 sm:h-9 text-xs sm:text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code} className="text-sm">
                  <span className="font-semibold mr-1.5">{l.short}</span> {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!supported && (
        <div className="flex items-center gap-2 text-xs text-destructive px-3 sm:px-4 py-2 bg-destructive/5 border-b border-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium">{t("voice.notSupported")}</span>
        </div>
      )}

      {/* Chat messages */}
      <ScrollArea className="flex-1 bg-background/50">
        <div className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 max-w-2xl mx-auto">
          {messages.length === 0 && !isListening && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-10 sm:py-16 space-y-4 sm:space-y-5"
            >
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto shadow-lg shadow-primary/10">
                <Mic className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="font-bold text-foreground text-lg sm:text-xl">{t("voice.title")}</p>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto px-4">{t("voice.subtitle")}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm mx-auto px-2">
                {["What is diabetes?", "Home remedies for cold", "BP normal range"].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-[11px] sm:text-xs bg-card border border-border rounded-full px-3 py-1.5 sm:px-3.5 sm:py-2 text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          <AnimatePresence>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-2 sm:gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-1 max-w-[85%] sm:max-w-[80%]">
                  <div
                    className={`rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      m.role === "user"
                        ? "px-3 py-2.5 sm:px-4 sm:py-3 bg-primary text-primary-foreground rounded-br-md shadow-md shadow-primary/20 whitespace-pre-wrap"
                        : "px-4 py-3.5 sm:px-5 sm:py-4 bg-card border border-border text-foreground rounded-bl-md shadow-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none leading-[1.7]
                        prose-p:my-3 prose-p:leading-[1.7]
                        prose-ul:my-3 prose-ul:pl-5 prose-ul:space-y-1.5
                        prose-ol:my-3 prose-ol:pl-5 prose-ol:space-y-1.5
                        prose-li:my-0 prose-li:leading-[1.65] prose-li:marker:text-primary
                        prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold prose-headings:text-foreground
                        prose-h1:text-base prose-h2:text-[15px] prose-h3:text-[14px]
                        prose-strong:text-foreground prose-strong:font-semibold
                        prose-a:text-primary
                        prose-hr:my-4
                        prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "assistant" && !isStreaming && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => speakAssistantMessage(m.content, i)}
                      disabled={speakingIndex !== null}
                      className="self-start flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-primary/5 transition-all disabled:opacity-60"
                    >
                      <Volume2 className={`h-3 w-3 ${speakingIndex === i ? "animate-pulse" : ""}`} />{" "}
                      {t("voice.listen")}
                    </motion.button>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-br from-secondary to-secondary/70 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-secondary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-2 sm:gap-3">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary-foreground" />
              </div>
              <div className="rounded-2xl bg-card border border-border px-4 py-3 flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span
                  className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Live transcript */}
      <AnimatePresence>
        {isListening && transcript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 sm:px-4 py-2 bg-primary/5 border-t border-primary/10 text-center"
          >
            <p className="text-xs sm:text-sm text-foreground italic">"{transcript}"</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waveform */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center gap-0.5 py-3 sm:py-4 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5"
          >
            {Array.from({ length: 24 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-0.5 rounded-full bg-primary"
                animate={{ height: [4, Math.random() * 28 + 6, 4] }}
                transition={{
                  duration: 0.5 + Math.random() * 0.3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.03,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t border-border/50 bg-card p-2.5 sm:p-3 md:p-4">
        <div className="flex items-center gap-2 sm:gap-3 max-w-2xl mx-auto">
          <div className="relative">
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-xl bg-destructive/30 animate-ping" />
                <span className="absolute inset-0 rounded-xl bg-destructive/20 animate-ripple" />
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => (isListening ? stopListening() : startListening())}
              disabled={isStreaming || isTranscribing}
              className={`relative shrink-0 h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-50 z-10 ${
                isListening
                  ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
            </motion.button>
          </div>
          <form
            className="flex-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (textInput.trim() && !isStreaming) sendMessage(textInput.trim());
            }}
          >
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={t("voice.placeholder")}
              disabled={isStreaming}
              className="flex-1 min-w-0 rounded-xl border border-border bg-background px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="submit"
              disabled={isStreaming || !textInput.trim()}
              className="shrink-0 h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-md shadow-primary/20"
            >
              <Send className="h-4 w-4" />
            </motion.button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VoiceHub;
