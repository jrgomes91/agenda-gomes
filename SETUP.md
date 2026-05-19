# Agenda Gomes — Guia de instalação nos 3 dispositivos

Tudo aqui é **100% grátis**. Você só precisa fazer 3 setups únicos (Github, Expo e EAS). Depois é só clicar.

---

## 1. Subir o código no GitHub (1x, ~5 min)

1. Crie uma conta grátis em https://github.com se ainda não tiver.
2. Crie um repositório **público** novo chamado `agenda-gomes` (Settings → New repository → Public).
3. No PowerShell, dentro da pasta do projeto:
   ```powershell
   git remote add origin https://github.com/SEU_USUARIO/agenda-gomes.git
   git add -A
   git commit -m "PWA + sync por JSON"
   git branch -M main
   git push -u origin main
   ```

## 2. Ativar o GitHub Pages (1x, ~2 min)

1. No repositório no GitHub: **Settings → Pages**
2. Em **Source**, selecione **GitHub Actions**
3. Volte em **Actions** e veja o workflow `Deploy PWA to GitHub Pages` rodando.
4. Quando terminar, o site fica em `https://SEU_USUARIO.github.io/agenda-gomes/`

A partir daqui, **cada `git push`** atualiza o site automaticamente.

---

## 3. Instalar no iPhone (PWA, 100% grátis)

1. No iPhone, abra a URL acima no **Safari** (precisa ser Safari, não Chrome).
2. Toque no botão **Compartilhar** (quadrado com seta para cima).
3. Role e toque em **Adicionar à Tela de Início**.
4. Pronto: ícone na home, abre em tela cheia, funciona offline.

> O botão **📲 Instalar** que aparece no topo do app só aparece no Android/desktop (Chrome) — no iPhone o caminho é via Safari como descrito acima.

---

## 4. Instalar no Samsung (celular + tablet)

Você pode escolher 2 caminhos:

### Caminho A — PWA (mais simples, mesma URL do iPhone)
1. No Chrome do Samsung, abra a URL do GitHub Pages.
2. Toque nos 3 pontinhos → **Adicionar à tela inicial** (ou no banner que aparecer).
3. Pronto.

### Caminho B — APK nativo (visual mais polido, melhor performance)
1. Crie conta grátis em https://expo.dev
2. No PowerShell:
   ```powershell
   npm install -g eas-cli
   eas login
   eas build:configure
   npm run build:apk
   ```
3. O EAS gera o APK na nuvem (free tier: 30 builds/mês).
4. No final aparece um link → baixe o `.apk` no Samsung.
5. Habilite **Fontes desconhecidas** nas configurações de segurança.
6. Toque no APK para instalar. Mesmo APK serve no celular **e** no tablet.

---

## 5. Sincronizar entre os 3 dispositivos

Por enquanto a sincronização é **manual por arquivo JSON** (100% grátis, sem nuvem):

1. No dispositivo de origem, clique em **📤 Exportar** no topo do app.
2. Será baixado um arquivo `agenda-gomes-AAAA-MM-DD.json`.
3. Envie esse arquivo para os outros dispositivos (WhatsApp para você mesmo, Google Drive, e-mail, etc.).
4. No dispositivo destino, abra o app e clique em **📥 Importar** → selecione o JSON.
5. Os itens são **mesclados** (não substituem), evitando perder o que já tem.

> Próxima evolução: integração com Microsoft Graph (login Outlook) para sync automático em tempo real. Me peça quando quiser.

---

## Comandos úteis (do projeto)

```powershell
npm run web         # rodar local em http://localhost:8081
npm run build:web   # gerar PWA em dist/
npm run host:web    # servir dist/ em http://localhost:3000
npm run build:apk   # gerar APK Android no EAS (precisa eas login)
```

---

## Resumo do que já foi feito

- ✅ Listas dinâmicas com cor/emoji editáveis, grupos, busca, hashtags, ordenação, tema escuro, sugestões Meu Dia, seção Concluído recolhível, anexos reais no web, pickers nativos de data/hora
- ✅ PWA configurada (manifest, service worker offline, meta tags iOS)
- ✅ Workflow do GitHub Actions para deploy automático
- ✅ Export/Import JSON para sync manual entre dispositivos
- ✅ `eas.json` configurado para APK Android
- ✅ TypeScript sem erros, build web validado

## O que falta (precisa da sua ação)

- ⏳ Você criar o repositório no GitHub e fazer o `git push`
- ⏳ Você ativar o GitHub Pages no Settings → Pages
- ⏳ (Opcional) Você fazer `eas login` se for gerar APK Android
- ⏳ (Opcional, futuro) Integração Microsoft Graph para sync automático
