import Link from 'next/link';

const policies = {
  privacidade: {
    title: 'Política de Privacidade',
    paragraphs: [
      'Esta Política de Privacidade descreve como a Sonder Clinic e as clínicas que utilizam a plataforma tratam dados pessoais e dados sensíveis de saúde, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e demais normas aplicáveis.',
      'Coletamos dados cadastrais (nome, documentos, contatos), dados de agendamento, informações financeiras de cobrança e, quando autorizados, dados clínicos necessários à prestação do atendimento odontológico. Dados de saúde são tratados como sensíveis e exigem base legal adequada, como execução de contrato, tutela da saúde ou consentimento quando cabível.',
      'As finalidades incluem gestão da clínica, prontuário eletrônico, comunicação com o paciente, faturamento, cumprimento de obrigações legais e melhoria da segurança do sistema. Não vendemos dados pessoais. Compartilhamentos ocorrem apenas com prestadores essenciais (hospedagem, e-mail, pagamentos, mensageria) sob contrato e medidas de segurança, ou quando exigido por autoridade competente.',
      'Adotamos controles técnicos e organizacionais: autenticação, controle de acesso por perfil (RBAC), criptografia em trânsito, mascaramento de segredos e registros de auditoria. O armazenamento observa prazos legais e clínicos; ao término, os dados são eliminados ou anonimizados quando possível.',
      'O titular pode solicitar acesso, correção, portabilidade, anonimização, eliminação (quando aplicável), informação sobre compartilhamentos e revogação de consentimento. Pedidos devem ser encaminhados ao canal de privacidade indicado abaixo. Também utilizamos cookies e tecnologias similares estritamente necessários à autenticação e ao funcionamento da aplicação; cookies analíticos, se houver, dependerão de consentimento quando exigido.',
      'Esta política pode ser atualizada. A versão vigente será publicada nesta página e, quando relevante, comunicada no acesso ao sistema. Em caso de dúvida, utilize o contato de privacidade.',
    ],
  },
  uso: {
    title: 'Termos de Uso',
    paragraphs: [
      'Estes Termos de Uso regulam o acesso e a utilização da plataforma Sonder Clinic por clínicas, profissionais e colaboradores autorizados. Ao entrar no sistema, o usuário declara conhecer e aceitar estas condições.',
      'O acesso é pessoal e intransferível. O usuário é responsável pela confidencialidade de suas credenciais, pela veracidade das informações inseridas e pelo uso adequado dos módulos clínicos, financeiros e administrativos. É vedado compartilhar senhas, tentar contornar controles de segurança ou utilizar o sistema para fins ilícitos.',
      'A plataforma fornece ferramentas de apoio à gestão clínica; decisões clínicas e responsabilidade profissional permanecem com o profissional habilitado. Conteúdos gerados por assistentes ou automações, quando disponíveis, devem ser revisados antes de qualquer uso assistencial ou documental.',
      'A clínica contratante é responsável por configurar branding, documentos legais, integrações e permissões de sua equipe, bem como por obter consentimentos e bases legais necessários ao tratamento de dados dos pacientes. A Sonder Clinic disponibiliza recursos técnicos, mas não substitui a governança local da clínica.',
      'Podemos suspender ou restringir contas em caso de suspeita de uso indevido, comprometimento de segurança ou violação destes termos. Funcionalidades podem evoluir; avisos relevantes serão comunicados na interface ou por canais oficiais.',
      'Questões sobre estes termos, privacidade ou suporte devem ser direcionadas aos canais oficiais da clínica ou ao contato institucional indicado nesta página.',
    ],
  },
  consentimento: {
    title: 'Consentimento LGPD',
    paragraphs: [
      'Este documento registra finalidades, canais autorizados e evidências do consentimento do titular. A versão institucional definitiva é configurável pela clínica no módulo de configurações legais.',
      'Ao consentir, o titular autoriza o tratamento dos dados necessários às finalidades informadas (atendimento, comunicação, cobrança e obrigações legais), podendo revogar o consentimento pelos canais disponibilizados, ressalvadas hipóteses legais que permitam a continuidade do tratamento.',
      'A clínica deve manter registro da versão do texto apresentada, data/hora e identificação do titular ou responsável legal, especialmente em casos envolvendo menores de idade.',
    ],
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
      {content.paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
      ))}
      <p>Contato para privacidade: <a href={`mailto:${contact}`}>{contact}</a>.</p>
      <nav className="legal-links">
        <Link href="/legal/privacidade">Privacidade</Link>
        <Link href="/legal/uso">Termos de Uso</Link>
        <Link href="/legal/consentimento">Consentimento</Link>
      </nav>
      <small>Conteúdo inicial configurável. Consulte a versão e vigência exibidas no documento assinado.</small>
      <Link className="button secondary" href="/">Voltar ao sistema</Link>
    </main>
  );
}
