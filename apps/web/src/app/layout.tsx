import type { Metadata } from 'next';
import { Manrope, Source_Serif_4 } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { PresentationProvider } from '@/components/presentation-provider';
import { SelectionProvider } from '@/components/selection-provider';
import { WorkspaceProvider } from '@/components/workspace-provider';
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
    <html lang="pt-BR" className={`${sans.variable} ${display.variable}`}>
      <body>
        <AuthProvider>
          <SelectionProvider>
            <WorkspaceProvider>
              <PresentationProvider>{children}</PresentationProvider>
            </WorkspaceProvider>
          </SelectionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
