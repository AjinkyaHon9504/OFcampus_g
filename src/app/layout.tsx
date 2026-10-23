import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OffCampus Outreach",
  description: "Find founders and HR contacts, send personalised mails from your Gmail, track replies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
