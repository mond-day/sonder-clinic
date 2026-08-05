import Link from 'next/link';

const policies = {
  privacidade: {
    title: 'Política de Privacidade',
    text: 'Descreve o tratamento de dados pessoais e dados sensíveis de saúde, as bases legais, os direitos do titular e os canais de contato do controlador.',
  },
  uso: {
    title: 'Política de Uso',
    text: 'Define as condições de acesso ao sistema, responsabilidades dos usuários, uso aceitável, segurança de credenciais e limites operacionais.',
  },
  consentimento: {
    title: 'Consentimento LGPD',
    text: 'Registra finalidades, canais autorizados e evidências do consentimento. A versão institucional definitiva é configurável pela clínica.',
  },
} as const;

export default async function PolicyPage({ params }: { params: Promise<{ policy: string }> }) {
  const { policy } = await params;
  const content = policies[policy as keyof typeof policies] ?? policies.privacidade;
  const clinicName = process.env.BRAND_NAME ?? 'Sonder Clinic';
  const contact = process.env.PRIVACY_CONTACT_EMAIL ?? 'privacidade@sonder.clinic';
  return (
    <main className="legal-page">
      <p className="eyebrow">{clinicName.toUpperCase()}</p>
      <h1>{content.title}</h1>
      <p>{content.text}</p>
      <p>Contato para privacidade: <a href={`mailto:${contact}`}>{contact}</a>.</p>
      <small>Conteúdo inicial configurável. Consulte a versão e vigência exibidas no documento assinado.</small>
      <Link className="button secondary" href="/">Voltar ao sistema</Link>
    </main>
  );
}
