# Pesquisa funcional — Central de Ajuda Codental

Pesquisa realizada em 5 de agosto de 2026. A referência foi usada apenas para compreender padrões funcionais; o Sonder Clinic mantém identidade, contratos, textos e implementação próprios.

## Artigos oficiais consultados

- [Como Criar e Organizar Tarefas no Codental](https://ajuda.codental.com.br/pt-br/codental-tarefas)
- [Conhecendo a Tela Inicial do Codental](https://ajuda.codental.com.br/pt-br/8149189-conhecendo-a-tela-inicial-do-codental-navegacao-e-principais-acessos)
- [Como Agendar, Editar e Excluir Consultas no Codental Connect](https://ajuda.codental.com.br/pt-br/10670511-como-agendar-editar-e-excluir-consultas-no-codental-connect)
- [Como usar o Controle de Próteses](https://ajuda.codental.com.br/pt-br/como-fazer-o-controle-de-pr%C3%B3tese-na-minha-cl%C3%ADnica)
- [Como Lançar Procedimentos para o Paciente](https://ajuda.codental.com.br/pt-br/8178893-como-lancar-procedimentos-para-o-paciente-no-codental)
- [Como Criar ou Alterar Procedimentos na Tabela de Valores](https://ajuda.codental.com.br/pt-br/8156394-como-criar-ou-alterar-procedimentos-na-tabela-de-valores-no-codental)
- [Assinatura do Paciente na Anamnese](https://ajuda.codental.com.br/pt-br/10269133-como-solicitar-a-assinatura-do-paciente-na-anamnese-respondida)
- [Receita, Atestado Digital e Certificado](https://ajuda.codental.com.br/pt-br/receita-atestado-digital-e-certificado)
- [Como emitir e validar certificado digital](https://ajuda.codental.com.br/pt-br/8857845-como-emitir-e-validar-seu-certificado-digital-no-codental)
- [Solicitações de exame com assinatura digital](https://ajuda.codental.com.br/pt-br/11786891-como-criar-solicitacoes-de-exame-com-assinatura-digital-do-dentista)
- [Codental Connect](https://ajuda.codental.com.br/pt-br/10670842-o-que-e-o-codental-connect-e-como-ele-pode-beneficiar-sua-clinica)

## Padrões funcionais úteis

- Tarefas têm contexto, responsável, prazo e estado; podem nascer na central, agenda ou prontuário.
- A agenda é ponto operacional e a edição acontece mantendo o contexto do calendário.
- Evolução é cronológica e ligada ao tratamento. Anamnese e documentos preservam evidências e estado de assinatura.
- Trabalhos laboratoriais usam quadro por etapas, prazo, histórico e alerta quando retornam sem consulta futura.
- Tratamento/orçamento conecta histórico clínico e financeiro; recebíveis devem manter esse vínculo.
- Integrações e comunicação exibem claramente estados configurado, inativo e erro.
- Receita/atestado deve permanecer rascunho até revisão profissional; assinatura só é declarada após provider e certificado válidos.

## Decisões próprias do Sonder Clinic

- Um `Modal` compartilhado fornece trap de foco, Esc, clique no fundo quando seguro, atributos ARIA e retorno de foco.
- “Automática” não é categoria clínica: origem continua no campo `source`; categoria clínica usa `category`; etiquetas configuráveis usam `AgendaTag`.
- Lembretes WhatsApp são registros reais. Sem conexão Evolution persistida, ficam `DISABLED` com motivo e nenhum evento de envio é criado. Com conexão, entram como `PENDING` na outbox.
- Nibo é o nome correto do provider já existente. Credenciais continuam AES-256-GCM, mascaradas e auditadas.
- Receitas são rascunhos reais no prontuário. O Sonder não replica a integração Memed nem alega validade/assinatura sem provider.
- Upload A1 pela web não foi simulado: o backend atual não possui storage multipart privado ativo. A tela expõe somente status seguro e orienta secret/path até a infraestrutura real existir.
- A Visão Diária não foi redesenhada.
