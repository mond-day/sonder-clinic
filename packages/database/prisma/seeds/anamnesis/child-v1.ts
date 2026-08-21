import { buildSchema, type SeedSection } from './builder.ts';

const sections: SeedSection[] = [
  {
    code: 'IDENTIFICATION',
    title: 'Identificação e responsável',
    questions: [
      { code: 'C_ID_01', label: 'Nome do responsável principal', type: 'SHORT_TEXT', required: true },
      { code: 'C_ID_02', label: 'Parentesco do responsável', type: 'SINGLE_CHOICE', required: true, options: [
        { value: 'mother', label: 'Mãe' }, { value: 'father', label: 'Pai' }, { value: 'guardian', label: 'Tutor legal' }, { value: 'other', label: 'Outro' },
      ] },
      { code: 'C_ID_03', label: 'O responsável possui autorização legal para assinar documentos?', type: 'YES_NO', required: true },
      { code: 'C_ID_04', label: 'Telefone e canal preferencial do responsável', type: 'PHONE_CHANNEL', required: true },
      { code: 'C_ID_05', label: 'Qual é a queixa principal da criança ou do responsável?', type: 'LONG_TEXT', required: true },
      { code: 'C_ID_06', label: 'A criança já foi atendida por dentista anteriormente?', type: 'YES_NO_DETAILS' },
      { code: 'C_ID_07', label: 'Como a criança costuma reagir em ambientes de saúde?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'calm', label: 'Calma' }, { value: 'anxious', label: 'Ansiosa' }, { value: 'resistant', label: 'Resistente' }, { value: 'unknown', label: 'Não sabe' },
      ] },
    ],
  },
  {
    code: 'BIRTH',
    title: 'Histórico gestacional e nascimento',
    questions: [
      { code: 'C_BIRTH_01', label: 'A gestação foi considerada de risco?', type: 'YES_NO_DETAILS' },
      { code: 'C_BIRTH_02', label: 'Houve uso de medicamentos relevantes durante a gestação?', type: 'YES_NO_DETAILS' },
      { code: 'C_BIRTH_03', label: 'O nascimento foi prematuro?', type: 'YES_NO_DETAILS', detailsLabel: 'Idade gestacional' },
      { code: 'C_BIRTH_04', label: 'Qual foi o tipo de parto?', type: 'SINGLE_CHOICE', options: [
        { value: 'normal', label: 'Normal' }, { value: 'cesarean', label: 'Cesárea' }, { value: 'other', label: 'Outro' },
      ] },
      { code: 'C_BIRTH_05', label: 'Peso ao nascer', type: 'NUMBER_UNIT', unit: 'kg' },
      { code: 'C_BIRTH_06', label: 'Houve internação neonatal ou intercorrência no nascimento?', type: 'YES_NO_DETAILS' },
      { code: 'C_BIRTH_07', label: 'A criança apresenta atraso de desenvolvimento ou acompanhamento especializado?', type: 'YES_NO_DETAILS', alertMessage: 'Atraso de desenvolvimento relatado.' },
    ],
  },
  {
    code: 'MEDICAL',
    title: 'Histórico médico',
    questions: [
      { code: 'C_MED_01', label: 'Possui doença cardíaca congênita ou adquirida?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Cardiopatia pediátrica.', alertSeverity: 'CRITICAL' },
      { code: 'C_MED_02', label: 'Possui asma ou outra doença respiratória?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença respiratória pediátrica.' },
      { code: 'C_MED_03', label: 'Possui diabetes ou alteração metabólica?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alteração metabólica pediátrica.' },
      { code: 'C_MED_04', label: 'Possui epilepsia, convulsão ou condição neurológica?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Condição neurológica pediátrica.', alertSeverity: 'CRITICAL' },
      { code: 'C_MED_05', label: 'Possui transtorno do neurodesenvolvimento ou necessidade de adaptação do atendimento?', type: 'YES_NO_DETAILS', alertMessage: 'Necessita adaptação de atendimento.' },
      { code: 'C_MED_06', label: 'Possui distúrbio de coagulação ou sangramento prolongado?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Risco de sangramento pediátrico.', alertSeverity: 'CRITICAL' },
      { code: 'C_MED_07', label: 'Possui doença renal, hepática ou imunológica?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença sistêmica pediátrica.' },
      { code: 'C_MED_08', label: 'Está em acompanhamento médico regular?', type: 'YES_NO_DETAILS', detailsLabel: 'Profissional e contato' },
    ],
  },
  {
    code: 'MEDS',
    title: 'Medicamentos e alergias',
    questions: [
      { code: 'C_RX_01', label: 'Utiliza medicamentos continuamente?', type: 'YES_NO_DETAILS', required: true },
      { code: 'C_RX_02', label: 'Possui alergia a medicamentos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia medicamentosa pediátrica.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'C_RX_03', label: 'Possui alergia a alimentos, látex, materiais ou anestésicos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia a materiais/alimentos.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'C_RX_04', label: 'Já realizou cirurgia ou internação relevante?', type: 'YES_NO_DETAILS' },
      { code: 'C_RX_05', label: 'A carteira de vacinação está atualizada?', type: 'YES_NO_UNKNOWN' },
    ],
  },
  {
    code: 'DEVELOPMENT',
    title: 'Hábitos e desenvolvimento',
    questions: [
      { code: 'C_DEV_01', label: 'Utilizou mamadeira?', type: 'YES_NO_DETAILS', detailsLabel: 'Até qual idade' },
      { code: 'C_DEV_02', label: 'Utilizou chupeta?', type: 'YES_NO_DETAILS', detailsLabel: 'Até qual idade' },
      { code: 'C_DEV_03', label: 'Possui hábito de sucção digital?', type: 'YES_NO_DETAILS' },
      { code: 'C_DEV_04', label: 'Apresenta respiração bucal?', type: 'YES_NO_UNKNOWN', alertMessage: 'Respiração bucal — avaliar.' },
      { code: 'C_DEV_05', label: 'Apresenta ronco ou sono agitado?', type: 'YES_NO_DETAILS' },
      { code: 'C_DEV_06', label: 'Possui hábito de roer unhas ou morder objetos?', type: 'YES_NO_DETAILS' },
      { code: 'C_DEV_07', label: 'Como é a alimentação em relação a açúcar e alimentos ultraprocessados?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'low', label: 'Baixo' }, { value: 'moderate', label: 'Moderado' }, { value: 'high', label: 'Alto' },
      ] },
      { code: 'C_DEV_08', label: 'A criança aceita escovação com ajuda do responsável?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'yes', label: 'Sim' }, { value: 'partial', label: 'Parcialmente' }, { value: 'no', label: 'Não' },
      ] },
    ],
  },
  {
    code: 'DENTAL',
    title: 'Histórico odontológico',
    questions: [
      { code: 'C_OD_01', label: 'Quando ocorreu a primeira consulta odontológica?', type: 'SHORT_TEXT' },
      { code: 'C_OD_02', label: 'Já apresentou cárie ou realizou restauração?', type: 'YES_NO_DETAILS' },
      { code: 'C_OD_03', label: 'Já sofreu trauma dentário?', type: 'YES_NO_DETAILS', detailsLabel: 'Região e data' },
      { code: 'C_OD_04', label: 'Apresenta dor, sensibilidade ou dificuldade para mastigar?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'pain', label: 'Dor' }, { value: 'sensitivity', label: 'Sensibilidade' }, { value: 'chewing', label: 'Dificuldade mastigação' },
      ] },
      { code: 'C_OD_05', label: 'Há sangramento gengival?', type: 'SINGLE_CHOICE', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'C_OD_06', label: 'Utiliza aparelho, mantenedor ou outro dispositivo?', type: 'YES_NO_DETAILS' },
      { code: 'C_OD_07', label: 'Recebe aplicação de flúor ou acompanhamento preventivo regular?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'RISK',
    title: 'Avaliação de risco',
    questions: [
      { code: 'C_RISK_01', label: 'Classificação de risco médico pediátrico', type: 'RISK_LEVEL', required: true },
      { code: 'C_RISK_02', label: 'Classificação de risco de cárie', type: 'RISK_LEVEL', required: true },
      { code: 'C_RISK_03', label: 'Nível de ansiedade/comportamento esperado', type: 'RISK_LEVEL', required: true },
      { code: 'C_RISK_04', label: 'Necessidade de adaptação, sedação ou atendimento especializado', type: 'YES_NO_DETAILS', alertMessage: 'Necessita adaptação/sedação.', alertSeverity: 'WARNING' },
    ],
  },
  {
    code: 'SIGNATURE',
    title: 'Aceite e assinatura',
    questions: [
      { code: 'C_SIG_01', label: 'O responsável declara que as informações são verdadeiras e completas.', type: 'ACKNOWLEDGEMENT', required: true },
      { code: 'C_SIG_02', label: 'O responsável autoriza o uso das informações para o atendimento da criança.', type: 'ACKNOWLEDGEMENT', required: true },
    ],
  },
];

export const childAnamnesisV1 = buildSchema({
  title: 'Anamnese infantil',
  audience: 'CHILD',
  sections,
});
