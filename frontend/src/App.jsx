import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DEFAULT_NAME = "Atiq";

const newConvo = () => ({ id: crypto.randomUUID(), title: "New conversation", messages: [] });

const makeStickers = (n) => [
  { t: `Tell me about ${n}`, c: "bg-sun text-[#1b1f3b]", r: "-rotate-2" },
  { t: "What are the main skills?", c: "bg-violet text-white", r: "rotate-1" },
  { t: "Explain the main projects", c: "bg-mint text-[#1b1f3b]", r: "rotate-2" },
  { t: "What experience is there?", c: "bg-card border border-line", r: "-rotate-1" },
];

const TOOLS = [
  { key: "upload", label: "Upload a resume" },
  { key: "interview", label: "Interview questions" },
  { key: "match", label: "Job match score" },
  { key: "why", label: "Why hire this person?" },
  { key: "export", label: "Save chat as PDF" },
  { key: "resume", label: "Open resume" },
];

function Orb({ name, size = "h-10 w-10", busy = false }) {
  return (
    <div
      className={`${size} ${busy ? "thinking" : ""} flex shrink-0 items-center justify-center rounded-full bg-violet font-display font-extrabold text-white transition-transform ${busy ? "scale-110" : ""}`}
    >
      {name[0].toUpperCase()}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  const [convos, setConvos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("convos"));
      if (saved?.length) return saved;
    } catch { }
    return [newConvo()];
  });
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("profile")); } catch { return null; }
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef(null);
  const NAME = profile ? profile.name?.split(" ")[0] || "Candidate" : DEFAULT_NAME;

  useEffect(() => {
    if (profile) localStorage.setItem("profile", JSON.stringify(profile));
    else localStorage.removeItem("profile");
  }, [profile]);
  const [activeId, setActiveId] = useState(() => convos[0].id);
  const [input, setInput] = useState("");
  const [jd, setJd] = useState("");
  const [jdDraft, setJdDraft] = useState("");
  const [showJd, setShowJd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const bottomRef = useRef(null);

  const active = convos.find((c) => c.id === activeId) ?? convos[0];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("convos", JSON.stringify(convos));
  }, [convos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active.messages]);

  function appendToLast(id, text) {
    setConvos((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c;
        const m = [...c.messages];
        m[m.length - 1] = { ...m[m.length - 1], content: m[m.length - 1].content + text };
        return { ...c, messages: m };
      })
    );
  }

  async function send(text, jdValue = jd) {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    const id = active.id;
    const history = active.messages;

    setConvos((cs) =>
      cs.map((c) =>
        c.id === id
          ? {
            ...c,
            title: c.messages.length ? c.title : question.slice(0, 30),
            messages: [...c.messages, { role: "user", content: question }, { role: "assistant", content: "" }],
          }
          : c
      )
    );
    setInput("");
    setLoading(true);

    try {
      const useJd = jdValue.trim().length > 0;
      const res = await fetch(`${API}${useJd ? "/match" : "/chat"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history,
          ...(profile && { profile }),
          ...(useJd && { job_description: jdValue }),
        }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLast(id, decoder.decode(value, { stream: true }));
      }
    } catch {
      appendToLast(id, "Could not reach the server. Check that the backend is running, then try again.");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    const c = newConvo();
    setConvos((cs) => [c, ...cs]);
    setActiveId(c.id);
    setDrawer(false);
  }

  function clearChat() {
    setConvos((cs) => cs.map((c) => (c.id === active.id ? { ...c, title: "New conversation", messages: [] } : c)));
  }

  async function uploadResume(file) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setProfile(data);
      newChat(); // fresh conversation so the old person's history doesn't leak in
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function deleteConvo(id) {
    setConvos((cs) => {
      const rest = cs.filter((c) => c.id !== id);
      if (!rest.length) {
        const c = newConvo();
        setActiveId(c.id);
        return [c];
      }
      if (id === activeId) setActiveId(rest[0].id);
      return rest;
    });
  }

  function useTool(key) {
    if (key === "upload") fileRef.current?.click();
    if (key === "interview") send("Suggest 5 interview questions I should ask this candidate, based on their profile.");
    if (key === "why") send("Why should we hire this candidate? Give the strongest reasons from their profile.");
    if (key === "match") {
      setJdDraft(jd);
      setShowJd(true);
    }
    if (key === "export") window.print();
    if (key === "resume") window.open("/resume.pdf", "_blank");
  }

  function submitJd() {
    setJd(jdDraft);
    setShowJd(false);
    if (jdDraft.trim())
      send("Give a job match score out of 100, then list strengths, missing skills, and an interview recommendation.", jdDraft);
  }

  const lastIdx = active.messages.length - 1;

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <input ref={fileRef} type="file" accept=".pdf" hidden onChange={(e) => uploadResume(e.target.files[0])} />
      {/* ---------- Header ---------- */}
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 print:hidden">
        <Orb name={NAME} busy={loading} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-extrabold leading-tight">{NAME}'s AI twin</h1>
          <p className="flex items-center gap-1.5 text-xs opacity-60">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Answers only from {NAME}'s resume
          </p>
        </div>
        {jd && (
          <button
            onClick={() => setJd("")}
            className="hidden rounded-full bg-sun px-3 py-1 text-xs font-bold text-[#1b1f3b] sm:block"
          >
            Job description on ✕
          </button>
        )}
        <button onClick={() => setDrawer(true)} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:border-violet">
          History
        </button>
        {active.messages.length > 0 && (
          <button onClick={clearChat} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:border-violet">
            Clear
          </button>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-card text-lg hover:border-violet"
        >
          <span key={theme} className="rise inline-block">{theme === "dark" ? "☀" : "☾"}</span>
        </button>
      </header>

      {/* ---------- Conversation ---------- */}
      <main className="flex-1 overflow-y-auto">
        {active.messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-6 py-10">
            <h2 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
              Ask me anything about {NAME}.
            </h2>
            <p className="mt-5 max-w-md text-base opacity-70">
              I'm {NAME}'s AI twin. I know the projects, skills and experience on this resume, and I won't make things up.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {makeStickers(NAME).map((s, i) => (
                <button
                  key={s.t}
                  onClick={() => send(s.t)}
                  style={{ animationDelay: `${i * 90}ms` }}
                  className={`drop ${s.c} ${s.r} rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-md transition hover:-translate-y-1 hover:rotate-0 active:scale-95`}
                >
                  {s.t}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {active.messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="rise flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-paper">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="rise group flex items-start gap-3">
                  <Orb name={NAME} size="h-8 w-8 text-sm" busy={loading && i === lastIdx} />
                  <div className="relative min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-line bg-card px-4 py-3 text-sm">
                    {m.content ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mb-2 prose-headings:mt-4 prose-p:my-2 prose-li:my-0.5">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: (props) => (
                              <div className="overflow-x-auto">
                                <table {...props} />
                              </div>
                            ),
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="flex gap-1 py-1">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="dot h-2 w-2 rounded-full bg-violet" style={{ animationDelay: `${d * 160}ms` }} />
                        ))}
                      </span>
                    )}
                    {m.content && (
                      <button
                        onClick={() => navigator.clipboard.writeText(m.content)}
                        className="absolute -bottom-5 left-1 text-[11px] opacity-0 hover:text-violet group-hover:opacity-60 print:hidden"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* ---------- Tools + input ---------- */}
      <footer className="px-4 pb-4 pt-2 print:hidden">
        <div className="mx-auto max-w-3xl">
          {uploadError && <p className="mb-2 text-xs text-red-500">{uploadError}</p>}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {TOOLS.filter((t) => !(profile && t.key === "resume")).map((t) => (
              <button
                key={t.key}
                onClick={() => useTool(t.key)}
                disabled={t.key === "upload" && uploading}
                className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5 hover:border-violet hover:text-violet disabled:opacity-50"
              >
                {t.key === "upload" && uploading ? "Reading resume..." : t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-card py-1.5 pl-5 pr-1.5 shadow-lg transition focus-within:border-violet">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={`Ask about ${NAME}...`}
              className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex h-10 items-center rounded-full bg-violet px-5 text-sm font-bold text-white transition hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-30"
            >
              Send
            </button>
          </div>
        </div>
      </footer>

      {/* ---------- History drawer ---------- */}
      <div
        onClick={() => setDrawer(false)}
        className={`fixed inset-0 z-20 bg-black/40 transition-opacity print:hidden ${drawer ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-card p-4 transition-transform duration-300 print:hidden ${drawer ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button onClick={newChat} className="rounded-xl bg-violet py-2.5 text-sm font-bold text-white transition hover:opacity-90 active:scale-95">
          + New chat
        </button>
        <p className="mb-2 mt-6 font-display text-sm font-extrabold">Past conversations</p>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {convos.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                setActiveId(c.id);
                setDrawer(false);
              }}
              className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm ${c.id === active.id ? "bg-violet/15 font-medium" : "hover:bg-violet/10"}`}
            >
              <span className="truncate">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConvo(c.id);
                }}
                className="ml-2 opacity-0 hover:text-violet group-hover:opacity-70"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>
      {profile && (
        <button
          onClick={() => { setProfile(null); newChat(); }}
          className="hidden rounded-full border border-violet px-3 py-1 text-xs font-bold text-violet sm:block"
        >
          Back to {DEFAULT_NAME} ✕
        </button>
      )}

      {/* ---------- Job description modal ---------- */}
      {showJd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="rise w-full max-w-lg rounded-2xl border border-line bg-card p-5 shadow-xl">
            <h3 className="font-display text-xl font-extrabold">Job match score</h3>
            <p className="mt-1 text-sm opacity-70">Paste the job description and I'll compare it with {NAME}'s profile.</p>
            <textarea
              value={jdDraft}
              onChange={(e) => setJdDraft(e.target.value)}
              rows={10}
              placeholder="Paste job description here..."
              className="mt-3 w-full resize-none rounded-xl border border-line bg-paper p-3 text-sm outline-none focus:border-violet"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowJd(false)} className="rounded-lg px-4 py-2 text-sm hover:bg-violet/10">
                Cancel
              </button>
              <button onClick={submitJd} className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                Get match score
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
