import type { ReactNode } from "react";

export function ContentPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-black">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{intro}</p>
      <div className="prose-sm mt-8 space-y-6 text-sm leading-6 text-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground">
        {children}
      </div>
    </main>
  );
}
