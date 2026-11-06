"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  password: "Wrong password.",
  config: "Notes are not configured on this deployment.",
  origin: "That request came from somewhere else. Try again from this page.",
};

// A plain form posting to the /session route handler, so it also works
// without JavaScript.
export default function LoginForm({ next, error }: { next: string; error?: string }) {
  const [pending, setPending] = useState(false);
  const message = error ? (ERRORS[error] ?? "Couldn't log in. Try again.") : null;

  return (
    <form method="post" action="/session" onSubmit={() => setPending(true)} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="notes-password">Password</Label>
        <Input
          id="notes-password"
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "login-error" : undefined}
          // 16px on touch screens: iOS zooms the page into any smaller field.
          className="[@media(pointer:coarse)]:text-base"
        />
      </div>
      {message && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Open notes"}
      </Button>
    </form>
  );
}
