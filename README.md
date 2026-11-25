# Electro Shop — Frontend

Loja online e painel de gestão em **HTML5, CSS3 e JavaScript (ES modules)**, sem frameworks nem build.
Consome a API do backend (`electro-shop-backend`). Todos os preços, stock, descontos, permissões e
pagamentos são decididos pelo servidor; o frontend só mostra e envia pedidos.

## Arranque

1. Arranque o backend (ver README do backend) em `http://localhost:3333`.
2. No `.env` do backend:
   ```
   FRONTEND_URL=http://localhost:5173
   CORS_ORIGINS=http://localhost:5173
   ```
   O `FRONTEND_URL` é usado nos links dos emails (confirmar email, recuperar password) e nas
   mensagens de WhatsApp (link do produto).
3. Sirva esta pasta com qualquer servidor estático:
   ```bash
   python3 -m http.server 5173
   # ou: npx serve -l 5173 .
   ```
4. Abra `http://localhost:5173`. Painel: `http://localhost:5173/admin/` (conta OWNER do seed).

Os ES modules exigem HTTP: abrir os ficheiros diretamente (`file://`) não funciona.

## Configuração

Tudo está em `js/config.js` — é o único ficheiro com o URL da API e os dados da loja:

| Chave | Descrição |
|---|---|
| `API_BASE_URL` | Base da API (ex.: `https://api.loja.co.mz/api/v1`) |
| `STORE_NAME`, `STORE_CURRENCY`, `STORE_LOCALE` | Nome, moeda (`MZN`) e locale |
| `WHATSAPP_NUMBER` | Só reserva. O número oficial vem do backend (`GET /whatsapp/config`) e é gerido em Configurações → WhatsApp |
| `PAGE_SIZE`, `SEARCH_DEBOUNCE_MS`, `REQUEST_TIMEOUT_MS` | Afinação da listagem e pesquisa |

Para mudar sem editar o ficheiro (ex.: por ambiente), defina antes dos scripts:

```html
<script>window.__ELECTRO_CONFIG__ = { API_BASE_URL: 'https://api.loja.co.mz/api/v1' };</script>
```

Em produção sirva frontend e API em HTTPS, de preferência no mesmo domínio-pai, e ative
`COOKIE_SECURE=true` no backend.

## Segurança

- Sessão por **cookies HTTP-only** (`credentials: 'include'`); o JavaScript nunca vê tokens.
  Em 401 o cliente tenta um único `POST /auth/refresh` e repete o pedido.
- No navegador guarda-se apenas: um indicador `es_has_session` (sem dados), artigos “guardados para
  depois” e a chave de idempotência do checkout (sessionStorage). Nunca passwords, tokens ou chaves.
- Todo o HTML dinâmico passa pelo template `html\`\`` que escapa valores (proteção contra XSS).
- O painel esconde o que o utilizador não pode usar, mas cada rota `/admin/*` é validada no servidor.
- Formulários de autenticação usam `method="post"` e só ficam ativos quando o JS carrega
  (a password nunca vai parar ao URL).

## Estrutura

```
index.html shop.html product.html cart.html checkout.html …   páginas da loja
admin/*.html                                                    painel (um ficheiro por secção)
css/
  fonts.css global.css components.css responsive.css           base, componentes, breakpoints
  shop.css product.css account.css checkout.css admin.css       por área
js/
  config.js      configuração central
  api.js         cliente HTTP único (erros, refresh, idempotência, uploads)
  store.js       estado global (utilizador, carrinho, favoritos, notificações)
  i18n.js        textos e mensagens de erro (por errorCode da API)
  utils.js       html seguro, formatação MZN, datas, estados
  ui.js          toasts, modais, estados loading/vazio/erro/offline, cards, SEO
  layout.js      cabeçalho, pesquisa, menus, rodapé, botão WhatsApp
  auth.js cart.js wishlist.js products.js orders.js reviews.js notifications.js whatsapp.js addresses.js
  pages/*.js     uma por página da loja
  admin/*.js     painel: layout, tabela, formulários, gráficos e uma por secção
assets/          fontes (Bricolage Grotesque, Figtree — OFL) e ícones
```

## Convenções

- Valores monetários chegam em **centavos** e mostram-se como `65.000 MZN` (`formatMoney`).
  No painel escreve-se em MZN (`1250,50`) e o formulário converte para centavos.
- Breakpoints mobile-first: 320 / 768 / 1024 / 1440 px.
- Erros da API (400–500) são traduzidos por `errorCode` em `i18n.js`; nunca se usa `alert()`.
- Para adicionar uma língua, acrescente um dicionário em `i18n.js` e altere `STORE_LOCALE`.
# e-commerce-frontend
