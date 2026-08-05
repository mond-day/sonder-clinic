import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import { SelectionProvider } from '@/components/selection-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sonder Clinic',
  description: 'ERP odontológico para uma operação clínica segura e eficiente',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><AuthProvider><SelectionProvider>{children}</SelectionProvider></AuthProvider></body>
    </html>
  );
}
