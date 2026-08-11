import Link from 'next/link';

const policies = {
  privacidade: {
    title: 'Política de Privacidade da plataforma Sonder',
    paragraphs: [
      'Esta Política de Privacidade descreve como a Sonder Clinic (operadora da plataforma) trata dados pessoais no contexto da disponibilização do software às clínicas contratantes, em conformidade com a LGPD (Lei nº 13.709/2018).',
      'A Sonder processa dados técnicos e cadastrais necessários à operação do SaaS (contas de usuário, logs de autenticação, telemetria operacional e suporte). Dados clínicos e de pacientes são tratados sob responsabilidade da clínica contratante, que atua como controladora desses dados; a Sonder atua como operadora técnica quando processa esses dados sob instrução contratual.',
      'Não vendemos dados pessoais. Compartilhamentos ocorrem apenas com prestadores essenciais (hospedagem, e-mail, monitoramento) sob contrato e medidas de segurança, ou quando exigido por autoridade competente.',
      'Adotamos controles técnicos e organizacionais: autenticação, RBAC, criptografia em trânsito, mascaramento de segredos e auditoria. Esta política cobre a plataforma Sonder e é distinta das políticas legais configuráveis por cada clínica no módulo Configurações.',
      'O titular pode exercer direitos LGPD pelos canais de privacidade indicados abaixo. Políticas da clínica (privacidade, termos e consentimento apresentados aos pacientes) são publicadas e geridas pela própria clínica.',
    ],
  },
  uso: {
    title: 'Termos de Uso da plataforma Sonder',
    paragraphs: [
      'Estes Termos regulam o acesso à plataforma Sonder Clinic por clínicas, profissionais e colaboradores autorizados. Ao entrar no sistema, o usuário declara conhecer e aceitar estas condições.',
      'O acesso é pessoal e intransferível. É vedado compartilhar senhas, contornar controles de segurança ou utilizar o sistema para fins ilícitos. Decisões clínicas permanecem com o profissional habilitado.',
      'A clínica contratante é responsável por branding, documentos legais próprios, integrações e permissões da equipe, bem como por obter bases legais junto aos pacientes. A Sonder disponibiliza recursos técnicos e não substitui a governança local da clínica.',
      'Documentos legais da clínica (privacidade, termos e consentimento exibidos aos pacientes) são configurados em Configurações → Legal e não se confundem com esta política institucional da plataforma.',
    ],
  },
  consentimento: {
    title: 'Consentimento e LGPD — plataforma Sonder',
    paragraphs: [
      'Este texto descreve o tratamento de dados pela operadora da plataforma. Consentimentos clínicos e de comunicação com pacientes são de responsabilidade da clínica e devem ser configurados nos documentos legais da própria clínica.',
      'Quando a Sonder solicita consentimento (cookies não essenciais, marketing institucional, etc.), a finalidade, a base legal e a forma de revogação são informadas no momento da coleta.',
      'Para validar a autenticidade de documentos assinados gerados na plataforma, utilize a página pública de validação com o código impresso no PDF.',
    ],
  },
} as const;

export default async function PolicyPage({ params }: { params: Promise<{ policy: string }> }) {
  const { policy } = await params;
  const content = policies[policy as keyof typeof policies] ?? policies.privacidade;
  const contact = process.env.PRIVACY_CONTACT_EMAIL ?? 'privacidade@sonder.clinic';
  return (
    <main className="legal-page">
      <p className="eyebrow">SONDER CLINIC · PLATAFORMA</p>
      <h1>{content.title}</h1>
      <p className="muted-note">
        Conteúdo institucional da Sonder. Políticas e consentimentos da clínica são configurados em Configurações → Legal
        e não substituem este texto.
      </p>
      {content.paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
      <p>Contato para privacidade da plataforma: <a href={`mailto:${contact}`}>{contact}</a>.</p>
      <nav className="legal-links">
        <Link href="/legal/privacidade">Privacidade Sonder</Link>
        <Link href="/legal/uso">Termos Sonder</Link>
        <Link href="/legal/consentimento">Consentimento</Link>
        <Link href="/validar/documento">Validar documento</Link>
      </nav>
      <Link className="button secondary" href="/">Voltar ao sistema</Link>
    </main>
  );
}
