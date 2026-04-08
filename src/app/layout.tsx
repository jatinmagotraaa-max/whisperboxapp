import type { Metadata } from 'next';
import { Outfit, Playfair_Display } from 'next/font/google';
import './globals.css';
import { MoodProvider } from '@/contexts/MoodContext';
import MoodEffects from '@/components/MoodEffects';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });

export const metadata: Metadata = {
  title: 'Whisper Box | The Premium Anonymous Social Network',
  description: 'Share your thoughts, completely unfiltered and entirely elegant.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${playfair.variable} dark`}>
      <body className="font-sans antialiased bg-background text-primary relative min-h-screen selection:bg-accent/30 selection:text-primary">
        <MoodProvider>
          {/* Subtle noise texture overlay for premium analog feel */}
          <div className="subtle-grain"></div>
          <MoodEffects />
          {children}
        </MoodProvider>
      </body>
    </html>
  );
}
