import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TopNavBar } from "@/components/TopNavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyKit - Personal Dashboard",
  description: "A modular personal dashboard for bookkeeping and calendar management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-white text-gray-900`}>
        <TopNavBar />
        <main className="min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </body>
    </html>
  );
}
