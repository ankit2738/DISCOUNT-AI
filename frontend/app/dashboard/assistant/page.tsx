"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Brain, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { AIConversation, AIMessage, ChatResponse } from "@/lib/types";

type Message = { role: "user" | "assistant"; content: string; meta?: ChatResponse };

const SESSION_KEY = "discount_ai_copilot_session";
const SUGGESTIONS = [
  "Best phone under ₹30000 for battery life",
  "Compare a 55-inch TV under ₹45000",
  "Laptop for college under ₹60000",
  "Is the iPhone 15 at a good price now?",
];

function newSessionId() {
  return `web_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

export default function AssistantPage() {
  const { token } = useAuth();
  const [sessionId, setSessionId] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<string>("rule_based_fallback");
  const [usePersonalContext, setUsePersonalContext] = useState(true);
  const [personalContext, setPersonalContext] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!token) return [] as AIConversation[];
    const payload = await apiFetch<{ items: AIConversation[] }>("/api/ai/conversations", { token });
    setConversations(payload.items);
    return payload.items;
  }, [token]);

  const openConversation = useCallback(async (conversation: AIConversation) => {
    if (!token) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<{ id: number; session_id: string; title: string; messages: AIMessage[] }>(
        `/api/ai/conversations/${conversation.id}`,
        { token },
      );
      setConversationId(payload.id);
      setSessionId(payload.session_id);
      if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, payload.session_id);
      setMessages(payload.messages.map((item) => ({ role: item.role, content: item.content })));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Could not load conversation");
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    apiFetch<{ provider: string; external_configured: boolean; fallback: string; note: string }>("/api/ai/providers")
      .then((payload) => setProvider(payload.external_configured ? payload.provider : payload.fallback))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_KEY) : null;
    const sid = stored || newSessionId();
    setSessionId(sid);
    if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, sid);
    if (!token) return;
    let cancelled = false;
    loadConversations()
      .then((items) => {
        if (cancelled) return;
        const match = items.find((item) => item.session_id === sid);
        if (match) return openConversation(match);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, loadConversations, openConversation]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewConversation() {
    const sid = newSessionId();
    setSessionId(sid);
    setConversationId(null);
    setMessages([]);
    setPersonalContext(null);
    setError(null);
    if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, sid);
  }

  async function deleteConversation() {
    if (!token || conversationId === null) return;
    if (!window.confirm("Delete this saved conversation? This cannot be undone.")) return;
    setError(null);
    try {
      await apiFetch(`/api/ai/conversations/${conversationId}`, { method: "DELETE", token });
      await loadConversations();
      startNewConversation();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete conversation");
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    setMessage("");
    setError(null);
    setMessages((current) => [...current, { role: "user", content: text }]);
    setLoading(true);
    try {
      const response = await apiFetch<ChatResponse>("/api/ai/chat", {
        method: "POST",
        token,
        body: { message: text, session_id: sessionId, use_personal_context: usePersonalContext },
      });
      if (response.session_id) {
        setSessionId(response.session_id);
        if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, response.session_id);
      }
      if (response.conversation_id) setConversationId(response.conversation_id);
      if (response.personal_context) setPersonalContext(response.personal_context);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.reply,
          meta: response,
        },
      ]);
      if (token) await loadConversations();
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Copilot request failed");
    } finally {
      setLoading(false);
    }
  }

  const memoryCount = Array.isArray(personalContext?.memory) ? personalContext.memory.length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Bot className="h-6 w-6 text-primary" /> AI Copilot</h1>
          <p className="mt-1 text-sm text-muted-foreground">Grounded on catalogue records. Personal context is opt-in and every reply shows its limitations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={provider === "rule_based_fallback" ? "warning" : "success"}>Provider: {provider}</Badge>
          <Button variant="outline" onClick={startNewConversation}><Plus className="mr-1 h-4 w-4" /> New chat</Button>
        </div>
      </div>

      {token && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="text-xs font-medium">Saved conversations</span>
          <Select
            aria-label="Saved conversations"
            className="h-9 max-w-sm flex-1"
            value={conversationId ?? ""}
            onChange={(event) => {
              const selected = conversations.find((item) => item.id === Number(event.target.value));
              if (selected) void openConversation(selected);
            }}
          >
            <option value="">Current chat (not yet saved)</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title} · {new Date(conversation.updated_at).toLocaleDateString("en-IN")}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => void deleteConversation()} disabled={conversationId === null}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete saved chat
          </Button>
          {historyLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="text-[11px] text-muted-foreground">Session {sessionId ? sessionId.slice(-8) : "starting"} · stored on this account</span>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Ask about a purchase</CardTitle>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={usePersonalContext} onChange={(event) => setUsePersonalContext(event.target.checked)} />
              Use consented shopping memory
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {personalContext && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary"><Brain className="mr-1 h-3 w-3" /> {memoryCount} consented memories</Badge>
              {typeof personalContext.saved_products === "number" && <Badge variant="outline">{personalContext.saved_products} saved products</Badge>}
              {typeof personalContext.active_alerts === "number" && <Badge variant="outline">{personalContext.active_alerts} active alerts</Badge>}
              <Link href="/dashboard/memory" className="text-xs text-primary hover:underline">Manage memory</Link>
            </div>
          )}
          <div className="max-h-[55vh] min-h-64 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-primary/60" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask for a product recommendation within a budget. The Copilot cannot invent products or prices.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => setMessage(suggestion)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={item.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" : "mr-auto max-w-[90%] rounded-xl border bg-muted/40 px-4 py-3 text-sm"}>
                {item.role === "assistant" && <p className="mb-1 flex items-center gap-1 text-xs font-medium text-primary"><Bot className="h-3.5 w-3.5" /> Copilot</p>}
                <p className="whitespace-pre-wrap">{item.content}</p>
                {item.meta && (
                  <div className="mt-3 space-y-2">
                    {item.meta.recommendations?.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {item.meta.recommendations.map((recommendation) => (
                          <div key={`${recommendation.listing_id}-${recommendation.product_id}`} className="rounded-lg border bg-card p-3">
                            <p className="text-sm font-medium">{recommendation.name}</p>
                            <p className="text-xs text-muted-foreground">{recommendation.variant}</p>
                            <p className="mt-1 font-bold text-primary">{formatINR(recommendation.effective_price)}</p>
                            <p className="text-[11px] text-muted-foreground">{recommendation.coupon ? `Coupon ${recommendation.coupon}` : "No coupon applied"} · listing #{recommendation.listing_id}</p>
                            {recommendation.is_demo && <Badge variant="warning">Demo</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant={item.meta.grounded ? "success" : "warning"}>{item.meta.grounded ? "Grounded" : "Ungrounded"}</Badge>
                      <Badge variant="secondary">{item.meta.provider}</Badge>
                      {item.meta.detected_budget && <Badge variant="outline">Budget {formatINR(item.meta.detected_budget)}</Badge>}
                      {item.meta.detected_category && <Badge variant="outline">{item.meta.detected_category}</Badge>}
                      {item.meta.persistence_note && <span className="text-muted-foreground">{item.meta.persistence_note}</span>}
                    </div>
                    {item.meta.limitations?.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground">
                        {item.meta.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking with catalogue evidence...</p>}
            <div ref={endRef} />
          </div>

          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

          <form onSubmit={send} className="mt-4 flex gap-2">
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Describe what you need, budget and use case..." aria-label="Message the Copilot" />
            <Button type="submit" disabled={loading || !message.trim()}><Send className="mr-1 h-4 w-4" /> Send</Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The Copilot uses {provider} mode. Recommendations are informational, not a guarantee.{" "}
            {token ? "Chat history is saved until you delete it." : "Sign in to save history and use shopping memory."}{" "}
            <Link href="/how-it-works" className="text-primary hover:underline">How it works</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
