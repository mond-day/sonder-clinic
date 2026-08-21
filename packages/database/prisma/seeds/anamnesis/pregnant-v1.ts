import { buildSchema, type SeedSection } from './builder.ts';

const sections: SeedSection[] = [
  {
    code: 'GESTATION',
    title: 'Dados da gestação',
    questions: [
      { code: 'P_GES_01', label: 'Qual é a idade gestacional atual?', type: 'NUMBER_UNIT', required: true, unit: 'semanas' },
      { code: 'P_GES_02', label: 'Qual é a data provável do parto?', type: 'DATE', required: true },
      { code: 'P_GES_03', label: 'Qual é o nome e contato do obstetra?', type: 'SHORT_TEXT' },
      { code: 'P_GES_04', label: 'A gestação é considerada de risco?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Gestação de risco.', alertSeverity: 'CRITICAL' },
      { code: 'P_GES_05', label: 'É gestação única ou múltipla?', type: 'SINGLE_CHOICE', options: [
        { value: 'single', label: 'Única' }, { value: 'multiple', label: 'Múltipla' },
      ] },
      { code: 'P_GES_06', label: 'Já ocorreu perda gestacional ou parto prematuro anterior?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'OBSTETRIC',
    title: 'Condições obstétricas',
    questions: [
      { code: 'P_OBS_01', label: 'Possui hipertensão gestacional ou pré-eclâmpsia?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Hipertensão gestacional/pré-eclâmpsia.', alertSeverity: 'CRITICAL' },
      { code: 'P_OBS_02', label: 'Possui diabetes gestacional?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Diabetes gestacional.' },
      { code: 'P_OBS_03', label: 'Apresenta sangramento, contrações ou recomendação de repouso?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Sinais obstétricos de alerta.', alertSeverity: 'CRITICAL' },
      { code: 'P_OBS_04', label: 'Possui náuseas ou vômitos frequentes?', type: 'YES_NO_DETAILS' },
      { code: 'P_OBS_05', label: 'O obstetra impôs alguma restrição a procedimentos ou medicamentos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Restrição obstétrica a procedimentos.', alertSeverity: 'CRITICAL' },
      { code: 'P_OBS_06', label: 'Há indicação de profilaxia antibiótica ou cuidado especial documentado?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'MEDICAL',
    title: 'Histórico médico',
    questions: [
      { code: 'P_MED_01', label: 'Possui doença cardíaca, renal, hepática ou respiratória?', type: 'MULTIPLE_CHOICE_DETAILS', required: true, options: [
        { value: 'cardiac', label: 'Cardíaca' }, { value: 'renal', label: 'Renal' }, { value: 'hepatic', label: 'Hepática' }, { value: 'respiratory', label: 'Respiratória' },
      ], alertMessage: 'Doença sistêmica na gestação.', alertSeverity: 'WARNING' },
      { code: 'P_MED_02', label: 'Possui distúrbio de coagulação ou anemia importante?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Coagulação/anemia na gestação.' },
      { code: 'P_MED_03', label: 'Possui epilepsia, condição neurológica ou autoimune?', type: 'YES_NO_DETAILS', required: true },
      { code: 'P_MED_04', label: 'Teve infecção relevante durante a gestação?', type: 'YES_NO_DETAILS' },
      { code: 'P_MED_05', label: 'Está em acompanhamento médico além do pré-natal?', type: 'YES_NO_DETAILS' },
      { code: 'P_MED_06', label: 'Realizou internação durante a gestação atual?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'MEDS',
    title: 'Medicamentos e alergias',
    questions: [
      { code: 'P_RX_01', label: 'Quais medicamentos e suplementos utiliza atualmente?', type: 'REPEATER_MEDICATION', required: true },
      { code: 'P_RX_02', label: 'Utiliza anticoagulante ou medicamento de alto risco?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Medicamento de alto risco na gestação.', alertSeverity: 'CRITICAL' },
      { code: 'P_RX_03', label: 'Possui alergia a medicamentos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia medicamentosa.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'P_RX_04', label: 'Possui alergia a anestésicos, látex ou materiais?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia a materiais.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'P_RX_05', label: 'Utilizou medicamento sem prescrição durante a gestação?', type: 'YES_NO_DETAILS' },
    ],
  },
  {
    code: 'DENTAL',
    title: 'Histórico odontológico',
    questions: [
      { code: 'P_OD_01', label: 'Apresenta sangramento gengival ou aumento gengival?', type: 'YES_NO_DETAILS' },
      { code: 'P_OD_02', label: 'Apresenta dor de dente ou infecção ativa?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Infecção/dor — prioridade clínica.', alertSeverity: 'WARNING' },
      { code: 'P_OD_03', label: 'Apresenta sensibilidade, erosão ou desgaste associado a vômitos?', type: 'YES_NO_DETAILS' },
      { code: 'P_OD_04', label: 'Possui dente quebrado, mobilidade ou dificuldade para mastigar?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'broken', label: 'Quebrado' }, { value: 'mobility', label: 'Mobilidade' }, { value: 'chewing', label: 'Mastigação' },
      ] },
      { code: 'P_OD_05', label: 'Quando ocorreu a última consulta odontológica?', type: 'SHORT_TEXT' },
    ],
  },
  {
    code: 'RISK',
    title: 'Avaliação de risco',
    questions: [
      { code: 'P_RISK_01', label: 'Frequência de escovação', type: 'SINGLE_CHOICE', options: [
        { value: '0', label: 'Não escova' }, { value: '1', label: '1x' }, { value: '2', label: '2x' }, { value: '3+', label: '3x+' },
      ] },
      { code: 'P_RISK_02', label: 'Frequência de fio dental', type: 'SINGLE_CHOICE', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'daily', label: 'Diário' },
      ] },
      { code: 'P_RISK_03', label: 'Consumo de açúcar entre refeições', type: 'SINGLE_CHOICE', options: [
        { value: 'low', label: 'Baixo' }, { value: 'moderate', label: 'Moderado' }, { value: 'high', label: 'Alto' },
      ] },
      { code: 'P_RISK_04', label: 'Frequência de vômitos ou refluxo', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'P_RISK_05', label: 'Classificação de risco médico-obstétrico', type: 'RISK_LEVEL', required: true },
      { code: 'P_RISK_06', label: 'Classificação de risco de cárie/erosão', type: 'RISK_LEVEL', required: true },
      { code: 'P_RISK_07', label: 'Necessita autorização ou contato com obstetra antes do procedimento?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Contato com obstetra necessário.', alertSeverity: 'WARNING' },
      { code: 'P_RISK_08', label: 'Condutas e restrições clínicas registradas pelo profissional', type: 'LONG_TEXT', required: true },
    ],
  },
  {
    code: 'SIGNATURE',
    title: 'Aceite e assinatura',
    questions: [
      { code: 'P_SIG_01', label: 'Declaro que as informações fornecidas sobre a gestação são verdadeiras.', type: 'ACKNOWLEDGEMENT', required: true },
      { code: 'P_SIG_02', label: 'Autorizo o uso das informações para planejamento seguro do atendimento.', type: 'ACKNOWLEDGEMENT', required: true },
    ],
  },
];

export const pregnantAnamnesisV1 = buildSchema({
  title: 'Anamnese gestante',
  audience: 'PREGNANT',
  sections,
});
