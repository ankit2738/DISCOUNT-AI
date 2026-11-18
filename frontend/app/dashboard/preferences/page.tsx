"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Lock, Save, Settings, ShieldCheck, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, TOKEN_KEY } from "@/lib/api";

type PreferenceState = {
  preferred_brands: string;
  categories: string;
  preferred_retailers: string;
  budget_min: string;
  budget_max: string;
  personalization_enabled: boolean;
  notify_in_app: boolean;
  notify_email: boolean;
  notify_push: boolean;
  notify_telegram: boolean;
  notify_whatsapp: boolean;
  consent_analytics: boolean;
  consent_marketing: boolean;
  telegram_chat_id: string;
  whatsapp_number: string;
};

const DEFAULT_PREFS: PreferenceState = {
  preferred_brands: "",
  categories: "",
  preferred_retailers: "",
  budget_min: "",
  budget_max: "",
  personalization_enabled: false,
  notify_in_app: true,
  notify_email: false,
  notify_push: false,
  notify_telegram: false,
  notify_whatsapp: false,
  consent_analytics: false,
  consent_marketing: false,
  telegram_chat_id: "",
  whatsapp_number: "",
};

export default function PreferencesPage() {
  const { user, token, refresh, logout } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [persona, setPersona] = useState("");
  const [prefs, setPrefs] = useState<PreferenceState>(DEFAULT_PREFS);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDanger, setShowDanger] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setPhone(user.phone ?? "");
    setCity(user.profile.city ?? "");
    setState(user.profile.state ?? "");
    setPincode(user.profile.pincode ?? "");
    setPersona(user.profile.shopping_persona ?? "");
    setPrefs({
      ...DEFAULT_PREFS,
      preferred_brands: user.preferences.preferred_brands.join(", "),
      categories: user.preferences.categories.join(", "),
      preferred_retailers: user.preferences.preferred_retailers.join(", "),
      budget_min: user.preferences.budget_min?.toString() ?? "",
      budget_max: user.preferences.budget_max?.toString() ?? "",
      personalization_enabled: user.preferences.personalization_enabled,
      notify_in_app: user.preferences.notify_in_app,
      notify_email: user.preferences.notify_email,
      notify_push: user.preferences.notify_push,
      notify_telegram: user.preferences.notify_telegram,
      notify_whatsapp: user.preferences.notify_whatsapp,
      consent_analytics: user.preferences.consent_analytics,
      consent_marketing: user.preferences.consent_marketing,
      telegram_chat_id: "",
      whatsapp_number: "",
    });
  }, [user]);

  function toggle(field: keyof PreferenceState) {
    setPrefs((current) => ({ ...current, [field]: !current[field] }));
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/auth/profile", {
        method: "PUT",
        token,
        body: {
          full_name: fullName,
          phone,
          city,
          state,
          pincode,
          shopping_persona: persona,
        },
      });
      await refresh();
      setMessage("Profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save profile");
    }
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/auth/preferences", {
        method: "PUT",
        token,
        body: {
          preferred_brands: prefs.preferred_brands.split(",").map((item) => item.trim()).filter(Boolean),
          categories: prefs.categories.split(",").map((item) => item.trim()).filter(Boolean),
          preferred_retailers: prefs.preferred_retailers.split(",").map((item) => item.trim()).filter(Boolean),
          budget_min: prefs.budget_min ? Number(prefs.budget_min) : null,
          budget_max: prefs.budget_max ? Number(prefs.budget_max) : null,
          personalization_enabled: prefs.personalization_enabled,
          notify_in_app: prefs.notify_in_app,
          notify_email: prefs.notify_email,
          notify_push: prefs.notify_push,
          notify_telegram: prefs.notify_telegram,
          notify_whatsapp: prefs.notify_whatsapp,
          consent_analytics: prefs.consent_analytics,
          consent_marketing: prefs.consent_marketing,
          telegram_chat_id: prefs.telegram_chat_id || null,
          whatsapp_number: prefs.whatsapp_number || null,
        },
      });
      await refresh();
      setMessage("Preferences updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save preferences");
    }
  }

  async function exportData() {
    if (!token) return;
    try {
      const response = await fetch("/api/privacy/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "discount-ai-privacy-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Privacy export downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export data");
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        token,
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed.");
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : "Could not change password");
    }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/auth/account", {
        method: "DELETE",
        token,
        body: { password: deletePassword },
      });
      localStorage.removeItem(TOKEN_KEY);
      logout();
      setMessage("Account deleted. You have been logged out.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete account");
    }
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Settings className="h-6 w-6 text-primary" /> Preferences & privacy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Control profile data, personalisation, notification consent and account deletion.</p>

      {message && <Alert className="mt-4" variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="full-name">Full name</Label><Input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" value={user?.email ?? ""} disabled /><p className="text-xs text-muted-foreground">Email changes require a verification flow not enabled in demo mode.</p></div>
              <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="city">City</Label><Input id="city" value={city} onChange={(event) => setCity(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="state">State</Label><Input id="state" value={state} onChange={(event) => setState(event.target.value)} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="pincode">Pincode</Label><Input id="pincode" maxLength={10} value={pincode} onChange={(event) => setPincode(event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="persona">Shopping persona</Label><Input id="persona" value={persona} onChange={(event) => setPersona(event.target.value)} placeholder="e.g. value seeker" /></div>
              </div>
              <Button type="submit"><Save className="mr-1 h-4 w-4" /> Save profile</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Personalisation & notifications</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={savePreferences} className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="brands">Preferred brands (comma separated)</Label><Input id="brands" value={prefs.preferred_brands} onChange={(event) => setPrefs({ ...prefs, preferred_brands: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="categories">Categories</Label><Input id="categories" value={prefs.categories} onChange={(event) => setPrefs({ ...prefs, categories: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="retailers">Retailers</Label><Input id="retailers" value={prefs.preferred_retailers} onChange={(event) => setPrefs({ ...prefs, preferred_retailers: event.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="budget-min">Budget min</Label><Input id="budget-min" type="number" value={prefs.budget_min} onChange={(event) => setPrefs({ ...prefs, budget_min: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="budget-max">Budget max</Label><Input id="budget-max" type="number" value={prefs.budget_max} onChange={(event) => setPrefs({ ...prefs, budget_max: event.target.value })} /></div>
              </div>

              <div className="space-y-2">
                {[
                  ["personalization_enabled", "Enable personalised recommendations"],
                  ["notify_in_app", "In-app notifications (configured)"],
                  ["notify_email", "Email notifications (provider required)"],
                  ["notify_push", "Browser push (VAPID required)"],
                  ["notify_telegram", "Telegram notifications"],
                  ["notify_whatsapp", "WhatsApp notifications"],
                  ["consent_analytics", "Analytics consent"],
                  ["consent_marketing", "Marketing consent"],
                ].map(([field, label]) => (
                  <label key={field} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={Boolean(prefs[field as keyof PreferenceState])} onChange={() => toggle(field as keyof PreferenceState)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="telegram">Telegram chat ID</Label><Input id="telegram" value={prefs.telegram_chat_id} onChange={(event) => setPrefs({ ...prefs, telegram_chat_id: event.target.value })} placeholder="Optional" /></div>
                <div className="space-y-1.5"><Label htmlFor="whatsapp">WhatsApp number</Label><Input id="whatsapp" value={prefs.whatsapp_number} onChange={(event) => setPrefs({ ...prefs, whatsapp_number: event.target.value })} placeholder="Optional" /></div>
              </div>
              <p className="text-xs text-muted-foreground">External channels are disabled until server credentials are configured. This demo does not claim delivery.</p>
              <Button type="submit"><Save className="mr-1 h-4 w-4" /> Save preferences</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Security</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div>
              <Button type="submit" variant="outline">Change password</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Data controls</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={() => void exportData()}><Download className="mr-1 h-4 w-4" /> Download privacy export</Button>
            <p className="text-xs text-muted-foreground">Exports account, preferences, alerts, purchases, recurring reminders and watchlist metadata.</p>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-900"><AlertTriangle className="h-4 w-4" /> Delete account</p>
              <p className="mt-1 text-xs text-red-800">Deletes access and anonymises account identifiers. Some audit or transaction records may be retained as described in the privacy policy.</p>
              {!showDanger ? (
                <Button variant="destructive" size="sm" className="mt-2" onClick={() => setShowDanger(true)}>Show deletion form</Button>
              ) : (
                <form onSubmit={deleteAccount} className="mt-2 space-y-2">
                  <Input type="password" placeholder="Enter password to confirm" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
                  <Button type="submit" variant="destructive" size="sm"><Trash2 className="mr-1 h-4 w-4" /> Permanently delete</Button>
                </form>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">DPDP access/export</Badge>
              <Badge variant="secondary">Account deletion</Badge>
              <Badge variant="secondary">No raw card data</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
