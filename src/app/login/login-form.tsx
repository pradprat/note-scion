"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Focus the field on a computer, but not on a phone, where that raises the keyboard at once.
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) field.current?.focus();
  }, []);
  const message = error ? (ERRORS[error] ?? "Couldn't log in. Try again.") : null;

  return (
    <form method="post" action="/session" onSubmit={() => setPending(true)} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="notes-password">Password</Label>
        <div className="relative">
          <Input
            ref={field}
            id="notes-password"
            type={shown ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "login-error" : undefined}
            // 16px on touch screens: iOS zooms the page into any smaller field.
            className="pr-11 [@media(pointer:coarse)]:text-base"
          />
          <button
            type="button"
            onClick={() => setShown((value) => !value)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {shown ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
          </button>
        </div>
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
