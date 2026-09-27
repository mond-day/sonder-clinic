// Conventional Commits: tipo(escopo opcional): assunto — ex.: "fix(nibo): enviar centro de custo".
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Assuntos em PT-BR costumam começar com sigla (OAuth, MOCK, CSP).
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 100],
  },
};
