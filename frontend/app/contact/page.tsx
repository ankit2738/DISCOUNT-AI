"use client";

import { useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General enquiry");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiFetch<{ status: string; id: number; note: string }>("/api/contact", {
        method: "POST",
        body: { name, email, subject, message },
      });
      setResult(`Message #${response.id} ${response.status}. ${response.note}`);
      setName("");
      setEmail("");
      setMessage("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-12 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Contact us
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {result && <Alert><AlertDescription>{result}</AlertDescription></Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" required minLength={10} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} />
            </div>
            <Button type="submit" disabled={loading}>
              <Send className="mr-1 h-4 w-4" /> {loading ? "Sending..." : "Send message"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">What to expect</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" /> Messages are stored for review in the admin analytics feed.</p>
            <p>This is a demo deployment, so no external email delivery or response-time SLA is claimed.</p>
            <p>For a wrong price or expired coupon, use the community report flow after logging in.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Data note</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Do not send card numbers, passwords or other sensitive personal data through this form.
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
