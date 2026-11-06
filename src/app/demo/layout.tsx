import type { Metadata } from "next";
import DemoApp from "./_lib/demo-app";

export const metadata: Metadata = {
  title: "Demo",
  description: "Try note-scion in your browser. Pages are saved on this device only.",
};

/** The public demo: the whole workspace, running in the browser, with no login. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoApp>{children}</DemoApp>;
}
