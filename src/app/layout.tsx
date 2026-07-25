import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pose Spotter | Real-Time AI Body Tracker",
  description: "Advanced browser-based skeletal tracking and body positioning analysis using MediaPipe Pose Landmarker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ width: '100%', height: '100%' }}
    >
      <body style={{ width: '100%', height: '100%', margin: 0 }}>{children}</body>
    </html>
  );
}
