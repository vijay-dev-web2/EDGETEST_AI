import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { ChatbotAssistant } from "@/components/ChatbotAssistant";

export const metadata: Metadata = {
  title: "EdgeTest AI — Risk-Aware Test Generation",
  description: "AI agent that makes tests risk-aware and traceable. Problem #38 — Capgemini AgentifAI Buildathon.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ChatbotAssistant />
      </body>
    </html>
  );
}
