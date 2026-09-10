# Villafan Planejados

Catálogo de móveis planejados, área do cliente, conversas por solicitação e administração com histórico financeiro.

## Desenvolvimento

Node 22.13+ e npm. Instale com `npm run install:ci`, execute `npm run dev` e use o endereço local informado. `npm run build` gera a versão de produção.

## Ativar contas, dados e fotos

A interface funciona em prévia sem credenciais. Os exemplos de ambientes e preços são ilustrativos; o sistema não simula login nem envio bem-sucedido. Para usar de verdade:

1. Crie um projeto Supabase e execute `supabase/schema.sql` uma única vez no SQL Editor. Ele configura tabelas, políticas RLS e um bucket privado para fotos de até 5 MB. Em seguida execute `supabase/migrations/002_chat_finance.sql`, que adiciona conversas e financeiro. Se o banco inicial já existe, execute somente essa migração; não reaplique `schema.sql`.
2. Preencha `.env.local` com a URL e a chave pública publicável do projeto. Nunca use chave secret/service_role no navegador. As mesmas variáveis precisam existir no ambiente de hospedagem. Reinicie o servidor após alterá-las.
3. Em Authentication, configure a Site URL e as URLs de redirecionamento autorizadas, incluindo a origem local impressa pelo servidor e a origem de produção, tanto `/` como `/admin` em cada origem. Habilite confirmação de e-mail e configure o envio SMTP para produção.
4. Habilite o provedor Google no Supabase. No Google Cloud, configure o consentimento OAuth e o cliente Web, copie a URL de callback fornecida pelo Supabase e registre-a nas URLs de redirecionamento. Salve o client ID e o client secret somente no painel do Supabase, nunca no código.
5. Cadastre a conta do administrador pela interface e confirme o e-mail. No SQL Editor, atribua o administrador com a instrução abaixo, substituindo o e-mail pelo endereço real. Novos cadastros nunca recebem essa função automaticamente.

```sql
insert into public.admins(user_id)
select id from auth.users where email = 'EMAIL_REAL_DO_ADMINISTRADOR'
on conflict do nothing;
```

6. Saia e entre novamente. Acesse `/admin` para entrar no painel. Contas comuns recebem a mensagem de acesso restrito. Não existe senha administrativa fixa no código. Cadastre projetos e valores reais; com o serviço configurado o catálogo inicia vazio, sem publicar os preços fictícios da prévia.

## O que está implementado

- Catálogo público com filtros e estudos visuais de ambientes.
- Login com e-mail/senha, cadastro com confirmação de e-mail e Google via Supabase Auth (PKCE).
- Solicitações com nome, contato, ambiente, descrição e até 5 fotos.
- Fotos em armazenamento privado, acessíveis por URLs de curta duração.
- Cada cliente só consulta seus próprios pedidos. Administradores veem os pedidos e alteram o andamento.
- Administração cadastra e edita o catálogo. As políticas de banco controlam a função administrativa, mesmo em chamadas diretas à API.
- Chat privado por solicitação, com remetente e horário definidos no banco, carregamento de mensagens anteriores e atualização a cada 5 segundos enquanto a aba está visível. Mensagens não podem ser editadas ou apagadas pela API.
- Financeiro exclusivo do administrador: entradas, saídas, saldo acumulado, forma de pagamento, data, autor e vínculo opcional ao pedido. O saldo reflete os lançamentos registrados, não uma conta bancária.
- Histórico financeiro imutável para usuários da aplicação. Correções geram estornos de mesmo valor e sentido contrário. RPCs transacionais impedem duplicação por repetição da mesma operação e estornos repetidos.
- A prévia sem credenciais mostra um pedido, conversa e financeiro fictícios; envio e gravação permanecem desativados. Esses exemplos não são gravados no banco e somem quando a conexão é configurada.
- Layout responsivo, rótulos dos campos, foco visível e diálogos acessíveis para chat e financeiro.

## Limites desta entrega

A ativação depende de um projeto Supabase e do cliente OAuth Google. Sem essa configuração, autenticação, envio, persistência e regras de isolamento não podem ser testados de ponta a ponta. As ilustrações não são fotografias de trabalhos realizados. Não foi configurado domínio nem publicação. Antes de receber clientes, validar com duas contas de cliente e uma administrativa, revisar valores, identidade e fotos reais, configurar entrega de e-mails e testar o login Google na origem final. O fluxo de recuperação de senha não está incluído nesta primeira versão.

## Referências

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control

## Testes de permissões

O teste em `supabase/tests/permissions.mjs` executa o schema e a migração em PostgreSQL embarcado (PGlite), com adaptadores locais mínimos para `auth.uid()` e Storage. Verifica clientes distintos, administração, acesso anônimo, remetente de mensagens, imutabilidade, valores inválidos, idempotência e estornos. Não substitui o teste de OAuth, e-mails, Storage HTTP ou sessões reais no Supabase.

Para repetir sem alterar as dependências do site:

```powershell
npm install --prefix work/sql-tests @electric-sql/pglite
$env:PGLITE_TEST_ROOT = (Resolve-Path work/sql-tests).Path
node supabase/tests/permissions.mjs
```
