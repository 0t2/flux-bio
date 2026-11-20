# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.8 - 2026-11-20

### Correções
- Desativar as páginas em um site com mais de umas 800 páginas publicadas sempre falhava. Agora ele as tira do ar algumas centenas por requisição e continua sozinho até terminar. [#57](https://github.com/0t2/flux-bio/pull/57)
- Restaurar um backup em um site com mais de umas 400 páginas e links curtos podia falhar ou deixar endereços antigos respondendo. Agora eles são limpos algumas centenas por requisição. [#57](https://github.com/0t2/flux-bio/pull/57)
- Desativar o carregamento de fontes do seu próprio site deixava a maioria dos arquivos de fonte para trás em um site com muitas páginas, e podia falhar. Agora eles são excluídos algumas centenas por requisição. [#57](https://github.com/0t2/flux-bio/pull/57)
- Uma alteração de configuração em um site grande podia iniciar mais trabalho do que uma requisição permite, e falhar. [#57](https://github.com/0t2/flux-bio/pull/57)

## 0.4.7 - 2026-11-20

### Segurança
- Uma senha de administração errada enviada como bearer token da API agora espera como o formulário de login, então a API não é um lugar mais rápido para adivinhá-la. [#56](https://github.com/0t2/flux-bio/pull/56)

### Correções
- Uma página cujo conteúdo é grande demais para publicar é recusada ao salvar, com o tamanho dela e o limite de 950 KB. Antes ela era salva e depois falhava ao publicar com um erro que não dizia nada. [#56](https://github.com/0t2/flux-bio/pull/56)
- Sem página inicial, o endereço do site oferecia uma página excluída ou movida, e não uma recém-publicada. [#56](https://github.com/0t2/flux-bio/pull/56)
- Uma alteração de configuração que foi salva mas não chegou aos visitantes é enviada na próxima vez que o painel for aberto, sem salvar de novo. [#56](https://github.com/0t2/flux-bio/pull/56)

## 0.4.6 - 2026-11-20

### Segurança
- O link de prévia de um rascunho não mostra mais o endereço de um link protegido por senha ou com o endereço oculto. Esse botão passa ali pelo link curto, como na página publicada. [#55](https://github.com/0t2/flux-bio/pull/55)
- A senha de um link aceita dez tentativas erradas em 15 minutos e depois nenhuma até esse tempo passar. Antes não havia limite. [#55](https://github.com/0t2/flux-bio/pull/55)
- Um endereço que não existe não custa mais quanto mais longo for. Procurar um endereço parecido podia levar várias vezes o limite de tempo de uma requisição em um site grande, e qualquer pessoa podia pedir endereços assim. [#55](https://github.com/0t2/flux-bio/pull/55)

### Correções
- Um link curto arquivado, uma página excluída ou o endereço antigo de uma página podiam voltar, e ficar, se alguém visitasse bem no momento da mudança. [#55](https://github.com/0t2/flux-bio/pull/55)
- Restaurar um backup não deixa mais redirecionando um link que o backup tem como arquivado. [#55](https://github.com/0t2/flux-bio/pull/55)
- Uma configuração salva enquanto outra coisa era salva é mantida, e uma mudança que chegou ao banco de dados mas não aos seus visitantes é enviada a eles quando você a faz de novo. [#55](https://github.com/0t2/flux-bio/pull/55)
- Dois itens com o mesmo id em uma página são recusados ao publicar: o link curto de um deles não teria funcionado. [#55](https://github.com/0t2/flux-bio/pull/55)

## 0.4.5 - 2026-11-20

### Correções
- O guia servido por um site de teste ou por uma cópia local não dá mais os comandos do site real: os deploys dele levam `--mode staging`, e ele não manda mais sua IA salvar esse guia como a skill do site real. [#52](https://github.com/0t2/flux-bio/pull/52)
- Em um Worker com mais de um site, “Remover o FluxBio” no guia não faz mais sua IA apagar o Worker inteiro e o banco de dados do primeiro site para tirar apenas um. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` passa a se basear na versão do seu Worker que está em execução, que nem sempre é a mais nova depois de uma reversão no painel do Cloudflare. `pnpm deploy:images` lê as imagens de um segundo site com o token desse site, e `pnpm reset-password --mode staging` não mexe mais nos tokens salvos do site real. [#52](https://github.com/0t2/flux-bio/pull/52)
- Rodar um site de teste no seu computador (`cf dev --mode staging`) não exige mais login no Cloudflare. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` responde que não sabe (`latest` é null) diante de uma versão ou de um registro de alterações que não consegue situar, em vez de dizer que está atualizado. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Correções
- `pnpm reset-password` agora confere se o endereço informado é servido pelo Worker que a sua pasta publica antes de alterar qualquer coisa. Executado com o endereço de um site de teste ou de um site local, como as páginas de login deles mostravam, ele substituía a senha do site real. Ele também passa a obter a lista de sites do Worker em execução, salva a senha antes de defini-la e diz qual site ficou sem token. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` examina todos os Workers da conta antes de criar um site novo: ele só via os dez primeiros, então um FluxBio mais abaixo na lista passava despercebido. Ele também para quando não consegue ler um Worker e não cria mais um site de teste para um site real que não existe. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` não substitui mais um arquivo seu quando uma nova versão passa a usar o mesmo nome, não perde um arquivo renomeado apenas nas maiúsculas e não para no meio quando um arquivo vira uma pasta. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` aceita qualquer nome de Worker que o Cloudflare aceite: com sublinhados e até 63 caracteres. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### Novidades
- `pnpm update:code` leva o código da sua pasta do FluxBio para a versão mais recente. Ele mostra o que a atualização traz, para se algum arquivo do FluxBio tiver sido alterado ali e não mexe nos seus próprios arquivos. O deploy continua sendo um passo à parte. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### Novidades
- As perguntas frequentes do fluxbio.link e o guia do seu site agora respondem a “Como recebo as novas versões?”: pergunte à sua IA, veja Configurações no painel ou acompanhe as versões do projeto no GitHub para receber um e-mail a cada uma. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### Novidades
- Configurações, no painel, avisa quando há uma versão mais nova do FluxBio, diz antes de tudo se ela traz uma correção de segurança e mostra a frase para dizer à sua IA para atualizar. Só consulta o GitHub quando você abre essa página, e quando seu site está atualizado isso aparece ao lado da versão, no rodapé. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Ação necessária
- Se você alterou `cloudflare.config.ts` (outro `WORKER_NAME`, um domínio próprio ou a remoção de `ANALYTICS`), coloque isso em `worker.json`, na sua pasta do FluxBio, antes de fazer o deploy desta versão; por exemplo, `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. Esse arquivo não faz parte do código, então as atualizações não mexem mais nele. Se você esquecer, o deploy para e diz qual nome escrever. [#45](https://github.com/0t2/flux-bio/pull/45)

### Novidades
- `pnpm run deploy` pergunta ao Cloudflare o que está em execução antes de enviar qualquer coisa, e interrompe um deploy que criaria um segundo site vazio, tiraria um dos seus sites do ar, substituiria outro Worker ou substituiria sua senha. Use-o no lugar de `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` define uma nova senha de administração e cria um novo token de API para cada um dos seus sites, sem exibir nenhum dos dois. O “Esqueceu a senha?” da página de login agora mostra esse comando. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### Novidades
- Se a pasta de onde você fez o deploy não existe mais, porque foi apagada ou ficou em outro computador, sua IA pode reconstruí-la: o guia do seu site traz os passos em `/api/guide/rebuild`, com o nome do seu Worker. Seu site continua funcionando enquanto isso, e nada do que está nele se perde. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### Novidades
- `GET /api/update` diz se há uma versão mais nova do FluxBio: quantas versões seu site está atrasado e se alguma corrige um problema de segurança ou tem uma “Ação necessária”. Ele lê este registro de alterações no GitHub, e só quando alguém pergunta. Sua IA consulta uma vez por conversa e avisa antes de tudo quando há uma correção de segurança esperando. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### Novidades
- As versões agora têm número. Um site diz qual está rodando em `version` de `GET /api/state` e no começo de `/llms.txt`, e cada título desta página é uma versão. O número diz o que a atualização exige: quando o número do meio muda (de 0.3.4 para 0.4.0), há uma “Ação necessária”, e quando só o último muda, basta fazer o deploy. Um site que ainda diz 0.2.1 é anterior a esta versão, então guie-se pelo dia em que ele foi atualizado pela última vez. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### Novidades
- Este changelog, aqui e em [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Ação necessária
- Atualize e reimplante para obter a correção da senha do link abaixo. Nada mais muda em seu site. [#38](https://github.com/0t2/flux-bio/pull/38)

### Segurança
- Uma senha no link de uma página pode ser ignorada: o endereço `/_c/<handle>/<id>/link` da página é respondido com o endereço real do link. Um link cujo botão passa por seu link curto (uma senha, um endereço oculto, endereços de dispositivos, tags UTM) não é mais distribuído ou contabilizado ali. [#38](https://github.com/0t2/flux-bio/pull/38)

### Correções
- A senha do link correto nunca chegou ao destino no Chromium. [#38](https://github.com/0t2/flux-bio/pull/38)
- A publicação não descarta mais o que foi digitado após o clique, e o salvamento automático durante uma publicação não é mais recusado. [#38](https://github.com/0t2/flux-bio/pull/38)
- Cada opção de configuração no painel envia apenas o que muda. Antes, alternar era possível desfazer o que a IA do proprietário havia definido desde então, incluindo o domínio e o fuso horário. [#38](https://github.com/0t2/flux-bio/pull/38)
- Limpar um site poderia deixar um banco de dados sem tabelas quando o KV recusasse uma exclusão e, após 5.000 chaves KV, ele parasse e dissesse que estava pronto. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Alterações
- A opção de configurações é chamada apenas de links curtos e ativada significa que as páginas de biografia estão desativadas. Ele recebeu o nome de páginas biográficas, mas descreveu o que acontece ao desativá-lo, então o proprietário de um site somente com links curtos leu-o ao contrário. [#37](https://github.com/0t2/flux-bio/pull/37)

### Correções
- `pnpm dev` falhou ao iniciar porque `cloudflare.config.ts` importou um módulo que o Worker também importa. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Ação necessária
- Se você enviar suas imagens como arquivos estáticos com `pnpm deploy:images`, implante esta versão e execute-a novamente: agora ela lê as imagens de cada site através do novo `GET /api/media/{id}` e reconstrói o pacote a partir delas. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Segurança
- A verificação de domínio personalizado está vinculada ao nome de host sobre o qual foi perguntado, portanto, uma verificação respondida para um nome de host não pode ser passada para outro. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- Em um Worker que contém mais de um site, as imagens de cada site enviadas como arquivos estáticos agora ficam em uma pasta desse site, e um site é exibido apenas em `/media/<id>`. Antes, todos os sites compartilhavam uma pasta. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Novidades
- `GET /api/media/{id}` fornece os bytes atuais de uma imagem para um token, para backups e para `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Alterações
- `pnpm deploy:images` baixa todas as imagens em cada execução, pois um upload ou restauração pode substituir um ID e verifica qual site e qual modo ele está lendo antes de fazer o download. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- O guia que a IA do proprietário lê faz backup com `GET /api/media/{id}` em uma pasta de instantâneo que nunca substitui e configura uma primeira página em uma ordem definida. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Ação necessária
- Se seu banco de dados foi aberto pela última vez por uma compilação anterior a `7b0bad4` deste dia, implante a compilação logo antes do squash (`8d0c435`) primeiro e abra o site uma vez, depois implante esta. As migrações foram compactadas em uma só, e um banco de dados que executou menos de dez dos antigos (`SELECT value FROM _meta WHERE key = 'schema_version'` abaixo de 10) agora é tratado como atualizado, portanto, perderia colunas e índices. Novas instalações e bancos de dados em 10 não são afetados. [#27](https://github.com/0t2/flux-bio/pull/27)
- Use pnpm 10.34.5 ou mais recente para instalar. O projeto agora nomeia pnpm 12.18.0 em `package.json`, e um pnpm mais antigo para com "Falha ao alternar pnpm". O instalador em `AGENTS.md` o substitui e suas etapas foram alteradas (`pnpm runtime set node 24 --global`, `bin` na pasta pnpm). As configurações do pnpm estão agora em `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Segurança
- As páginas de links carregam imagens apenas do próprio site (mais miniaturas do YouTube em uma página com vídeo), onde foram carregadas de qualquer endereço https. [#32](https://github.com/0t2/flux-bio/pull/32)
- O próprio CSS de uma página é lido como um navegador o lê antes de ser aceito e pode carregar apenas as imagens do próprio site. [#32](https://github.com/0t2/flux-bio/pull/32)

### Novidades
- Vários sites em um Worker, cada um com seu próprio banco de dados, KV, estatísticas, configurações e domínio, listados em `sites.json`. Sem esse arquivo, um Worker é um site, como antes. [#23](https://github.com/0t2/flux-bio/pull/23)
- Incorpore blocos que abrem o painel do Ko-fi ou do Calendly na página com um toque e um botão flutuante para ambos. Nada deles é carregado antes da torneira. [#28](https://github.com/0t2/flux-bio/pull/28)
- A IA do proprietário pode fornecer CSS próprio para uma página de links (`appearance.css`), então "fazer minha página ficar parecida com esta imagem" mantém a página de links. [#32](https://github.com/0t2/flux-bio/pull/32)
- O plano de fundo de uma página pode ser repetido em um tamanho definido, para padrões (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Os ícones sociais podem vir depois dos links (`appearance.socialPlace`), e o nome pode ser oculto, mas mantido como título da página (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Imagens que nada utiliza podem ser listadas e excluídas: `GET` e `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- As configurações mostram o plano, o tamanho do banco de dados e o uso diário da cota gratuita, e `pnpm usage` lê na conta. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- As estatísticas diárias são mantidas por 13 meses e depois mescladas em uma linha por mês, e cada contagem pode ser baixada como CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` envia as imagens de um site como arquivos estáticos, que não custam nenhuma solicitação de trabalho ou leitura de KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Um formulário de emissão para solicitar um novo bloco. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link possui um estimador de tráfego e custos. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Alterações
- Não há limite de páginas ou links curtos: nada que um visitante ou proprietário espere lê uma tabela inteira, e o painel carrega links curtos, uma tela cheia de cada vez. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Mais barato de executar: uma visualização de página leva uma leitura de KV, consultas D1 que não dependem umas das outras vão juntas, o painel pede menos ao Worker e uma visualização de página ocupa cerca de um terço da CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- As páginas e a visualização do painel solicitam ao Google uma fonte chinesa apenas com os caracteres que mostram, não a fonte inteira. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- O código que lia dados salvos em formatos mais antigos desapareceu: configurações e formatos de página antigos, arquivos de backup antigos, `ADMIN_TOKEN`, a página `/shorten` e endereços de painel antigos. [#27](https://github.com/0t2/flux-bio/pull/27)
- O prompt que instala o FluxBio baixa o código primeiro e faz com que o agente leia `AGENTS.md` da pasta, em todos os 13 idiomas. [#21](https://github.com/0t2/flux-bio/pull/21)
- O guia que a IA do proprietário lê é dividido em um pequeno guia principal e tópicos lidos quando necessário, e diz como cada tema colore os botões, como as fontes são carregadas e como fazer um padrão. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Uma implantação das ações do GitHub de um site FluxBio acontece apenas neste repositório e somente quando ele nomeia um site. Uma cópia não implanta nada. [#14](https://github.com/0t2/flux-bio/pull/14)

### Correções
- Falha ao salvar um domínio personalizado com 522 para cada domínio que deveria ser confirmado. [#35](https://github.com/0t2/flux-bio/pull/35)
- Uma página publicada antes de `appearance.css` existir respondeu 500 até ser publicada novamente. [#32](https://github.com/0t2/flux-bio/pull/32)
- O painel não coloca mais uma violação de CSP no console do navegador a cada carregamento. [#20](https://github.com/0t2/flux-bio/pull/20)
- Correções para uma IA reconstruir uma página a partir de capturas de tela: seletores de atributos CSS em endereços, `null` para imagens de capa e plano de fundo em `POST /api/themes` e nomes de temas no idioma do proprietário a partir de `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Novidades
- Primeiro lançamento público: link na biografia, links curtos e rastreamento de cliques em um Cloudflare Worker, executado pela IA do proprietário. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

