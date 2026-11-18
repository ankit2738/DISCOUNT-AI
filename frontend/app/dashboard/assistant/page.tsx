"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/format";
import type { ChatResponse } from "@/lib/types";

type Message = { role: "user" | "assistant"; content: string; meta?: ChatResponse };

const SUGGESTIONS = [
  "Best phone under ₹30000 for battery life",
  "Compare a 55-inch TV under ₹45000",
  "Laptop for college under ₹60000",
  "Is the iPhone 15 at a good price now?",
];

export default function AssistantPage() {
  const { token } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [provider, setProvider] = useState<string>("rule_based_fallback");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ provider: string; external_configured: boolean; fallback: string; note: string }>("/api/ai/providers")
      .then((payload) => setProvider(payload.external_configured ? payload.provider : payload.fallback))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: { message: text, session_id: `web_${Date.now()}` },
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.reply,
          meta: response,
        },
      ]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Copilot request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Bot className="h-6 w-6 text-primary" /> AI Copilot</h1>
          <p className="mt-1 text-sm text-muted-foreground">Grounded on catalogue records. Recommendations and limitations are shown with every reply.</p>
        </div>
        <Badge variant={provider === "rule_based_fallback" ? "warning" : "success"}>Provider: {provider}</Badge>
      </div>

      <Card className="mt-5">
        <CardHeader className="pb-2"><CardTitle className="text-base">Ask about a purchase</CardTitle></CardHeader>
        <CardContent>
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
              <div key={index} className={item.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground" : "mr-auto max-w-[90%] rounded-xl border bg-muted/40 px-4 py-3 text-sm"}>
                {item.role === "assistant" && <p className="mb-1 flex items-center gap-1 text-xs font-medium text-primary"><Bot className="h-3.5 w-3.5" /> Copilot</p>}
                <p className="whitespace-pre-wrap">{item.content}</p>
                {item.meta && (
                  <div className="mt-3 space-y-2">
                    {item.meta.recommendations.length > 0 && (
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
                    </div>
                    {item.meta.limitations.length > 0 && (
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
            The Copilot uses {provider} mode. Recommendations are informational, not a guarantee. <Link href="/how-it-works" className="text-primary hover:underline">How it works</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
