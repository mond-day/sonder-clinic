import { buildSchema, type SeedSection } from './builder';

const sections: SeedSection[] = [
  {
    code: 'IDENTIFICATION',
    title: 'Identificação',
    questions: [
      { code: 'A_ID_01', label: 'Qual é a queixa principal e o motivo da consulta?', type: 'LONG_TEXT', required: true },
      { code: 'A_ID_02', label: 'Quando os sintomas ou a necessidade percebida começaram?', type: 'SHORT_TEXT' },
      { code: 'A_ID_03', label: 'Qual é a intensidade atual do desconforto?', type: 'SCALE_0_10', alertSeverity: 'WARNING', alertMessage: 'Dor intensa relatada (≥ 8).' },
      { code: 'A_ID_04', label: 'Existe algum fator que piora ou alivia os sintomas?', type: 'LONG_TEXT' },
      { code: 'A_ID_05', label: 'Qual é a expectativa do paciente em relação ao tratamento?', type: 'LONG_TEXT' },
      { code: 'A_ID_06', label: 'Possui médico responsável ou acompanhamento médico atual?', type: 'YES_NO_DETAILS', detailsLabel: 'Nome e contato' },
    ],
  },
  {
    code: 'MEDICAL',
    title: 'Histórico médico',
    questions: [
      { code: 'A_MED_01', label: 'Possui hipertensão arterial?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Hipertensão relatada.', alertSeverity: 'WARNING' },
      { code: 'A_MED_02', label: 'Possui diabetes?', type: 'YES_NO_DETAILS', required: true, detailsLabel: 'Tipo, controle e última HbA1c', alertMessage: 'Diabetes relatada.', alertSeverity: 'WARNING' },
      { code: 'A_MED_03', label: 'Possui doença cardíaca, arritmia, histórico de infarto ou cirurgia cardíaca?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Risco cardíaco crítico.', alertSeverity: 'CRITICAL' },
      { code: 'A_MED_04', label: 'Possui distúrbio de coagulação, anemia grave ou histórico de sangramento prolongado?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Risco de sangramento.', alertSeverity: 'CRITICAL' },
      { code: 'A_MED_05', label: 'Possui doença renal?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença renal relatada.' },
      { code: 'A_MED_06', label: 'Possui doença hepática ou histórico de hepatite?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença hepática relatada.' },
      { code: 'A_MED_07', label: 'Possui doença respiratória, asma ou apneia do sono?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Doença respiratória relatada.' },
      { code: 'A_MED_08', label: 'Possui epilepsia, convulsões ou condição neurológica?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Condição neurológica relatada.' },
      { code: 'A_MED_09', label: 'Possui doença autoimune, câncer ou está em tratamento imunossupressor?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Imunossupressão/câncer relatados.', alertSeverity: 'CRITICAL' },
      { code: 'A_MED_10', label: 'Possui doença infecciosa relevante ou condição transmissível em acompanhamento?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Condição infecciosa relatada.' },
    ],
  },
  {
    code: 'MEDS_ALLERGIES',
    title: 'Medicamentos e alergias',
    questions: [
      { code: 'A_RX_01', label: 'Utiliza medicamentos continuamente?', type: 'YES_NO_DETAILS', required: true, detailsLabel: 'Nome, dose e frequência' },
      { code: 'A_RX_02', label: 'Utiliza anticoagulante ou antiagregante plaquetário?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Uso de anticoagulante/antiagregante.', alertSeverity: 'CRITICAL' },
      { code: 'A_RX_03', label: 'Utiliza bisfosfonato, denosumabe ou medicamento relacionado ao metabolismo ósseo?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Medicamento ósseo — atenção a cirurgia/implante.', alertSeverity: 'CRITICAL' },
      { code: 'A_RX_04', label: 'Possui alergia a medicamentos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia a medicamentos.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'A_RX_05', label: 'Possui alergia a anestésicos, látex, metais ou materiais odontológicos?', type: 'YES_NO_DETAILS', required: true, alertMessage: 'Alergia a materiais odontológicos.', createPatientAlert: true, alertSeverity: 'CRITICAL' },
      { code: 'A_RX_06', label: 'Já realizou cirurgia, internação ou transfusão relevante?', type: 'YES_NO_DETAILS', detailsLabel: 'Data e intercorrências' },
    ],
  },
  {
    code: 'DENTAL',
    title: 'Histórico odontológico',
    questions: [
      { code: 'A_OD_01', label: 'Quando ocorreu a última consulta odontológica?', type: 'SHORT_TEXT' },
      { code: 'A_OD_02', label: 'Com que frequência costuma realizar consultas odontológicas?', type: 'SINGLE_CHOICE', options: [
        { value: 'semestral', label: 'Semestral' }, { value: 'anual', label: 'Anual' }, { value: 'esporadica', label: 'Esporádica' }, { value: 'primeira', label: 'Primeira consulta' },
      ] },
      { code: 'A_OD_03', label: 'Já teve experiência negativa ou medo de tratamento odontológico?', type: 'YES_NO_DETAILS', alertMessage: 'Ansiedade odontológica relatada.', alertSeverity: 'WARNING' },
      { code: 'A_OD_04', label: 'Apresenta sangramento gengival?', type: 'SINGLE_CHOICE', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'A_OD_05', label: 'Apresenta sensibilidade dentária?', type: 'YES_NO_DETAILS', detailsLabel: 'Estímulo e região' },
      { code: 'A_OD_06', label: 'Possui bruxismo ou apertamento?', type: 'SINGLE_CHOICE', options: [
        { value: 'no', label: 'Não' }, { value: 'suspect', label: 'Suspeita' }, { value: 'diagnosed', label: 'Diagnosticado' },
      ] },
      { code: 'A_OD_07', label: 'Já sofreu trauma em dentes, face ou mandíbula?', type: 'YES_NO_DETAILS', detailsLabel: 'Data e região' },
      { code: 'A_OD_08', label: 'Utiliza ou já utilizou prótese, aparelho ortodôntico, implante ou placa?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'protese', label: 'Prótese' }, { value: 'ortodontia', label: 'Aparelho' }, { value: 'implante', label: 'Implante' }, { value: 'placa', label: 'Placa' },
      ] },
    ],
  },
  {
    code: 'HABITS',
    title: 'Hábitos e rotina',
    questions: [
      { code: 'A_HAB_01', label: 'Fuma ou utiliza nicotina?', type: 'SINGLE_CHOICE_DETAILS', required: true, options: [
        { value: 'no', label: 'Não' }, { value: 'yes', label: 'Sim' }, { value: 'former', label: 'Ex-fumante' },
      ], detailsLabel: 'Quantidade e tempo de uso' },
      { code: 'A_HAB_02', label: 'Consome bebida alcoólica?', type: 'SINGLE_CHOICE_DETAILS', options: [
        { value: 'never', label: 'Nunca' }, { value: 'social', label: 'Social' }, { value: 'frequent', label: 'Frequente' },
      ] },
      { code: 'A_HAB_03', label: 'Quantas vezes escova os dentes por dia?', type: 'SINGLE_CHOICE', options: [
        { value: '0', label: 'Não escova' }, { value: '1', label: '1x' }, { value: '2', label: '2x' }, { value: '3+', label: '3x ou mais' },
      ] },
      { code: 'A_HAB_04', label: 'Com que frequência utiliza fio dental?', type: 'SINGLE_CHOICE', options: [
        { value: 'never', label: 'Nunca' }, { value: 'sometimes', label: 'Às vezes' }, { value: 'daily', label: 'Diariamente' },
      ] },
      { code: 'A_HAB_05', label: 'Possui consumo frequente de açúcar, bebidas ácidas ou lanches entre refeições?', type: 'MULTIPLE_CHOICE', options: [
        { value: 'sugar', label: 'Açúcar' }, { value: 'acid', label: 'Bebidas ácidas' }, { value: 'snacks', label: 'Lanches entre refeições' },
      ] },
      { code: 'A_HAB_06', label: 'Possui hábito de roer unhas, morder objetos, respirar pela boca ou outro hábito oral?', type: 'MULTIPLE_CHOICE_DETAILS', options: [
        { value: 'nails', label: 'Roer unhas' }, { value: 'objects', label: 'Morder objetos' }, { value: 'mouth_breathing', label: 'Respiração bucal' }, { value: 'other', label: 'Outro' },
      ] },
    ],
  },
  {
    code: 'RISK',
    title: 'Avaliação de risco',
    questions: [
      { code: 'A_RISK_01', label: 'Classificação de risco médico sistêmico', type: 'RISK_LEVEL', required: true },
      { code: 'A_RISK_02', label: 'Classificação de risco de cárie', type: 'RISK_LEVEL', required: true },
      { code: 'A_RISK_03', label: 'Classificação de risco periodontal', type: 'RISK_LEVEL', required: true },
      { code: 'A_RISK_04', label: 'Classificação de ansiedade odontológica', type: 'RISK_LEVEL', required: true },
    ],
  },
  {
    code: 'SIGNATURE',
    title: 'Aceite e assinatura',
    questions: [
      { code: 'A_SIG_01', label: 'Declaro que as informações fornecidas são verdadeiras e completas.', type: 'ACKNOWLEDGEMENT', required: true },
      { code: 'A_SIG_02', label: 'Autorizo o uso das informações para planejamento e segurança do atendimento.', type: 'ACKNOWLEDGEMENT', required: true },
    ],
  },
];

export const adultAnamnesisV1 = buildSchema({
  title: 'Anamnese adulto',
  audience: 'ADULT',
  sections,
});
