import type { Metadata } from 'next';
import { Manrope, Source_Serif_4 } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { PresentationProvider } from '@/components/presentation-provider';
import { SelectionProvider } from '@/components/selection-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
import './globals.css';

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sonder Clinic',
  description: 'ERP odontológico para uma operação clínica segura e eficiente',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <SelectionProvider>
              <WorkspaceProvider>
                <PresentationProvider>{children}</PresentationProvider>
              </WorkspaceProvider>
            </SelectionProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
