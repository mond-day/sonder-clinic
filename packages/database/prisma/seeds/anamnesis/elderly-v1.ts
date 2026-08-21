import { buildSchema, type SeedSection } from './builder.ts';

const sections: SeedSection[] = [
  {
    code: 'IDENTIFICATION',
    title: 'Identificação e contexto',
    questions: [
      { code: 'E_ID_01', label: 'Qual é a queixa principal e o objetivo do atendimento?', type: 'LONG_TEXT', required: true },
      { code: 'E_ID_02', label: 'Possui cuidador ou acompanhante principal?', type: 'YES_NO_DETAILS', detailsLabel: 'Contato' },
      { code: 'E_ID_03', label: 'Quem auxilia nas decisões de saúde?', type: 'SHORT_TEXT' },
      { code: 'E_ID_04', label: 'Possui diretiva, procuração ou limitação legal relevante?', type: 'YES_NO_DETAILS' },
      { code: 'E_ID_05', label: 'Mora sozinho, com família ou em instituição?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'alone', label: 'Sozinho' }, { value: 'family', label: 'Com família' }, { value: 'institution', label: 'Instituição' },
      ] },
      { code: 'E_ID_06', label: 'Possui dificuldade de locomoção para comparecer à clínica?', type: 'YES_NO_DETAILS', alertMessage: 'Preferência operacional: mobilidade reduzida.' },
    ],
  },
  {
    code: 'AUTONOMY',
    title: 'Autonomia e segurança',
    questions: [
      { code: 'E_AUT_01', label: 'Consegue realizar higiene oral sem ajuda?', type: 'SINGLE_CHOICE_DETAILS', required: true, options: [
        { value: 'independent', label: 'Independente' }, { value: 'partial', label: 'Parcial' }, { value: 'dependent', label: 'Dependente' },
      ] },
      { code: 'E_AUT_02', label: 'Possui dificuldade visual ou auditiva?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'visual', label: 'Visual' }, { value: 'hearing', label: 'Auditiva' },
      ] },
      { code: 'E_AUT_03', label: 'Possui diagnóstico de demência, comprometimento cognitivo ou confusão frequente?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Comprometimento cognitivo.', alertSeverity: 'CRITICAL' },
      { code: 'E_AUT_04', label: 'Consegue compreender e consentir com o tratamento?', type: 'YES_NO_UNKNOWN', required: true },
      { code: 'E_AUT_05', label: 'Possui histórico recente de quedas?', type: 'YES_NO_DETAILS' },
      { code: 'E_AUT_06', label: 'Necessita adaptação de cadeira, tempo de consulta ou acompanhante?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'chair', label: 'Cadeira' }, { value: 'time', label: 'Tempo' }, { value: 'companion', label: 'Acompanhante' },
      ] },
    ],
  },
  {
    code: 'MEDICAL',
    title: 'Histórico médico',
    questions: [
      { code: 'E_MED_01', label: 'Possui hipertensão arterial?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Hipertensão.' },
      { code: 'E_MED_02', label: 'Possui diabetes?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Diabetes.' },
      { code: 'E_MED_03', label: 'Possui insuficiência cardíaca, arritmia ou histórico de infarto?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Risco cardíaco.', alertSeverity: 'CRITICAL' },
      { code: 'E_MED_04', label: 'Possui histórico de AVC ou doença neurológica?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Histórico neurológico/AVC.' },
      { code: 'E_MED_05', label: 'Possui doença renal?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença renal.' },
      { code: 'E_MED_06', label: 'Possui doença hepática?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença hepática.' },
      { code: 'E_MED_07', label: 'Possui osteoporose ou já teve fratura por fragilidade?', type: 'YES_NO_DETAILS', required: true },
      { code: 'E_MED_08', label: 'Realiza hemodiálise, quimioterapia, radioterapia ou tratamento imunossupressor?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Tratamento de alto risco.', alertSeverity: 'CRITICAL' },
      { code: 'E_MED_09', label: 'Possui doença respiratória ou utiliza oxigênio?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença respiratória/oxigênio.', alertSeverity: 'CRITICAL' },
    ],
  },
  {
    code: 'MEDS',
    title: 'Medicamentos e alergias',
    questions: [
      { code: 'E_RX_01', label: 'Quantos medicamentos utiliza diariamente?', type: 'NUMBER', required: true, alertMessage: 'Polifarmácia (≥ 5).', alertSeverity: 'WARNING' },
      { code: 'E_RX_02', label: 'Liste medicamentos, doses e horários', type: 'REPEATER_MEDICATION', required: true },
      { code: 'E_RX_03', label: 'Utiliza anticoagulante ou antiagregante?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Anticoagulante/antiagregante.', alertSeverity: 'CRITICAL' },
      { code: 'E_RX_04', label: 'Utiliza bisfosfonato, denosumabe ou medicamento ósseo?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Medicamento ósseo.', alertSeverity: 'CRITICAL' },
      { code: 'E_RX_05', label: 'Possui alergia a medicamentos ou materiais?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia relatada.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'E_RX_06', label: 'Teve reação adversa ou interação medicamentosa conhecida?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'DENTAL',
    title: 'Histórico odontológico',
    questions: [
      { code: 'E_OD_01', label: 'Utiliza prótese total, parcial, fixa ou implante?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'total', label: 'Total' }, { value: 'partial', label: 'Parcial' }, { value: 'fixed', label: 'Fixa' }, { value: 'implant', label: 'Implante' },
      ] },
      { code: 'E_OD_02', label: 'A prótese causa dor, ferida, instabilidade ou dificuldade para mastigar?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'pain', label: 'Dor' }, { value: 'wound', label: 'Ferida' }, { value: 'unstable', label: 'Instabilidade' }, { value: 'chewing', label: 'Mastigação' },
      ] },
      { code: 'E_OD_03', label: 'Quando foi realizada a última manutenção da prótese?', type: 'SHORT_TEXT' },
      { code: 'E_OD_04', label: 'Apresenta boca seca?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'E_OD_05', label: 'Apresenta dificuldade para engolir?', type: 'YES_NO_DETAILS', alertMessage: 'Disfagia relatada.' },
      { code: 'E_OD_06', label: 'Apresenta ferida, mancha ou alteração de mucosa persistente?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Lesão de mucosa persistente.', alertSeverity: 'CRITICAL' },
      { code: 'E_OD_07', label: 'Possui dor, mobilidade dentária ou sangramento gengival?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'pain', label: 'Dor' }, { value: 'mobility', label: 'Mobilidade' }, { value: 'bleeding', label: 'Sangramento' },
      ] },
    ],
  },
  {
    code: 'HABITS',
    title: 'Hábitos e nutrição',
    questions: [
      { code: 'E_HAB_01', label: 'Como está o apetite e a alimentação?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'good', label: 'Bom' }, { value: 'reduced', label: 'Reduzido' }, { value: 'poor', label: 'Ruim' },
      ] },
      { code: 'E_HAB_02', label: 'Possui perda de peso recente sem intenção?', type: 'YES_NO_DETAILS', alertMessage: 'Perda de peso não intencional.' },
      { code: 'E_HAB_03', label: 'Fuma ou fumou por período prolongado?', type: 'SINGLE_CHOICE_DETAILS', required: true, options: [
        { value: 'no', label: 'Não' }, { value: 'yes', label: 'Sim' }, { value: 'former', label: 'Ex-fumante' },
      ] },
      { code: 'E_HAB_04', label: 'Consome álcool?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'never', label: 'Nunca' }, { value: 'social', label: 'Social' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'E_HAB_05', label: 'Qual é a rotina de higiene oral e limpeza das próteses?', type: 'LONG_TEXT' },
    ],
  },
  {
    code: 'RISK',
    title: 'Avaliação de risco',
    questions: [
      { code: 'E_RISK_01', label: 'Classificação de risco médico sistêmico', type: 'RISK_LEVEL', required: true },
      { code: 'E_RISK_02', label: 'Classificação de risco de queda e mobilidade', type: 'RISK_LEVEL', required: true },
      { code: 'E_RISK_03', label: 'Classificação de autonomia para autocuidado', type: 'RISK_LEVEL', required: true },
      { code: 'E_RISK_04', label: 'Classificação de risco de lesão oral/câncer bucal', type: 'RISK_LEVEL', required: true },
    ],
  },
  {
    code: 'SIGNATURE',
    title: 'Aceite e assinatura',
    questions: [
      { code: 'E_SIG_01', label: 'Paciente ou responsável declara que as informações são verdadeiras.', type: 'ACKNOWLEDGEMENT', required: true },
      { code: 'E_SIG_02', label: 'Paciente ou responsável autoriza o uso clínico das informações.', type: 'ACKNOWLEDGEMENT', required: true },
    ],
  },
];

export const elderlyAnamnesisV1 = buildSchema({
  title: 'Anamnese idoso',
  audience: 'ELDERLY',
  sections,
});
