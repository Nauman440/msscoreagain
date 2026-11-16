import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/account/AppShell";
import LoginForm from "@/components/account/LoginForm";
import { currentAccount } from "@/lib/account/session";

export const metadata: Metadata = { title: "Log in | MSScore", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await currentAccount()) redirect("/dashboard");
  return (
    <AppShell loggedIn={false} narrow>
      <LoginForm />
    </AppShell>
  );
}
