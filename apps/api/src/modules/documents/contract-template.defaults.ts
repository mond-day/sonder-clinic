export const SYSTEM_CONTRACT_TEMPLATE_NAME = 'Contrato de Prestação de Serviços Odontológicos';

export const SYSTEM_CONTRACT_ALLOWED_VARIABLES = [
  'clinic.tradeName',
  'clinic.legalName',
  'clinic.taxId',
  'clinic.address',
  'clinic.phone',
  'clinic.email',
  'patient.fullName',
  'patient.cpf',
  'patient.birthDate',
  'patient.address',
  'patient.phone',
  'patient.email',
  'guardian.name',
  'guardian.cpf',
  'guardian.relationship',
  'professional.name',
  'professional.cro',
  'professional.cpf',
  'treatment.title',
  'treatment.createdAt',
  'treatment.validUntil',
  'treatment.subtotal',
  'treatment.discount',
  'treatment.total',
  'treatment.notes',
  'payment.methodLabel',
  'payment.summary',
  'payment.clause',
  'payment.installments',
  'payment.installmentAmount',
  'payment.totalFormatted',
  'payment.totalInWords',
  'payment.dueDateLabel',
  'procedureName',
  'toothFdi',
  'face',
  'quantity',
  'plannedSessions',
  'unitPrice',
  'discount',
  'total',
] as const;

export const SYSTEM_CONTRACT_BODY = `Pelo presente instrumento particular de contrato de prestação de serviços odontológicos, as partes:

a) {{clinic.legalName}}, nome fantasia {{clinic.tradeName}}, inscrita no CNPJ sob o nº {{clinic.taxId}}, com endereço em {{clinic.address}}, telefone {{clinic.phone}}, e-mail {{clinic.email}}, doravante denominada CONTRATADA;

b) {{patient.fullName}}, inscrito(a) no CPF sob o nº {{patient.cpf}}, nascido(a) em {{patient.birthDate}}, residente em {{patient.address}}, telefone {{patient.phone}}, e-mail {{patient.email}}, doravante denominado(a) CONTRATANTE{{#guardian.name}}, neste ato representado(a) por {{guardian.name}}, CPF {{guardian.cpf}}, na qualidade de {{guardian.relationship}}{{/guardian.name}}.

têm entre si justo e contratado o seguinte:

CLÁUSULA PRIMEIRA — DO OBJETO
1.1 O objeto deste contrato é a prestação de serviços odontológicos pela CONTRATADA ao CONTRATANTE, de acordo com o plano de tratamento aprovado "{{treatment.title}}", que passa a integrar este instrumento.
1.2 Os procedimentos contratados são:

{{#treatment.items}}
- {{procedureName}}{{#toothFdi}} (dente {{toothFdi}}{{#face}}, face {{face}}{{/face}}){{/toothFdi}} — quantidade {{quantity}}, sessões previstas {{plannedSessions}} — {{unitPrice}} (desc. {{discount}}) = {{total}}
{{/treatment.items}}

1.3 O tratamento poderá ser ajustado diante de intercorrências clínicas, resposta biológica ou necessidade técnica, hipótese em que as partes formalizarão novo plano e, se couber, novo contrato. Este instrumento não é alterado após a assinatura.

CLÁUSULA SEGUNDA — DOS HONORÁRIOS
2.1 O valor total dos honorários é de {{treatment.total}} ({{payment.totalInWords}}), já considerados subtotal {{treatment.subtotal}} e desconto {{treatment.discount}}.
2.2 {{payment.clause}}

CLÁUSULA TERCEIRA — DAS OBRIGAÇÕES
3.1 A CONTRATADA prestará os serviços com zelo técnico, sigilo e observância ao Código de Ética Odontológica, à legislação consumerista e às normas dos Conselhos de Odontologia.
3.2 O CONTRATANTE comparecerá às consultas, informará dados de saúde relevantes, seguirá as orientações profissionais e manterá os pagamentos em dia.
3.3 Faltas sem aviso prévio de 24 horas poderão ser cobradas, conforme política da clínica informada ao paciente.

CLÁUSULA QUARTA — DA NATUREZA DO TRATAMENTO
4.1 A Odontologia não é ciência exata. O resultado depende da resposta biológica, da colaboração do paciente e das limitações do caso.
4.2 Alterações do plano original exigem novo acordo formal. Procedimentos não listados neste contrato não estão cobertos.

CLÁUSULA QUINTA — DA VIGÊNCIA E RESCISÃO
5.1 Este contrato vigora até a conclusão dos procedimentos contratados ou até rescisão.
5.2 A rescisão imotivada pelo CONTRATANTE poderá sujeitá-lo ao pagamento dos serviços já executados e, se houver, de multa proporcional, nos limites da legislação.
5.3 O cancelamento do plano no sistema não apaga este contrato; eventual distrato será documento próprio.

CLÁUSULA SEXTA — DAS DISPOSIÇÕES GERAIS
6.1 Observações do plano: {{treatment.notes}}
6.2 Foro: comarca do estabelecimento da CONTRATADA.
6.3 As partes reconhecem a validade da assinatura eletrônica do CONTRATANTE e, quando houver, da assinatura com certificado digital da CONTRATADA.

Documento gerado a partir do plano aprovado em {{treatment.createdAt}}. Validade clínica de referência: {{treatment.validUntil}}.
Profissional responsável clínico: {{professional.name}} — {{professional.cro}}.`;
