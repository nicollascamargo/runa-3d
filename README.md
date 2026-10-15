# Runa 3D

> ⚠️ **Versão de teste.** O Runa 3D ainda está em desenvolvimento e esta é uma versão para vocês testarem e darem opinião. **Ele vai receber atualizações futuras**, com novidades, ajustes e correções. Pode ter bugs: se encontrar algum, conte nas [Issues](https://github.com/nicollascamargo/runa-3d/issues).

RPG tático em 3D controlado pelos **gestos da mão** na webcam. Com o **Mago**, você traça runas no ar com o dedo para lançar magias de fogo, gelo, raio e terra. Com o **Guerreiro**, golpeia com a espada, ergue o escudo, faz investidas e abala o chão. Tudo num tabuleiro dentro de uma caverna, em combate por turnos.

## ▶ Jogar agora

**[Jogar no navegador](https://nicollascamargo.github.io/runa-3d/)**: use o **Google Chrome** num computador.

Ou baixe a versão de teste em **[Releases](https://github.com/nicollascamargo/runa-3d/releases)**, descompacte e abra o `index.html` no Chrome.

## Como jogar

- **Câmera:** clique em **Ligar câmera** (ou aperte `C`) e aceite o pedido. O vídeo é processado no seu próprio computador: não é gravado nem enviado para lugar nenhum. Sem câmera, dá para jogar com o mouse e o teclado.
- **Trocar de personagem:** `Tab`, ou os botões **Mago | Guerreiro**.
- **Mover:** com a pinça (polegar encostando no indicador) você pega o personagem e o leva pelo ar até uma casa livre; com o mouse, aperte o botão em cima dele e arraste. O guerreiro também anda: com ele selecionado, aponte (ou clique) numa casa verde.
- **Mago:** mão aberta (segure) abre a roda de magias; aponte para uma magia e feche o punho; passe o indicador por cima da runa que aparece; escolha o alvo e feche o punho para lançar. No teclado: `M`, as teclas `1` a `8` e `Enter`.
- **Guerreiro:** com ele selecionado e parado, faça o gesto da habilidade (ou aperte `1` a `6`):

  | Habilidade | Gesto |
  | --- | --- |
  | Corte Horizontal | indicador e médio juntos (a "espada"), varrendo para o lado |
  | Golpe Devastador | punho fechado descendo rápido |
  | Guarda de Ferro | palma aberta parada por um instante |
  | Investida | punho fechado subindo rápido |
  | Contra-ataque | V com os dedos abertos, parado por um instante |
  | Onda de Choque | círculo desenhado com o indicador |

- **Encerrar o turno:** polegar para cima (segure) ou `N`. Os inimigos agem e o turno volta para você.
- **Treinar:** `Y` liga o treino do guerreiro (os golpes não gastam nada) e `O` abre o treino de runas.

## O que vem por aí

Esta é a primeira versão de teste. As próximas atualizações vão trazer ajustes nos gestos e no equilíbrio do combate a partir do que vocês testarem, além de correções e conteúdo novo. Acompanhe o repositório (botão **Watch**) para saber quando sair uma versão nova.

## Feedback

Encontrou um bug, um gesto que não funciona com a sua câmera ou tem uma ideia? Abra uma [Issue](https://github.com/nicollascamargo/runa-3d/issues) contando o que aconteceu, qual navegador e computador você usou e, se der, um print.

---

## Sobre o projeto (documentação técnica)

Protótipo 3D do RPG tático controlado por gestos. Fase 1, focada no mago: personagem, animações e magias, num tabuleiro 8×8 dentro de uma caverna.

Já estão prontas três etapas:

- **Etapa A:** o personagem 3D e a arena.
- **Etapa B:** a telecinese. Você pega o mago, ele levita, vai pelo ar e pousa numa casa livre. Funciona com o mouse ou com a mão na câmera, usando o sistema de gestos do Runa 2D.
- **Etapa D:** as oito magias elementais, conjuradas traçando runas no ar com o indicador, com animação, efeitos visuais, dano, mana, recarga e efeitos de status; combate por turnos e arena de treino.
- **Guerreiro completo:** a segunda classe jogável, com as **seis habilidades prontas** do gesto ao dano: Corte Horizontal, Golpe Devastador, Guarda de Ferro, Investida, Contra-ataque e Onda de Choque, cada uma com gesto próprio, animação em fases, efeitos e regras táticas (veja "O guerreiro completo", abaixo).
- **Telecinese do guerreiro e runas mais fáceis:** o guerreiro é levado pela pinça como o mago; as runas ganharam três níveis de dificuldade (Fácil, guiada, é o padrão), um traçado guiado mais claro e tolerante, um reconhecimento livre calibrado e um treino de runas.
- **Runa Vision 2.0:** cursor da mão com um filtro só (menos tremor e menos atraso), pinça nova (limites pessoais, confirmação curta, folga quando a mão some), contextos de interação centralizados, calibração do jogador passo a passo, painel de diagnóstico e modo de avaliação com a webcam real.

As etapas seguintes estão no fim deste arquivo.

## Como rodar

Abra o `index.html` no **Google Chrome**: clique com o botão direito no arquivo, escolha **Abrir com › Google Chrome**. Se o Chrome já for o seu navegador padrão, dois cliques bastam.

Não precisa de servidor nem de Terminal. O jogo inteiro está num arquivo só, o `jogo.js`, e por isso o macOS não bloqueia nada. A cena leva uns 2 a 5 segundos para montar, porque as texturas são geradas na hora.

O Three.js está dentro do projeto, então com o mouse o jogo roda sem internet. Duas coisas vêm da internet:

- **As fontes do título**, do Google Fonts. Sem internet, o navegador usa outra fonte.
- **O leitor de mãos do MediaPipe**, baixado na primeira vez que você liga a câmera (cerca de 8 MB). Depois ele fica no cache do navegador.

**Para jogar com a mão:**

1. Clique em **Ligar câmera** (ou aperte `C`).
2. Aceite o pedido de acesso à câmera. Aberto direto do arquivo, o Chrome pode perguntar de novo a cada vez que você abrir o jogo.

O vídeo é processado no seu computador e não é gravado nem enviado. No Safari o jogo abre, mas a câmera pode não funcionar: use o Chrome.

### O `iniciar.command` e o aviso do macOS

O `iniciar.command` liga um servidor local e abre o jogo em `http://localhost:8001`. Agora ele só é necessário em dois casos:

- **Para abrir um modelo de arquivo** (`?modelo=`, veja abaixo), porque o navegador não lê `.glb` direto do disco.
- **Para usar o `dev.html`**, que lê o código de `src/` sem passar pelo `jogo.js`.

Arquivos baixados da internet ou copiados por outro app ganham uma marca de quarentena. Por causa dela, o macOS recusa abrir o `iniciar.command` e mostra o aviso "não foi aberto". Para tirar a marca da pasta inteira, uma vez só, abra o Terminal e rode:

```bash
xattr -dr com.apple.quarantine ~/Documents/runa-3d
```

Outro jeito: tente abrir uma vez, vá em **Ajustes do Sistema › Privacidade e Segurança**, role até o aviso sobre o `iniciar.command` e clique em **Abrir Mesmo Assim**.

### Depois de mexer no código

O `index.html` usa o `jogo.js`, que é gerado a partir de `src/`. Mudou algo em `src/`? Gere o arquivo de novo (precisa do Node.js):

```bash
npm install      # só na primeira vez
npm run build
```

Para testar sem gerar o arquivo, use o `iniciar.command` e abra `http://localhost:8001/dev.html`.

## Runa Vision 2.0 (visão computacional e gestos)

### Como usar

- **Calibrar a mão** (painel ou cartão da câmera): cinco passos de poucos segundos.
  1. Mão aberta.
  2. Pinça três vezes.
  3. Apontar com o indicador.
  4. Passear a mão até os cantos e parar no meio.
  5. Traçar um círculo.

  No fim, a janela mostra as medidas e o que cada uma muda. **Salvar e usar** aplica tudo e fica guardado no navegador; **Apagar a calibração da mão** volta ao padrão. Enquanto calibra, a mão não aciona nada no jogo.
- **Diagnóstico da visão** (tecla `X`): mostra o que a câmera e o jogo estão lendo agora:
  - quadros por segundo da câmera e da tela;
  - tempo da inferência e da captura até o comando;
  - os pontos da mão;
  - o cursor cru e o filtrado, com o rastro de 2 s;
  - o tremor do último meio segundo;
  - a pinça (medida, limites e estado);
  - os gestos, o contexto de interação e o último resultado das runas.
- **Avaliar a câmera** (painel ou diagnóstico): três provas com a sua mão e a sua câmera.
  1. Ficar parado num alvo: tremor.
  2. Seguir um alvo em movimento: erro e atraso, que inclui a sua reação.
  3. Oito pedidos de "feche" e "abra" a pinça: acertos, tempo de reação e cliques falsos com a mão aberta.

  Também mede os quadros por segundo e as latências. **Repetir com o cursor antigo** roda o mesmo teste com o cursor de antes, para comparar os dois com a mesma câmera. Os resultados ficam no navegador (as últimas 20 avaliações) e saem em JSON.

### O que estava causando os problemas e o que mudou

**Cursor com tremor e atraso:**

| Causa | O que mudou |
|---|---|
| O filtro trabalhava em pixels de tela: o mesmo gesto mudava de comportamento conforme a tela | Um filtro só (`src/input/hand/CursorFilter.js`), na área da câmera, igual em qualquer tela |
| A velocidade era estimada de pontos crus e com corte baixo: parado, o tremor passava; ao arrancar, o filtro demorava a soltar | One Euro em 2D, com a velocidade estimada já sem o tremor fino |
| Os filtros usavam a hora do processamento | A hora da captura de cada quadro (`requestVideoFrameCallback`) |
| Um erro de um quadro do MediaPipe virava salto do cursor | Recusa de salto de um quadro só (a não ser que o quadro seguinte confirme) |
| A âncora ficava a 35% do caminho até a ponta do dedo, o ponto que mais treme | Âncora perto do nó do indicador (15%) |
| O cursor só andava a cada quadro da câmera (30 por segundo), em degraus | Desenhado na tela com um adiantamento pequeno entre quadros, sem passar da última posição medida |
| O freio da pinça congelava o cursor com a mão parada e meio fechada | O freio só age com os dedos fechando de verdade |

**Pinça que às vezes não pega ou não solta** (`src/input/hand/PinchDetector.js`):

- A medida é a distância polegar–indicador dividida pela palma, em 3D, a mesma para fechar e abrir. Antes, soltar usava a menor medida entre 3D e 2D, que com a mão de lado prendia o personagem.
- Histerese, suavização curta e confirmação de 2 quadros: um quadro solto não clica.
- A pinça com o indicador curvado agora vale; o punho continua não valendo.
- Segurando um personagem, a mão pode sumir até 0,7 s.
- Limites pessoais vindos da calibração.
- O anel do cursor fecha conforme os dedos e muda de cor por estado: fechando, pinça, abrindo.

**Gestos confundidos:** um lugar só decide o que a mão pode fazer em cada momento (`src/input/InteractionContext.js`, com 15 contextos):

- **mago livre:** pinça e gestos do mago;
- **guerreiro pronto:** golpes de mão e polegar para cima;
- **segurando:** a pinça só solta;
- **desenhando:** caneta, e a pinça não é clique;
- **conjurando:** nada aciona;
- **calibrando e avaliando:** nada aciona no jogo.

**Runas:** o trabalho da rodada anterior continua (Fácil guiado com 72%, interrupções, continuidade, desenho livre calibrado, treino). Agora a caneta usa a hora da captura, e a calibração ajusta quando a "caneta" encosta para a sua mão.

### Resultados medidos (simulação, sem webcam)

Com mãos sintéticas: ruído suposto do MediaPipe, 30 quadros por segundo com intervalo irregular, quadros perdidos e falhas de um quadro, numa tela de 1440×900. **Não é a precisão com uma webcam de verdade**: para isso, use a avaliação acima.

| Cursor (`npm test`, `tests/cursor.test.mjs`) | Antes | Agora |
|---|---|---|
| Tremor com a mão parada | 6,5 px | 1,9 px |
| Maior desvio parado (com falhas de um quadro) | 37,4 px | 4,4 px |
| Atraso movendo devagar | 41 ms | 20 ms |
| Atraso movendo rápido | 14 ms | 4 ms |
| Assentar depois de apontar (0,35 da tela em 200 ms) | 113 ms | 28 ms |
| Na tela, distância do cursor à mão (devagar / rápido) | 23 / 118 px | 14 / 96 px |
| Passou do ponto numa parada brusca | 4 px | 7 px |

Só o filtro novo, com a âncora antiga, já dá 2,8 px de tremor e 22 ms de atraso. A parte que vem da âncora depende do ruído suposto para o nó do dedo e precisa ser confirmada com a câmera.

| Pinça (`tests/pinch.test.mjs`, 200 tentativas cada) | Antes | Agora |
|---|---|---|
| Pinça normal: agarra e solta uma vez | 100% | 100% |
| Quem abre pouco a mão (0,62) e de lado consegue soltar | 0% | 98,5% (calibrado: 100%) |
| Pinça com o indicador curvado | 0% | 100% |
| Mão aberta tremendo 4 s, com quadros soltos: nenhum clique falso | 8% | 99% |
| A mão some 600 ms segurando um personagem: continua na mão | 0% | 100% |
| Pinça incompleta (para a 0,42) ou punho: não agarra | 100% | 100% |
| Tempo do meio do fechamento até agarrar | 59 ms | 94 ms |

Agarrar ficou uns 35 ms mais lento, em troca de quase nenhum clique falso. A posição do clique continua sendo a de antes de os dedos fecharem.

### Testes

- **Sem navegador** (`npm test`), além dos anteriores, que continuam passando:

  | Arquivo | O que cobre |
  |---|---|
  | `tests/cursor.test.mjs` (14, bancada em `tests/cursorBench.mjs`) | tremor, atraso, arrancada, assentar, salto de um quadro, perda de rastreamento, tela de qualquer tamanho, adiantamento |
  | `tests/pinch.test.mjs` (14) | pinça normal, quem abre pouco, incompleta, mão tremendo, indicador curvado, punho, mão sumindo, tempo de reação, freio, calibração |
  | `tests/interaction.test.mjs` (63) | os contextos de interação |
  | `tests/calibration.test.mjs` (15) | a medição dos cinco passos da calibração, com mãos sintéticas pela mesma leitura da câmera |
- **No navegador** (`index.html?testes`): 205 verificações. As 21 novas cobrem:
  - o diagnóstico (números, rastro, pinça e contexto);
  - a calibração de ponta a ponta com a mão sintética passando pelo `HandInput`, inclusive a pinça em cima do mago **sem pegá-lo** enquanto calibra e a runa de teste traçada;
  - salvar o perfil e a pinça continuar pegando o mago;
  - Esc cancelando sem mudar nada;
  - a avaliação bloqueando o jogo e Esc parando.

### Desempenho

A inferência continua sendo uma instância só do MediaPipe, uma vez por quadro de vídeo; o MediaPipe não foi substituído. As partes novas (filtro, pinça e contexto) custam frações de milissegundo por quadro. O diagnóstico e a avaliação só gastam com o painel aberto. O tempo real de inferência e da captura até o comando num MacBook Air M2 aparece no diagnóstico e na avaliação. Aqui não foi medido com câmera.

### Limitações

- **Nada disso foi testado com a webcam real.** Os números acima são de mãos sintéticas, com um ruído que eu supus. O modo de avaliação foi feito para medir de verdade; rode-o antes e depois de calibrar, com o cursor novo e com o antigo.
- **Âncora do cursor:** perto do nó do dedo, o cursor segue mais a mão e menos a flexão do dedo. Se a pontaria fina piorar, o ajuste é `anchorTipWeight` em `src/input/hand/handReading.js`.
- **Adiantamento na tela:** pode passar alguns pixels do ponto numa parada brusca (7 px na simulação). Fica em `predictMs` e `predictSlack` em `CURSOR_CONFIG`.

## Telecinese do guerreiro e runas mais fáceis

### Como usar

- **Levar o guerreiro pelo ar:** aponte para ele e feche a pinça (ou aperte o botão do mouse em cima dele). Ele levanta os pés do chão, flutua seguindo a mão e balança com o peso da armadura. As casas verdes são as que ele alcança neste turno, e o marcador no chão mostra a casa de destino (X vermelho quando não serve). Abra os dedos para ele descer e pousar agachado. Casa ocupada, longe demais ou fora do tabuleiro: ele volta para a origem e o jogo explica por quê. `Esc` (ou a mão saindo da câmera) também o devolve.
- **Dificuldade das runas:** painel › **Configurações** › Fácil, Normal ou Avançado. A escolha fica salva no navegador.
  - **Fácil** (o padrão): a runa aparece grande, com **"comece aqui"** pulsando no ponto de partida. O cursor gruda no trilho, o caminho percorrido brilha mais conforme avança e o trecho à frente acende para mostrar por onde seguir. A runa vale com **72%** traçado.
  - **Normal:** a mesma runa guiada, um pouco mais exigente (vale com **80%**), ou o desenho livre (tecla `I` troca).
  - **Avançado:** desenho livre, sem a runa na tela (ela fica só no cartão), com reconhecimento mais rigoroso.
- **Treino de runas** (tecla `O`, ou o botão no painel): escolha uma runa no painel da esquerda e desenhe com a câmera ou o mouse. Cada tentativa mostra acerto ou erro, a nota e o tempo, e a próxima começa sozinha. Não gasta mana nem turno. **Rabisco livre** conta falsos disparos: desenhe qualquer coisa que não seja runa e veja se alguma dispara. **Exportar resultados** baixa tudo em JSON. `Esc` fecha.

### O que mudou

**Telecinese para qualquer personagem** (`src/gameplay/Telekinesis.js`): a telecinese do mago virou genérica. Ela recebe um "corpo" (o grupo da cena, a escala, o brilho de borda e a camada `flight` que o próprio personagem anima) e regras (casa livre, casa ocupada, por que não serve, se pode pegar agora).

- **Uma instância por personagem**, e um `TelekinesisGroup` decide qual corpo o ponteiro aponta (o mais perto ao longo do raio). Garante também que só um fique na mão por vez.
- **O mago não mudou:** os números dele são os mesmos de antes (`MAGE_FEEL`).
- **O guerreiro tem o peso dele:** sobe mais devagar, flutua mais baixo, balança como um pêndulo nas arrancadas e pousa agachando mais fundo, com um tremor curto. Os números estão em `src/main.js`.
- **As regras do guerreiro valem no ar:** só pousa nas casas que alcança no turno (3, contando o caminho pelo chão), e o pouso gasta o movimento.
- **Sem conflito com os golpes:** enquanto ele está na mão (e um instante depois de pousar), os gestos de golpe não chegam ao reconhecedor.
- **Pose de voo do guerreiro** (`src/character/Warrior.js`): pernas pesadas penduradas, escudo e espada abertos para equilibrar, susto ao ser pego e agachamento no pouso. O modelo 3D não mudou.

**Traçado guiado** (`src/runes/RuneGuide.js`):

- **Dois raios:** o ímã visual é mais largo (27% do tamanho da runa no Fácil) e puxa o cursor; acender o trilho pede estar um pouco mais perto (20%).
- **Interrupções curtas:** se a câmera perde a mão por até 0,65 s, ou o dedo sai um pouco do trilho e volta logo à frente, o trecho do meio acende.
- **Continuidade**, para que rabiscos dentro da faixa não fechem a runa:
  - um trecho contínuo aceso;
  - uma **varredura** num sentido só (metade do traço no Fácil);
  - **eficiência**: a mão não pode andar muito mais do que o trilho que acendeu;
  - o ponto no trilho não escorrega para longe com um passo pequeno da mão, perto de cantos e vértices.

**Reconhecimento livre** (`src/runes/RuneRecognizer.js`):

- **Nota e folga:** nota mínima de 0,75 no Normal e 0,8 no Avançado (antes era 0,8 para todos). A folga exigida entre a primeira e a segunda runa cresce quando a nota é baixa.
- **Sinais de rabisco:** abaixo da nota "firme", o desenho não pode ter sinais de rabisco: trocas de sentido da curva e comprimento demais para a runa (e, na onda, alturas ao acaso).
- **Critérios por símbolo:** o V precisa das pontas na mesma altura; o círculo é penalizado se tiver cantos; a onda precisa de regularidade.
- **Mais tolerância:** a suavização se adapta ao tremor, e formas quase fechadas valem com desconto pequeno.
- **Dicas de "quase":** quando a runa pedida fica perto, a mensagem diz o que corrigir ("feche o círculo", "comece por fora e termine no centro", "faça pelo menos duas ondas"...). Enquanto desenha, o cartão avisa se a forma está parecendo outra runa.

**Rastreamento** (`src/runes/RuneTracker.js`):

- **Filtro adaptativo:** o filtro da ponta do dedo mede o tremor e segura mais quando a mão treme.
- **Câmera que perde a mão:** se a mão some no meio do traço e volta perto de onde sumiu (em até 1,4 s), o **mesmo traço continua**.
- **Pausa no canto:** parar num canto não termina o desenho. Parado, o traço só termina se já parecer a runa pedida, ou depois de 1,1 s.
- **Desenho lento:** o traço pode durar até 9 s.

**Treino** (`src/runes/RunePractice.js`, `src/ui/RuneTrainerUi.js`): registra cada tentativa (runa, o que foi lido, nota, tempo, dificuldade, mão ou mouse) e calcula a taxa de acerto, as runas trocadas, os falsos disparos e o tempo médio, por runa e por sessão.

### Resultados medidos (desenhos sintéticos, sem webcam)

**Traçado guiado**, 240 traçados por linha, seguindo o trilho com a mão ondulando em volta dele, e 500 tentativas por linha de rabisco:

| | Antes (pedia 90%) | Fácil (72%) | Normal (80%) |
|---|---|---|---|
| Traçado com desvio de ±10 px | 100% | 100% | 100% |
| Traçado com desvio de ±25 px | 90% | 92% | 90% |
| Traçado com desvio de ±45 px | 80% | 86% | 77% |
| Rabisco rápido de 5 s completou | 3,8% | 2,2% | 0,8% |
| Rabisco lento de 5 s completou | 0% | 0% | 0% |
| Um movimento reto completou | 1,3% | 1,0% | 0% |

**Desenho livre**, 200 desenhos por runa em cada linha. Antes é o reconhecedor anterior; agora é o nível Normal e o Avançado:

| Caso | Antes | Normal | Avançado |
|---|---|---|---|
| Limpo | 98,8% | 99,2% | 98,7% |
| Imperfeito (ondulado, torto) | 87,1% (pior runa 62%) | 85,8% (pior runa 70%) | 75,9% |
| Incompleto (faltando 8–15%) | 76,4% | **88,4%** | 77,9% |
| Tremor forte | 97,6% | 98,5% | 96,9% |
| Rápido (12–20 amostras) | 92,6% | 95,8% | 92,7% |
| Lento (pontos repetidos) | 99,0% | 99,3% | 98,8% |
| Interrupção (some 6–12% do traço) | 98,3% | 99,1% | 98,3% |
| Runa trocada por outra | até 1,4% | até 1,8% | até 0,9% |

**Falsos disparos:**

- **Rabiscos variados** (aleatório, longo, vaivém, emaranhado, mão passeando, reta, L, meio círculo, tremor parado) disparam 0,4% no Normal e 0,1% no Avançado.
- **Runas parecidas:** nenhum par passa de 0,7% de troca, com uma exceção: um losango bem arredondado é lido como círculo em 2,7% das vezes.
- **O garrancho**, um zigue-zague com alturas ao acaso da esquerda para a direita, é o ponto fraco: ainda passa como **onda** em 48% das vezes no Normal e 36% no Avançado (antes, 62%). Ele só dispara magia se a magia escolhida for a Parede de Chamas, e no Fácil o trilho impede.

Cada reconhecimento leva cerca de 2 a 3 ms.

### Testes

- **Sem navegador** (`npm test`):

  | Arquivo | O que cobre |
  |---|---|
  | `tests/runes-hard.test.mjs` (89 testes) | casos difíceis, rabiscos, runas parecidas, dicas e tempo |
  | `tests/guide.test.mjs` (58) | 72% e 80%, continuidade, interrupções, rabiscos com relógio e traçados com desvio |
  | `tests/tracker.test.mjs` (23) | filtro adaptativo, retomada do traço, pausa no canto, desenho lento |
  | `tests/practice.test.mjs` (12) | registro do treino |

  O gerador de desenhos sintéticos ficou em `tests/synth.mjs`. Os testes antigos continuam passando: reconhecedor, combate (103) e guerreiro (37).
- **No navegador** (`index.html?testes`): 184 verificações. Elas incluem a telecinese dos dois personagens com o mouse e com a pinça simulada (a mão sintética passa pelo `HandInput`, como a câmera), o guerreiro subindo com os pés fora do chão, as casas acesas, o marcador de destino, a descida suave, o pouso agachado e o custo do movimento, e as casas ocupada, longe demais e fora do tabuleiro voltando para a origem. Também cobrem:
  - conflitos: punho varrendo com o guerreiro no ar, golpe logo depois do pouso, mão aberta depois de soltar o mago e a mão saindo da câmera com o guerreiro no ar;
  - os três níveis pelo painel;
  - o "comece aqui", 72% contra 80%, a ponte de interrupção e o salto sem interrupção;
  - a mão sumindo e voltando no desenho livre, a dica de "quase" e o Avançado sem trilho;
  - o treino (escolher a runa, acerto, erro, repetição, sem gastar mana, rabisco livre, exportar, Esc).

### Sessões reais com a webcam (não feitas aqui)

Os números acima vêm de desenhos sintéticos. Para medir com a câmera de verdade:

1. Ligue a câmera e calibre o alcance.
2. Abra o treino (`O`) e escolha uma dificuldade.
3. Faça pelo menos 10 tentativas de cada runa, sem treinar antes.
4. Escolha **Rabisco livre** e faça 20 desenhos quaisquer: mão passeando, rabiscos, retas.
5. Clique em **Exportar resultados**. O JSON traz, por runa e no total, a taxa de reconhecimento, as runas trocadas, os falsos disparos dos rabiscos e o tempo médio por tentativa.

Repita em cada dificuldade e com pessoas diferentes. Os ajustes ficam em `GUIDE_LEVELS` (`src/runes/RuneGuide.js`), `RECOGNIZER_LEVELS` (`src/runes/RuneRecognizer.js`) e `TRACKER_CONFIG` (`src/runes/RuneTracker.js`).

### Limitações

- **Webcam real não testada** aqui: nem a telecinese do guerreiro pela pinça nem as runas. Os limites foram ajustados com desenhos e mãos sintéticos.
- **Garrancho no desenho livre:** o zigue-zague irregular ainda passa como onda (veja acima).
- **Losango arredondado:** um losango muito redondo é lido como círculo em cerca de 3% das vezes.
- **Movimento do guerreiro:** mantém a regra dele (até 3 casas por turno), também pela telecinese; o mago continua sem esse limite.
- **"Voltar o último movimento"** (`Esc` com o personagem no chão) continua sendo só do mago.

## O guerreiro completo: as seis habilidades

O Runa Vision 2.0 (cursor, pinça, calibração, filtros) não mudou. O que mudou foi o reconhecedor de gestos do guerreiro (`src/warrior/WarriorGestures.js`), as regras, as animações, os efeitos e a interface dele.

### Como jogar

Selecione o guerreiro (`Tab`, o botão **Guerreiro** ou um clique nele) e, com ele parado, faça o gesto. Sem câmera, as teclas `1` a `6` (ou os botões da barra) disparam as mesmas habilidades. Com o treino (`Y`), nada gasta energia, ação nem recarga, e os golpes valem sem alvo.

| Tecla | Habilidade | Gesto | Energia | Recarga | Efeito |
|---|---|---|---|---|---|
| `1` | Corte Horizontal | **espada**: indicador e médio esticados e **juntos**, varrendo para o lado | 15 | 1 | 22 de dano em cada inimigo das 3 casas à frente |
| `2` | Golpe Devastador | **punho fechado descendo** rápido | 30 | 2 | 40 de dano num inimigo ao lado e **guarda quebrada** (a defesa dele não conta por 2 turnos) |
| `3` | Guarda de Ferro | **palma aberta parada** por 0,7 s | 20 | 3 | recebe **metade do dano** até o fim do próximo turno |
| `4` | Investida | **punho fechado subindo** rápido | 25 | 3 | corre em linha reta até o primeiro inimigo a até 4 casas e acerta 18 com o ombro e o escudo |
| `5` | Contra-ataque | **V** (indicador e médio **abertos**) parado por 0,7 s | 15 | 2 | apara o próximo ataque corpo a corpo (sem dano) e responde com 20 |
| `6` | Onda de Choque | **círculo** desenhado com o indicador | 35 | 4 | 15 de dano em todos os inimigos em volta e empurra cada um 1 casa, se a casa de trás estiver livre |

O cartão de cada habilidade mostra o ícone, o nome, o custo, a recarga e o gesto. Enquanto você faz o gesto, o medidor de cima mostra a pose lida e o progresso (por exemplo "segure… Guarda de Ferro 60%"), e o item da habilidade acende; quando o gesto é reconhecido, o cartão pisca. Gesto errado vira um aviso curto ("junte o indicador e o médio (a espada) para o corte", "feche bem o punho"). Com a Guarda ou o Contra-ataque armados, aparece um texto em cima do guerreiro ("guarda erguida", "contra-ataque armado"). Números em `src/warrior/abilities.js`.

### Regras táticas

- **Energia, recarga e ação** são pagas quando a habilidade é aceita; um golpe por turno. Habilidade sem alvo válido é recusada **antes** de gastar qualquer coisa, com o motivo ("nenhum inimigo ao lado. Chegue mais perto", "caminho bloqueado").
- **Dano no impacto, uma vez só.** Cada golpe tem um evento de impacto na animação; o dano entra ali, com uma chave por uso que impede dano em dobro.
- **Golpe Devastador:** escolhe o inimigo ao lado (inimigos antes de bonecos) para onde ele está virado, ou o mais perto. A guarda quebrada zera a defesa do alvo por 2 turnos.
- **Guarda de Ferro:** efeito `guardaDeFerro` (dano recebido × 0,5, depois da defesa). Exemplo testado: ataque de 20 − 4 de defesa = 16, pela metade = 8.
- **Investida:** procura nas 8 direções a linha reta até o primeiro alvo a até 4 casas. Todas as casas do caminho precisam estar livres e dentro do tabuleiro; não atravessa muralha, aliado nem inimigo, e na diagonal não corta a quina de uma muralha. Para na casa ao lado do alvo; com o alvo já colado, ele só arremete, sem andar.
- **Contra-ataque:** efeito `aparar`. O próximo ataque corpo a corpo de um inimigo (`Combat.meleeAttack`) é aparado: o efeito sai, o guerreiro não perde vida e responde com 20 de dano comum. A resposta **não é** ataque corpo a corpo, então não pode ser aparada nem disparar outro contra-ataque (sem recursão). O turno dos inimigos espera a resposta terminar.
- **Onda de Choque:** atinge as 8 casas em volta. Cada inimigo atingido é empurrado 1 casa para fora, só se a casa de destino estiver no tabuleiro, livre e sem outro empurrado indo para ela; senão fica onde está (e leva o dano do mesmo jeito). Muralhas vizinhas também levam dano.
- **Sem sobreposição:** durante uma habilidade (ou a resposta do contra-ataque), andar, telecinese, novos gestos e encerrar o turno ficam bloqueados ("Espere o guerreiro terminar."). As animações andam por tempo, sempre terminam e devolvem o guerreiro a "pronto".

### Animações e efeitos

Todas em código, nos ossos (o modelo 3D não mudou), em fases com antecipação, execução, impacto, acompanhamento e recuperação (`src/character/warriorMoves.js`). As poses que põem o escudo na frente do peito e a ponta da espada no alvo ou no chão foram achadas por busca numérica na própria cena.

- **Corte Horizontal:** gira o tronco, varre na horizontal; rastro de luz azul na lâmina e faíscas.
- **Golpe Devastador:** ergue a espada por cima da cabeça, curva o tronco, desce com força com as pernas abertas; faíscas, onda pequena no chão, poeira, fragmentos e tremor; estilhaços da guarda quebrada; recuperação pesada. O rastro (laranja) só aparece na descida, na frente do corpo.
- **Guarda de Ferro:** recolhe, ergue o escudo na frente, flexiona os joelhos e firma; um brilho percorre a borda do escudo. A postura de guarda fica enquanto o efeito dura.
- **Investida:** abaixa o corpo com o escudo à frente, corre rápido (poeira nos pés), tranco de ombro e escudo no impacto (faíscas, tremor, o alvo balança) e desacelera.
- **Contra-ataque:** recua e apara com o escudo; anel claro pulsando no chão enquanto está armado. Ao aparar: clarão no escudo e uma resposta rápida com a espada.
- **Onda de Choque:** segura a espada com as duas mãos, ergue, crava no chão; três anéis de energia pelas casas vizinhas, poeira, faíscas, fragmentos, rachadura, luz e tremor; os empurrados vão para a casa nova (ou balançam, quando não há espaço).

### Como os gestos são separados

- **Espada × V:** o MediaPipe chama os dois de "Victory". O reconhecedor mede a distância entre as pontas do indicador e do médio (em palmos) e o ângulo entre os dois dedos: juntos (< 0,3 palmo e < 16°) é espada; abertos (> 0,45 palmo e > 22°) é V; no meio, a pose é ambígua e não vale nada. Por isso o corte e o contra-ataque não se confundem.
- **Devastador × Investida:** os dois são punho na vertical. Descendo é Devastador; subindo é Investida, mas a Investida espera 260 ms para confirmar: se o punho descer logo depois (erguer para depois bater), ela é descartada e vale o Devastador.
- **Movimentos** (corte, devastador, investida): 90 a 600 ms, pelo menos 1,1 a 1,2 palmo no eixo certo, 1,8 vez mais que no outro eixo, quase reto, com velocidade de pico mínima, a pose certa em 70% dos quadros em movimento e nenhum salto de um quadro com mais da metade do caminho.
- **Posturas seguradas** (guarda, contra): a pose em 85% dos quadros, mão quase parada, 0,7 s. Depois de valer, só valem de novo quando a mão muda de pose.
- **Círculo:** traçado com a ponta do indicador e lido pelo mesmo reconhecedor das runas (nota mínima 0,72, diâmetro mínimo 1,3 palmo, fechado). Ele só roda com o guerreiro pronto; com o mago, as runas seguem com o reconhecedor delas.
- **O que nunca dispara golpe:** pinça (ela é da telecinese), andar, a mão parada tremendo, o guerreiro sendo levado pela telecinese, o mago ativo, outra habilidade em andamento. Depois de um golpe, 0,8 s sem reconhecer outro. A mão que some por um instante (até 400 ms) não apaga o gesto.

Os limiares estão em `WARRIOR_GESTURE_CONFIG` (`src/warrior/WarriorGestures.js`). Se um gesto não reconhecer com a sua câmera, baixe `minTravel` ou `minPeakSpeed` daquele golpe (ou `ms` da postura); se disparar sem querer, suba.

### Testes

- **Sem navegador** (`npm test`, `tests/warrior.test.mjs`): **111 testes, todos passando.** Mãos sintéticas (21 pontos) passam pela leitura da câmera e pelo reconhecedor: os seis gestos reconhecidos; espada × V; V varrendo não vira corte; espada parada não vira contra-ataque; investida descartada quando o punho desce logo depois; pinça, mão parada tremendo, quadro solto, perda curta da mão, intervalo entre golpes e habilidades desligadas. **Varredura: 120 de 120 de cada um dos seis gestos (nenhum confundido com outro), variando o tamanho da mão (distância da câmera), o percurso, a duração, o sentido, a posição, o desvio e o tremor; 0 de 240 falsos disparos** em movimentos que não são gesto. Regras: dano do Devastador e guarda quebrada (e quando ela acaba), Guarda pela metade (e quando acaba), Contra-ataque uma vez só e sem cadeia, Investida que não atravessa muralha, aliado nem quina, Onda que só empurra para casa livre e dentro do tabuleiro, custos, recargas e energia insuficiente.
- **No navegador** (`index.html?testes`): **237 verificações, todas passando.** As habilidades novas passam pela mão simulada no `HandInput`, como a câmera: reconhecimento, custo, nada de dano antes do impacto, as fases da animação, dano exato e uma vez, guarda quebrada, Investida parando na casa certa (no combate e na cena), Guarda reduzindo o ataque real de um autômato, Contra-ataque aparando o ataque do autômato e respondendo uma vez (o turno inimigo espera), Onda empurrando só quando há espaço, pinça sem habilidade e o cursor passando pelo guerreiro sem apagar o gesto. O mago (runas, magias) e a telecinese dos dois continuam passando.
- Os outros testes de `npm test` (cursor, pinça, contextos, calibração, runas, casos difíceis, rastreamento, traçado guiado, treino e combate) continuam passando.

### Validação com a webcam (não feita aqui)

Os limiares vieram de mãos sintéticas. Com a câmera real, vale conferir, com o treino ligado (`Y`):

1. **Espada × V:** faça a espada (dois dedos colados) e o V bem aberto, de frente e um pouco de lado. O medidor deve mostrar "espada" e "V"; se ficar em "dois dedos (junte ou abra mais)", ajuste `swordGap`/`veeGap`.
2. **Corte:** espada varrendo para os dois lados, perto (30 cm) e longe (80 cm).
3. **Devastador × Investida:** punho descendo e punho subindo, 10 vezes cada; veja se a investida espera o instante de confirmação e se erguer o punho para bater não dispara a investida.
4. **Guarda e Contra-ataque:** palma e V parados; meça se 0,7 s parece natural.
5. **Onda de Choque:** círculos de tamanhos e velocidades diferentes; e confira que, com o mago, os círculos continuam sendo runas.
6. **Falsos disparos:** jogue normalmente (pinça, cursor, andar, telecinese) por alguns minutos e conte os golpes que saíram sem querer.

### Limitações

- **Câmera real não testada** para os gestos novos; a geometria da espada e do V varia de mão para mão.
- **Animações procedurais**, sem dedos animados nem morte do guerreiro.
- Os números das habilidades são um primeiro balanceamento.

## O guerreiro (Fases 1 a 4)

### Como jogar

- **Trocar de personagem:** `Tab`, os botões **Mago | Guerreiro** acima da barra, ou pegar o personagem pela telecinese (pinça ou botão em cima dele).
- **Andar:** com o guerreiro selecionado, as casas verdes são as que ele alcança neste turno (até 3, sem atravessar ninguém nem muralhas). Clique (ou pinça) numa delas: ele anda; com 3 casas, corre. Ou leve-o pelo ar, com a pinça nele (veja acima).
- **Corte Horizontal:** com o guerreiro selecionado e parado, **faça a espada (indicador e médio juntos) e varra a mão para o lado**, rápido. Ele vira para o lado com mais inimigos e golpeia em arco as **três casas à frente**. Sem câmera: tecla `1` (ou clique no botão do golpe). *(Nas Fases 1 a 4 o gesto era o punho; o punho agora é do Golpe Devastador e da Investida.)*
- **Treino** (`Y`): os golpes não gastam energia, ação nem recarga, e valem sem alvo e fora do turno, para treinar o gesto.
- Os comandos do mago (mão aberta para a roda, punho para confirmar, V para o painel) ficam desligados com o guerreiro: esses gestos são dele. O polegar para cima continua encerrando o turno.

Números (em `src/warrior/abilities.js`): vida 160, defesa 4, energia 100 (+25 por turno), 3 casas de movimento e 1 golpe por turno. Corte Horizontal: 22 de dano em cada inimigo do arco, 15 de energia, recarga de 1 turno. Os inimigos atacam o personagem mais perto: o mago ou o guerreiro.

### Arquitetura

- **Mesma infraestrutura, mecânicas separadas.** Os dois usam o mesmo combate (`src/combat/Combat.js`, agora com vários personagens do jogador, cada um com as próprias ações, movimento e energia), a mesma arena, os mesmos turnos e o mesmo MediaPipe (uma instância só). O mago continua com as runas; o guerreiro tem o próprio reconhecedor de gestos.
- **Estados do guerreiro** (`src/warrior/WarriorController.js`): livre, pronto (selecionado), andando, golpe (animação; o dano entra no instante do impacto) e voltando. Gestos de golpe só valem com ele pronto: andando, golpeando, com o mago ativo ou com o mago sendo levado pela telecinese, os quadros da mão nem chegam ao reconhecedor.
- **Reconhecimento dos gestos** (`src/warrior/WarriorGestures.js`; como era nas Fases 1 a 4, quando só havia o corte com o punho; o de agora está em "Como os gestos são separados", acima): o `HandInput` passa a publicar a mão inteira a cada quadro (`hand.frame`). O reconhecedor mede o centro da palma (filtro One Euro), a velocidade e a direção, tudo em palmos (a distância da câmera não muda nada). Para valer, o movimento tem que durar de 110 a 650 ms, andar pelo menos 1,6 palmo na horizontal (2 vezes mais que na vertical), ser quase reto, rápido o bastante, feito em vários quadros (nenhum passo sozinho com mais da metade do movimento) e com o punho fechado em 70% dos quadros em movimento. O punho só conta se ganhar com folga do "apontar" e da mão aberta. Depois de um golpe, 0,8 s sem reconhecer outro. Gesto inválido (mão aberta varrendo, por exemplo) vira aviso.
- **Classes novas:** um personagem novo segue o mesmo caminho: modelo sobre o esqueleto comum, golpes no animador de poses (`CastAnimator` agora aceita uma biblioteca de golpes), regras puras, controlador e interface.

### Modelo e animações

O guerreiro é **feito em código** (`src/character/WarriorBuilder.js`), como o mago, e usa **o mesmo esqueleto de 35 ossos**: armadura de placas com volutas em relevo e bordas douradas, tecido azul-escuro entre as placas, ombreiras em três lâminas, elmo de grade com pluma, tabardo azul na frente e atrás, cinto com bolsas, luvas e botas de placas, espada longa com runas acesas e escudo de cavaleiro com moldura dourada. Cerca de 37 mil triângulos (o mago tem 81 mil), uma malha com pele e um grupo por material.

**Modelo em arquivo:** `assets/guerreiro.glb` é este guerreiro exportado (com esqueleto e pesos), pronto para o Blender. Para trocar por um modelo melhor (esculpido no Blender a partir desse arquivo, ou um asset licenciado): mantenha os nomes dos ossos (padrão do Mixamo, como o mago), chame a espada de **Espada** (lâmina no eixo +Y) e o escudo de **Escudo**, exporte em `.glb` e abra `http://localhost:8001/?guerreiro=assets/seu-arquivo.glb` (precisa do `iniciar.command`). Testado aqui com o próprio `guerreiro.glb`: carrega, anda e golpeia. O botão **Baixar guerreiro.glb** do painel exporta o modelo atual.

**Animações (em código, nos ossos):** respiração parada, caminhada e corrida (passada, braços, quadril e o tabardo e a pluma balançando), e o Corte Horizontal: preparação (gira o tronco e puxa a espada para trás), corte (varre na horizontal, com o evento de impacto), acompanhamento e volta à guarda, com transições suaves. Rastro de luz na lâmina, faíscas e tremor curto no impacto. A reação a dano é a mesma do mago.

### Testes

- **Sem navegador** (`npm test`, arquivo `tests/warrior.test.mjs`): 37 testes. Mãos sintéticas (os 21 pontos) passam pela mesma leitura da câmera (`readHand` + `fuse`) e pelo reconhecedor. O corte é reconhecido nos dois sentidos; não disparam a mão aberta, o dedo apontando, o punho descendo, a diagonal forte, o movimento curto, o arrasto lento, o punho parado com tremor, o salto de um quadro, nem a mão que abre no meio. Longe da câmera (mão pela metade) ainda reconhece. Há também um intervalo entre golpes. **Varredura: 200 de 200 cortes variados reconhecidos e 0 de 200 falsos disparos.** E as regras: caminhada (3 casas, sem atravessar unidades nem muralhas), arco, dano (22, ou 20 num autômato), custos, um golpe por turno, treino, energia por turno e inimigo atacando o mais perto.
- **No navegador** (`index.html?testes`): 27 verificações novas, totalizando 127. Seleção pelo clique, casas de caminhada, andar 2 casas (com a animação), recusar casa longe demais, ignorar gesto durante a caminhada. Corte Horizontal pela mão simulada, passando pelo `HandInput` como a câmera: custo pago, dano só no impacto e uma vez, as quatro fases da animação, o rastro. Também: segundo golpe recusado, mão aberta recusada com aviso, tecla sem alvo, treino, troca de personagem (com o mago ativo o golpe não dispara), o autômato atacando o guerreiro e a energia e o movimento voltando no turno novo. As 100 verificações do mago continuam passando.

**Com a webcam (roteiro manual; não foi testado aqui com câmera real):**

1. Ligue a câmera e calibre o alcance. Aperte `Tab` (ou clique no guerreiro).
2. Ligue o treino (`Y`). Feche o punho e varra a mão para o lado, rápido, uns dois palmos, na frente do corpo. O painel de cima mostra a pose lida ("mão: punho"), o progresso do corte e o resultado.
3. Repita devagar, curto, com a mão aberta e na vertical: nenhum deve valer, e a mão aberta deve avisar para fechar o punho.
4. Teste perto e longe da câmera (30 a 80 cm).
5. Desligue o treino, ande até ficar ao lado de um boneco (pinça numa casa verde) e golpeie de verdade.
6. Anote a "leitura da mão" e o "reconhecimento" (em ms) e os quadros por segundo, no rodapé do painel de cima.

Se o corte não reconhecer, baixe `minTravel` (1,6 palmo) ou `minPeakSpeed` em `WARRIOR_GESTURE_CONFIG` (`src/warrior/WarriorGestures.js`). Se disparar sem querer, suba esses valores.

### Limitações (Fases 1 a 4)

- ~~Só o Corte Horizontal está pronto.~~ As seis habilidades estão prontas (veja "O guerreiro completo", acima).
- **Modelo feito em código.** Ele se lê bem na câmera do jogo, mas não chega ao nível de um modelo esculpido como o da referência. Para isso, o caminho é o Blender (a partir de `assets/guerreiro.glb`) ou um asset licenciado, carregado com `?guerreiro=`.
- **Animações procedurais**, nos ossos, como as do mago: aproximações sem dedos animados. Ainda faltam golpe vertical, defesa com escudo, investida, aparar, golpe no chão e morte (Fase 5).
- **Câmera real não testada** aqui; os limiares do gesto vieram de mãos sintéticas.
- O reconhecimento do gesto custa cerca de 0,1 ms por quadro, mas a leitura da mão (MediaPipe) roda na mesma linha do jogo, como antes.

### Próximas etapas

- ~~**Fase 5:** as outras cinco habilidades.~~ Feito (veja "O guerreiro completo").
- **Fase 6:** interface final, efeitos, balanceamento e medição de desempenho com câmera.

## O que a Etapa D entrega: as oito magias

### O fluxo de uma magia

1. **Abrir a roda:** mão aberta (segure) ou `M`. A roda mostra as oito magias com a runa, a mana e a recarga de cada uma.
2. **Escolher:** aponte para um setor e feche o punho (segure), ou `Enter`, ou clique, ou as teclas `1` a `8`.
3. **Traçar a runa (ímã, o padrão):** a runa escolhida aparece grande no centro, como um trilho tracejado. Leve o indicador (ou o mouse, com o botão apertado) até ela: o cursor gruda no trilho, e cada trecho por onde você passa acende. Pode começar em qualquer ponto e ir para qualquer lado; levantar e continuar depois não apaga o que já acendeu. Quando a runa acende quase inteira (90%), a magia é reconhecida sozinha, sem precisar parar. Com o punho (ou `Enter`) dá para terminar a partir de 72%. Com a mão, não precisa nem da pose de caneta: basta o dedo seguir o trilho. Rabiscar por cima não adianta: só acende o que é percorrido de ponto vizinho em ponto vizinho.
   **Desenho livre** (tecla `I` ou botão **Ímã nas runas**): a runa é desenhada de cabeça, com o indicador esticado e os outros dedos dobrados. Para terminar o traço, pare a mão por meio segundo ou relaxe o dedo. O cartão mostra, ao vivo, quanto o desenho já se parece com a runa. A escolha fica salva no navegador.
4. **Reconhecida:** a trilha brilha, a runa limpa acende por cima e solta faíscas. **Errada:** a trilha esfria, treme e some; o cartão diz o que faltou (por exemplo: "Isso parece um triângulo. A Bola de Fogo pede um círculo completo.") e você tenta de novo.
5. **Alvo:** o jogo já sugere o alvo que atinge mais inimigos e o trava. Aponte outro inimigo e feche a pinça (ou clique) para trocar. O chão mostra o alcance, a área atingida e a mira.
6. **Lançar:** feche o punho (segure), ou `Enter`, ou clique de novo no alvo travado.
7. **O mago conjura:** vira para o alvo, junta as mãos (a esfera nasce entre elas), puxa o braço livre para trás e arremessa. A esfera voa em arco com rastro de brasas e explode: luz, faíscas, fumaça, onda de choque, tremor de câmera e uma marca de queimadura no chão. O dano e a queimadura entram no instante da explosão, uma vez só.

**Voltar uma etapa:** polegar para baixo (segure) ou `Esc`. Do alvo volta ao desenho; no desenho, primeiro apaga o traço (nova tentativa), depois volta à roda; da roda, fecha.
**Encerrar o turno:** polegar para cima (segure) ou `N`. Os inimigos agem e o turno volta para você.

### Gestos (a mão é a mesma fonte de comandos da Etapa B)

| Gesto | Fora da magia | Durante a magia |
| --- | --- | --- |
| Indicador apontando | Move o cursor | Passa por cima da runa (ímã) ou desenha a runa (desenho livre, com os outros dedos dobrados) |
| Pinça | Pega e leva o mago | Trava o alvo |
| Mão aberta (segure) | Abre a roda de magias | — |
| Punho fechado (segure) | — | Escolhe a magia; depois, lança |
| Polegar para baixo (segure) | Volta o último movimento | Volta uma etapa |
| Polegar para cima (segure) | Encerra o turno e mostra o tabuleiro | — |
| Sinal de V (segure) | Mostra ou esconde o painel | (bloqueado enquanto desenha) |

**Contra disparos acidentais:** a mão aberta e o punho seguram mais tempo (0,42 s e 0,36 s); apontando, nenhum gesto de comando começa; a mão aberta logo depois de soltar o mago (1 s) não abre a roda; os gestos só valem no momento em que fazem sentido, e o anel em volta do cursor explica quando não valem.

### As oito magias

Os números são valores iniciais de balanceamento e ficam em `src/spells/spellBook.js` (e em `runa3d.SPELLS`, no console). Alcance e área contam casas, com a diagonal valendo 1.

| Magia (tecla) | Runa | Números | O mago | O que se vê |
| --- | --- | --- | --- | --- |
| Bola de Fogo (1) | círculo | 30 de dano, área de raio 1, queimadura 5/turno por 3 turnos · mana 20 · recarga 2 · alcance 6, com linha de visão | junta as mãos (a esfera nasce entre elas), puxa o braço para trás e arremessa | esfera de fogo em arco com rastro, explosão, luz, tremor, marca de queimadura no chão; quem queima solta chamas |
| Parede de Chamas (2) | onda | até 3 casas de frente para o mago, por 3 turnos; 12 de dano a quem entra ou atravessa (uma vez por rodada, mesmo atravessando várias casas) · mana 30 · recarga 4 · alcance 5 | ergue o cajado (o cristal pega fogo) e varre para a frente | um rastro de fogo corre até as casas, as chamas sobem casa por casa; chamas, brasas, fumaça, luz alaranjada e as casas perigosas acesas no chão |
| Lança de Gelo (3) | V | 25 de dano, lentidão (anda 1 casa a menos) por 2 turnos · mana 15 · recarga 1 · alcance 6, com linha de visão | concentração (cabeça baixa), cristais crescem em volta da mão, aponta e dispara | a lança se forma no ar e voa reta, rápida, com névoa; estilhaços, névoa fria e luz azul no impacto; o alvo ganha uma camada de gelo |
| Prisão Glacial (4) | losango | 10 de dano, imobilizado por 1 turno (não anda, mas pode atacar) · mana 30 · recarga 4 · alcance 5 | estende a mão aberta, concentra e fecha a mão | névoa fria e ondas azuis em volta do alvo; cristais gigantes brotam do chão e se quebram quando o efeito acaba |
| Relâmpago (5) | zigue-zague | 35 de dano, 20% de chance de atordoar por 1 turno (perde a vez) · mana 25 · recarga 2 · alcance 6, com linha de visão | o cajado sobe e acumula energia (descargas no cristal), aponta e o corpo recua | relâmpago ramificado do cajado ao alvo, clarão curto na tela, luz azul e violeta, faíscas; o alvo treme com o choque |
| Corrente Elétrica (6) | dois zigue-zagues | 25 de dano no alvo, salta para o inimigo mais perto (até 2 casas) até 3 alvos, −20% por salto · mana 35 · recarga 4 · alcance 6, com linha de visão | energia entre as duas mãos à frente do corpo; solta de uma vez e recua | arcos entre as mãos; o raio salta de alvo em alvo, cada salto mais fino e mais violeta, cada alvo treme menos; as descargas piscam de novo no fim |
| Muralha de Pedra (7) | triângulo | até 3 blocos de frente para o mago, só em casas vazias, por 3 turnos, 60 de vida cada; bloqueiam passagem e linha de visão · mana 25 · recarga 4 · alcance 5 | base larga, ergue o cajado e golpeia o chão | um tremor corre até as casas e os blocos brotam com poeira, pedras e tremor de câmera; ao apanhar tremem, escurecem e mostram a vida; com vida zero desmoronam; no fim do tempo afundam |
| Terremoto (8) | espiral de fora para dentro | 40 de dano em raio 2 em volta da casa escolhida, 30% de chance de derrubar (perde o próximo turno levantando) · mana 45 · recarga 5 · alcance 5 | ergue o cajado bem alto, concentra e golpeia o solo com o corpo todo | onda sísmica correndo pelo chão até a área, anéis de choque, rachaduras douradas, pedras, poeira e tremor de câmera de cinema; quem é derrubado tomba e depois levanta |

Os autômatos que encontram o caminho até o mago fechado pela muralha batem nela (8 por golpe). A Bola de Fogo e o Terremoto também machucam os blocos que estão na área.

### Regras do combate

- **Unidades:** vida, mana (o mago), defesa, resistências por elemento (negativa = fraqueza), casa no tabuleiro e efeitos ativos.
- **Dano:** `base × (1 − resistência) − defesa`, arredondado, no mínimo 1. A queimadura ignora a defesa.
- **Nada leva o mesmo golpe duas vezes:** cada golpe tem uma chave (o lançamento, o turno da queimadura, a rodada de uma área perigosa) e o combate ignora a repetição.
- **Efeitos de status** (queimadura, lentidão, imobilizado, atordoado, derrubado): a duração conta turnos de quem sofre o efeito. Agem no começo do turno dela e perdem 1 de duração no fim. O mesmo efeito não acumula: renova a duração e fica com a maior força. Efeitos com chance sorteiam uma vez, ao aplicar (e o jogo avisa quando o alvo resiste). Cada efeito aparece no alvo: chamas (queimadura), camada de gelo e névoa fria (lento), cristais em volta (preso), faíscas na cabeça e tremedeira (atordoado), tombado (derrubado); e o nome com os turnos restantes, sobre a barra de vida.
- **Turno:** uma magia por turno. No começo do seu turno, a mana recupera 20 (até 100) e as recargas descem 1. Recarga 2 = a magia volta dois turnos depois.
- **Obstáculos e áreas perigosas** (Muralha de Pedra e Parede de Chamas): duram 3 turnos do jogador. A muralha bloqueia passagem e linha de visão; as chamas machucam quem entra, inclusive o mago, se for pousado nelas.

### A arena de treino

- **Bonecos** (B7, E8, G6): só apanham. Vida 100, defesa 0.
- **Autômatos** (F7 e G5): bonecos escurecidos, de olhos roxos. Vida 110, defesa 2, resistem a gelo (20%), são fracos a raio (20%). No turno deles, pulam até 2 casas na direção do mago e, ao lado dele, atacam (8 de dano). O botão **Autômatos andam e atacam** deixa todos parados.
- **O mago:** vida 120, mana 100, defesa 1.
- Na arena de treino ninguém morre de vez: quem cai levanta com a vida cheia em 2,6 segundos.
- **Restaurar mana e recargas** (`U`): para testar várias vezes seguidas.

### Como o reconhecimento funciona

0. **Ímã** (`src/runes/RuneGuide.js`, o padrão): a runa vira um trilho de 160 pontos por traço. A caneta gruda nele e acende o trecho percorrido, de ponto vizinho em ponto vizinho. A dificuldade decide quanto precisa acender (72% no Fácil, 80% no Normal) e as regras de continuidade (veja "Telecinese do guerreiro e runas mais fáceis", acima). Neste modo os passos abaixo não decidem nada: o rastreador só suaviza a ponta do dedo.
1. **Rastreamento** (`src/runes/RuneTracker.js`): a ponta do indicador passa por um filtro One Euro próprio. A caneta encosta com o indicador esticado e os outros dedos dobrados, com folga para o tremor não cortar o traço. Um traço termina quando a caneta levanta, quando a mão fica parada (0,6 s), quando passa de 6 s ou quando a mão some. Traços curtos ou rápidos demais são descartados.
2. **Reconhecimento** (`src/runes/RuneRecognizer.js`): uma variante do $1 Unistroke Recognizer. Reamostra o traço em 64 pontos (tira a velocidade), centraliza (tira a posição) e escala pela maior dimensão (tira o tamanho sem deformar). Compara com os modelos de `src/runes/runeShapes.js`. Formas fechadas valem começando em qualquer ponto e em qualquer sentido; o círculo e a espiral giram à vontade; o raio e o V só um pouco. Medidas de forma (vértices, cantos, ondulações, redondeza, espiral para dentro) separam runas parecidas e recusam rabiscos. O raio duplo pode ser feito em dois traços (cada um é um raio, lado a lado) ou num só.
3. **Aceite:** nota mínima de 75% (Normal) ou 80% (Avançado), à frente da segunda runa com uma folga que cresce quando a nota é baixa, e sem sinais de rabisco abaixo da nota "firme".

**Depuração das runas** (`D`): mostra os pontos crus da câmera, a trajetória suavizada, a runa lida, a nota de cada runa e as medidas de forma.

### Testes

**Automáticos, sem navegador** (`npm test`):

- **Reconhecedor:** 300 desenhos sintéticos por runa, com tremor, escala, giro, velocidade irregular, ponto de partida, sentido e fechamento imperfeito. Acerto de 95,7% a 100% em todas as oito, **0% de confusão** entre runas. Linhas, L, meio círculo, rabiscos e pontos são recusados em 99% a 100% dos casos. Cerca de 2 ms por reconhecimento.
- **Rastreamento:** 12 testes (pausa termina o traço, tremor não corta, esbarrão descartado, mão perdida, dois traços, tempo máximo).
- **Ímã:** 19 testes (as oito runas traçadas por cima com tremor, de trás para a frente, começando no meio, pela metade, levantando e continuando, rabisco, saltos de ponto em ponto, caneta levantada, raio duplo).
- **Combate:** 103 testes: as regras das oito magias com os números exatos (por exemplo, a Lança de Gelo tira 18 de um autômato: 25 × 0,8 de resistência − 2 de defesa), a ordem e o dano dos saltos da corrente (25, 20, 16), a área do terremoto sem machucar o mago, a muralha de frente para o mago bloqueando a linha de visão, autômatos batendo na muralha, as chamas doendo uma vez por rodada, e mais: dano, defesa, resistência, queimadura de 3 turnos, expiração, recarga, mana, uma magia por turno, acúmulo, chance, morte e volta, inimigos andando e atacando.

**Automáticos, no navegador:** abra `index.html?testes` (ou `dev.html?testes`). O jogo é dirigido como por um jogador, com eventos de mouse e teclado e com os mesmos comandos de caneta e gesto que a câmera emite. São 100 verificações: telecinese (pegar, pousar, casa ocupada, voltar), câmera, roda, runa errada recusada com a mensagem certa, círculo reconhecido, alvo sugerido e travado (inclusive clicando no corpo do boneco), as seis fases da animação, as quatro fases da esfera, dano exato em cada unidade, queimadura nos três atingidos, nada de dano em dobro, mana, recarga, uma magia por turno, três turnos de queimadura e o fim dela, o fluxo inteiro pela mão (mão aberta, punho, caneta, pausa, pinça, punho), reaproveitamento de esfera, explosão e luzes, autômatos andando e atacando, a exportação do `mago.glb`, o ímã (rabisco longe não acende, meia volta não basta, a volta completa reconhece sozinha, e com a mão basta seguir o trilho) e **as oito magias de ponta a ponta**: traçar a runa, travar o alvo, lançar, a mana certa, todas as fases da animação de cada uma, o dano e o efeito de cada magia, os efeitos aparecendo nos alvos, tudo sumindo no tempo certo depois de 5 turnos (cristais quebrados, gelo derretido, derrubados de pé, muralha e chamas fora), uma segunda volta inteira e as reservas de efeitos com teto fixo. Todas passaram no `jogo.js` final.

**Com a webcam (roteiro manual).** Os testes acima usam mãos simuladas. A câmera de verdade não foi testada aqui. Para testar:

1. Abra o `index.html` no Chrome, clique em **Ligar câmera** e depois em **Calibrar alcance**.
2. Pegue e pouse o mago com a pinça, como antes. Confira que nada mudou.
3. Abra a mão e segure: a roda abre. Confira que soltar o mago (abrir os dedos) **não** abre a roda.
4. Aponte para a Bola de Fogo e feche o punho: o cartão pede um círculo. Repita depois com as outras magias (a roda mostra a runa de cada uma).
5. Com o ímã (o padrão): leve o indicador até o círculo tracejado e passe por cima dele até acender. Confira que o cursor gruda no trilho.
6. Desligue o ímã (`I`) e ligue a depuração (`D`). Aponte com o indicador, os outros dedos dobrados, e desenhe um círculo do tamanho de um prato, a uns 50 cm da câmera. Pare a mão no fim. Anote a nota. Repita com círculos pequenos, grandes, rápidos, lentos e começando em pontos diferentes. Desenhe também um triângulo e um rabisco: os dois devem ser recusados.
7. Na escolha do alvo, aponte um autômato e feche a pinça; depois feche o punho para lançar.
8. Encerre o turno com o polegar para cima e acompanhe a queimadura por três turnos.
9. Tire a mão da câmera no meio de um desenho: o traço para e o que foi desenhado é avaliado.

Se a caneta encostar sozinha, aumente `penOn` em `TRACKER_CONFIG` (`src/runes/RuneTracker.js`); se o traço terminar cedo demais, aumente `dwellMs`. Se as runas forem recusadas com notas um pouco abaixo do mínimo, baixe `minScore` do nível em `RECOGNIZER_LEVELS` (`src/runes/RuneRecognizer.js`). Para medir com números, use o treino de runas (tecla `O`) e exporte os resultados.

### Desempenho

- **Sem travar na primeira vez de cada magia.** Compilar os shaders de um efeito novo congelava a tela de 0,2 a 0,8 s no primeiro lançamento de cada magia (medido: Parede de Chamas 760 ms, Lança de Gelo 713 ms, Bola de Fogo 238 ms). Agora todos os efeitos são compilados durante a tela de carregamento ("Preparando as magias…"): o pior quadro do primeiro lançamento caiu para 18 a 54 ms, e nenhum shader novo é compilado durante o jogo.
- **Qualidade automática.** Se o jogo ficar abaixo de 40 quadros por segundo por 2,5 s, a qualidade desce um nível sozinha (alta → média → baixa), com um aviso, e a escolha fica salva. Escolher na mão (`L`) desliga o ajuste automático.
- **Menos luzes.** As magias usam no máximo 2 luzes dinâmicas na qualidade alta (1 na média, nenhuma na baixa). Cada luz pesa em todos os pixels do veludo do mago, mesmo apagada. O número de luzes muda ao recarregar a página.
- **Interface sem desfoque de fundo.** A barra de combate, a roda, o cartão e a depuração usam fundo opaco: o desfoque era refeito a cada quadro sobre a cena 3D.
- **Reservas com teto fixo.** Partículas, esferas, explosões, cristais, relâmpagos, fragmentos, marcas, rachaduras e luzes são reaproveitados; o teste no navegador confere com duas voltas pelas oito magias.
- A taxa de quadros aparece no painel, em **Quadros/s**. **A câmera** (o leitor de mãos do MediaPipe) roda no mesmo processo do jogo e também pesa: se travar só com a câmera ligada, baixe a qualidade com `L`.
- Não foi possível medir a taxa de quadros real aqui (o navegador de testes fica escondido e a placa de vídeo oscila); os números acima são de congelamentos, que são medidos de forma confiável.

### Limitações

- **Animações procedurais.** O mago não tem clipes de animação (nem o modelo feito em código, nem o `mago.glb` exportado). As oito animações (`src/character/CastAnimator.js`) são feitas em código, nos ossos, como a pose de voo: fases com transições suaves, e cada escola com seu jeito (fogo rápido e agressivo, gelo controlado, raio explosivo com recuo, terra pesada com golpe no chão). É uma aproximação: clipes feitos à mão (no Blender ou no Mixamo) ficariam mais naturais. As mãos não têm dedos animados (fechar a mão é um giro do osso da mão). Com um modelo de outro programa, os eixos dos ossos podem mudar e os braços podem ir para o lado errado.
- **Uma parede de chamas e uma muralha de cada vez**, na prática (a recarga de 4 turnos é maior que a duração de 3). Com `U` (restaurar recargas) dá para criar várias; elas funcionam, mas as luzes dinâmicas são só 3 e passam a ser emprestadas entre os efeitos.
- **O mago caído** (vida zero) não tem animação de queda: aparece um aviso e ele se recompõe.
- **Movimento sem limite por turno**, como antes: o mago pode ser levado para qualquer casa livre.
- **Webcam real não testada** aqui (veja o roteiro acima). Os números da caneta e da pausa foram escolhidos por teste com mãos simuladas e podem precisar de ajuste.
- **Desempenho no M2 não medido** aqui.

### Próximos passos sugeridos

- Testar com a webcam de verdade e ajustar o ímã e a caneta (roteiro acima).
- Medir a taxa de quadros no M2 com as oito magias e, se precisar, usar a qualidade média.
- Trocar as animações procedurais por clipes feitos à mão, mantendo os mesmos eventos (`release`, `done`) que as magias usam.

## O que a Etapa B entrega

### Telecinese

Você segura o mago por um ponto do corpo, como quem pega uma peça de xadrez pela cabeça. Esse ponto fica embaixo do cursor o tempo todo, então o mago não pula quando é pego. Ele passa por estes estados, que aparecem no painel em **Mago**:

| Estado | O que acontece |
| --- | --- |
| parado | De pé na casa, com o manto ao vento. |
| selecionado | O cursor está em cima dele: a silhueta acende em dourado e a casa dele acende. |
| agarrado | Você apertou o botão ou fechou a pinça: um susto rápido (peito para trás, cabeça para cima, braços abrem), faíscas e o brilho fica azul. |
| subindo | Os pés saem do chão aos poucos, até uns 70 cm. Aparece um círculo de runas no chão, embaixo dele. |
| levitando | Flutua subindo e descendo de leve. As pernas ficam soltas e dobradas, os pés apontam para baixo, o braço livre abre para equilibrar e ele olha para o chão. O manto balança mais e mais rápido, e sobe um brilho em espiral. |
| movendo no ar | Segue o cursor com uma mola, sem passar do ponto. Vira para onde está indo, inclina o corpo na direção do movimento e o manto fica para trás. |
| descendo | Você soltou sobre uma casa livre: ele vai até o centro dela e desce. |
| pousando | Os pés tocam o chão: ele agacha, o manto se abre, e saem um anel de faíscas, poeira e duas ondas de luz no chão. Depois volta ao normal. |
| voltando | Você soltou numa casa proibida, ou cancelou: ele volta voando para a casa de onde saiu e pousa lá. |

Enquanto o mago está no ar:

- **A casa de destino** é a que fica embaixo dele. Ela aparece marcada em azul, com cantos que se fecham sobre ela.
- **Casa proibida:** uma casa ocupada por boneco, ou fora do tabuleiro, fica vermelha e com um X. As casas ocupadas ficam com uma borda vermelha.
- **Os bonecos empurram o mago para o lado.** Ele não atravessa os bonecos.

**Voltar o último movimento.** Com o mago no chão, `Esc` (ou o polegar para baixo) faz ele voar de volta para a casa anterior. Dá para voltar vários movimentos seguidos.

**Sons.** Pegar, soltar, pousar, voltar e erro têm sons curtos, gerados na hora (`src/audio/Sfx.js`). É o gancho de áudio. Para usar sons gravados, basta trocar a função `play`.

### Gestos pela câmera

O leitor de mãos é o mesmo do Runa 2D, trazido para módulos separados:

- **Modelo de mãos.** O MediaPipe Gesture Recognizer acha 21 pontos da mão e dá um palpite de gesto.
- **Cursor estável.** O cursor fica entre o nó e a ponta do indicador e passa pelo filtro One Euro: segura o tremor com a mão parada e quase não atrasa com a mão rápida.
- **Pinça com folga.** A pinça fecha abaixo de um limite e só abre acima de outro, mais alto. Enquanto você segura o mago, abrir pede mais certeza e um pouco mais de tempo, para ele não cair sozinho.
- **Freio e rebobinar.** Enquanto os dedos fecham, o cursor para. A pinça vale onde o cursor estava um instante antes de os dedos começarem a fechar.
- **Gestos em votação.** O modelo do MediaPipe e a geometria dos dedos votam juntos. Um gesto só vira comando se ganhar com folga e ficar parado pelo tempo dele.
- **Calibração do alcance.** O botão **Calibrar alcance** mede até onde sua mão vai com conforto, e o cursor passa a chegar nas bordas da tela com menos esforço. O resultado fica salvo no navegador.

| Gesto | O que faz |
| --- | --- |
| Indicador apontando | Move o cursor da mão (o anel dourado) |
| Pinça (polegar no indicador) em cima do mago | Pega o mago |
| Mover a mão com a pinça fechada | Leva o mago pelo ar |
| Abrir os dedos | Pousa o mago na casa embaixo dele |
| Polegar para baixo (segure) | Com o mago no chão, volta o último movimento |
| Polegar para cima (segure) | Volta a câmera para a visão do tabuleiro |
| Sinal de V (segure) | Mostra ou esconde o painel |
| A mão sai da câmera segurando o mago | O mago volta para a casa de onde saiu |

Os gestos que precisam ser segurados mostram um anel que enche em volta do cursor, com o nome do que vão fazer. Na Etapa D, a mão aberta e o punho fechado passaram a conjurar magias, e o polegar para cima passou a encerrar o turno (e continua mostrando o tabuleiro). Veja a tabela da Etapa D, acima.

A prévia da câmera (canto de baixo, à esquerda) mostra os pontos da mão, a linha da pinça (vermelha quando fechada), o gesto que o jogo está lendo e o que fazer agora. O botão **Recolher** encolhe esse quadro.

### Como os gestos chegam ao jogo

A mão é só mais uma fonte de comandos, como o teclado e o mouse. Ela emite os mesmos comandos de ponteiro do mouse:

- `pointer.move`: o cursor andou.
- `pointer.down`: a pinça fechou.
- `pointer.up`: os dedos abriram.
- `pointer.cancel`: a mão sumiu segurando o mago.
- `pointer.leave`: a mão saiu da câmera.

Os gestos segurados emitem comandos do jogo (`action.cancel`, `camera.reset`, `ui.togglePanel`). A telecinese (`src/gameplay/Telekinesis.js`) só recebe "ponteiro" e não sabe se veio do mouse ou da mão. Por isso os dois funcionam juntos, e dá para trocar no meio.

## O que a Etapa A entrega

### O mago

Um mago original, de fantasia sombria, feito inteiro em código (`src/character/MageBuilder.js`):

- **Capuz** arredondado, com a ponta caindo para trás e borda dourada. O rosto fica em sombra, e só os olhos brilham, pulsando de leve.
- **Manto** azul aberto na frente, com forro roxo, dobras que aumentam até a barra e barrados dourados com runas nas bordas.
- **Capelete** sobre os ombros, com faixa de runas, e **túnica** roxa por baixo, com barrado e faixa central bordados.
- **Mangas largas** com punho dourado e forro roxo, **luvas** de couro e **botas**.
- **Faixa** na cintura, com nó, pontas soltas e fivela dourada.
- **Medalhão** dourado com uma gema azul que brilha, preso por uma corrente.
- **Cajado** de madeira torcida (três fios em volta de um miolo) que se abre numa coroa de galhos segurando um cristal azul. O cristal tem luz própria, e lascas menores crescem pelos galhos.

Os tecidos são de veludo (material com brilho de pelo, o *sheen*). Os barrados são dourados de verdade: metálicos e com reflexo. Uma sombra falsa escurece o fundo das dobras para dar volume.

As texturas também são geradas em código (`src/fx/textures.js`): veludo, barrados com runas, couro, madeira, pedra e os círculos de runas. As runas são glifos originais no estilo rúnico, não um alfabeto real.

### O esqueleto (rig)

O mago é uma única malha com pele (`SkinnedMesh`) ligada a um esqueleto de 35 ossos:

- **Corpo**, com nomes no padrão do Mixamo: `Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase` e os mesmos do lado direito.
- **Tecido**: quatro correntes na saia (`RobeFront`, `RobeBack`, `RobeLeft`, `RobeRight`, dois ossos cada), três ossos de capa nas costas (`Cape`, `Cape1`, `Cape2`) e a ponta do capuz (`HoodTip`).

Cada vértice tem até 4 ossos com pesos que somam 1, calculados pela distância aos ossos. A saia segue a corrente do lado em que está, e as mangas dobram no cotovelo. O cajado é filho do osso `RightHand`: quando a mão se mexe, o cajado vai junto.

O que já se mexe: o tecido balança ao vento (ossos da saia, da capa e do capuz, com ondas sobrepostas), e os olhos e o cristal pulsam. As **poses de teste** (tecla P) dobram braços, tronco, cabeça e pernas, só para mostrar que a malha acompanha os ossos. As animações de verdade (respirar, andar, correr...) são a Etapa C.

### A arena

- Tabuleiro 8×8 de lajes de pedra com bisel, rachaduras e variação de cor, sobre um rejunte escuro.
- Moldura de pedra com runas acesas, e um grande círculo de runas no chão em volta.
- Caverna: chão irregular que sobe para as paredes, rochas, paredões, estalagmites, aglomerados de cristais roxos e azuis com luz própria e runas brilhando nas paredes.
- Luz de cinema: luz principal com sombras suaves, contraluz roxa, preenchimento e um poço de luz sobre o tabuleiro. Brilho (*bloom*) nos olhos, cristais e runas.
- Névoa, poeira flutuando e bruma rente ao chão.
- Três bonecos de treino com barra de vida. Ao levar dano, piscam em vermelho, balançam e soltam o número do dano, colorido pelo elemento. Com a vida em zero, caem e voltam depois de alguns segundos.
- Câmera isométrica (lente longa, vista de cima em 45°) que gira e dá zoom. O botão esquerdo do mouse fica livre para o jogo: ele pega e leva o mago.

## Como testar

| O quê | Como |
| --- | --- |
| Pegar o mago com o mouse | Aperte o botão esquerdo em cima dele e arraste |
| Pousar | Solte o botão sobre uma casa livre (marcada em azul) |
| Casa proibida | Solte sobre um boneco ou fora do tabuleiro: ele volta sozinho |
| Cancelar no ar | `Esc` com o botão ainda apertado: ele volta para a casa de onde saiu |
| Voltar o último movimento | `Esc` com o mago no chão |
| Ligar a câmera | Botão **Ligar câmera** ou `C`. Depois, aponte com o indicador e feche a pinça em cima do mago |
| Calibrar o alcance da mão | Botão **Calibrar alcance**, com a câmera ligada |
| Girar a câmera | Botão direito e arrastar, ou `Q` e `E` (45° por vez) |
| Zoom | Roda do mouse, ou `+` e `−` |
| Ver o mago de perto | `F` |
| Voltar à visão do tabuleiro | `R` |
| Casa sob o cursor | Passe o mouse no tabuleiro: a casa acende e o painel mostra o nome (A1 a H8) |
| Ver o esqueleto | `K` (mostra ossos e juntas por cima da malha) |
| Poses de teste do rig | `P` (repouso, braços erguidos, olhando de lado, curvado, passo largo) |
| Ligar e desligar o vento no manto | `V` |
| Testar o dano | `T` (um boneco sorteado leva dano de um elemento sorteado) |
| Exportar o mago | `G` baixa `mago.glb` |
| Esconder o painel | `H` |

## Estrutura do código

```
index.html            a página do jogo; carrega jogo.js e abre direto, sem servidor
jogo.js               o jogo inteiro num arquivo (gerado de src/ por build.mjs; não edite à mão)
dev.html              a mesma página lendo os módulos de src/ (precisa do servidor)
build.mjs, package.json  geram o jogo.js (npm run build)
styles/main.css       visual do painel, barras de vida e números de dano
src/main.js           monta tudo e liga os comandos
src/core/Engine.js    renderizador, cena, câmera, controles, pós-processamento e laço de quadros
src/world/Arena.js    caverna, luzes, cristais, runas, névoa e poeira
src/world/Board.js    tabuleiro 8×8, moldura, casa sob o cursor, marcador de destino; converte casa <-> posição
src/world/TrainingDummy.js  boneco de treino com vida e reação a dano
src/character/skeleton.js   ossos do mago (nomes e posições)
src/character/geometry.js   ferramentas de modelagem (loft de tecido, forro, fitas) e pesos de pele
src/character/MageBuilder.js  modelo do mago, materiais e pose de repouso
src/character/Staff.js      cajado e cristais
src/character/Mage.js       o mago em cena: tecido ao vento, pose de voo, brilho de borda, poses de teste, esqueleto visível
src/character/loadGLB.js    carrega um mago de um arquivo .glb
src/character/exportGLB.js  exporta o mago para .glb
src/fx/textures.js          texturas geradas em código
src/input/Commands.js       camada de comandos: teclado e mouse
src/input/HandInput.js      a mão na câmera como fonte de comandos (MediaPipe, pinça, gestos, calibração)
src/input/hand/handReading.js  leitura da mão sem tela: medidas dos dedos, votos dos gestos, filtro One Euro e ajustes
src/gameplay/Telekinesis.js telecinese de qualquer personagem (pegar, subir, levitar, mover, soltar, pousar, voltar) e o grupo que decide quem o ponteiro aponta
src/fx/MagicFx.js           partículas (com cor que muda ao longo da vida) e ondas de choque, usadas pelo pouso e pelas magias
src/fx/SpellFx.js           efeitos das magias: reserva de luzes, esfera de fogo, explosão, marca de queimadura, chamas em quem queima
src/fx/IceFx.js             gelo: cristais na mão, lança, estilhaços, névoa, prisão de cristais
src/fx/LightningFx.js       raio: relâmpagos ramificados, faíscas, descargas na carga, clarão
src/fx/EarthFx.js           terra: blocos da muralha, fragmentos, poeira, rachaduras, onda sísmica
src/fx/FireWallFx.js        parede de chamas: chamas por casa, brasas, fumaça, casas perigosas, luz
src/fx/glsl.js              ruído GLSL usado pelo fogo
src/audio/Sfx.js            sons curtos gerados na hora (gancho de áudio)
src/ui/Hud.js               painel de testes
src/ui/HandView.js          prévia da câmera, cursor da mão, anel dos gestos e calibração
src/ui/RuneCanvas.js        a trilha luminosa da runa, a runa-guia, o brilho do acerto e o esmaecer do erro
src/ui/SpellUi.js           roda de magias, cartão da magia, barra de combate e depuração das runas
src/runes/runeShapes.js     os modelos das oito runas
src/runes/RuneTracker.js    rastreamento da trajetória do dedo: suavização, caneta, começo e fim do traço
src/input/hand/CursorFilter.js  filtro do cursor da mão (One Euro 2D na área da câmera, salto de um quadro, adiantamento)
src/input/hand/PinchDetector.js pinça: histerese, confirmação, folga quando a mão some, limites pessoais
src/input/hand/handCalibration.js medição da calibração do jogador (cinco passos, sem tela)
src/input/InteractionContext.js o que a mão pode fazer em cada contexto do jogo
src/ui/CalibrationWizard.js janela da calibração passo a passo
src/ui/VisionDiagnostics.js painel de diagnóstico da visão (tecla X)
src/ui/VisionEval.js        modo de avaliação com a webcam real (precisão e atraso)
src/runes/RuneGuide.js      ímã: a runa como trilho, a caneta grudando nele, o quanto já acendeu e a continuidade
src/runes/difficulty.js     dificuldade das runas: Fácil (guiada), Normal, Avançado
src/runes/RunePractice.js   registro do treino de runas (acertos, falsos disparos, tempo por tentativa)
src/ui/RuneTrainerUi.js     painel do treino de runas
src/character/WarriorBuilder.js  modelo do guerreiro (armadura, elmo, espada com runas, escudo) no esqueleto comum
src/character/Warrior.js    o guerreiro em cena: respiração, caminhada, corrida, tabardo e pluma, brilho de seleção
src/character/warriorMoves.js  golpes do guerreiro (Corte Horizontal), com o evento de impacto
src/warrior/abilities.js    atributos do guerreiro e as seis habilidades (números e gestos)
src/warrior/warriorRules.js regras: caminhada, arco do corte, custos, treino, impacto
src/warrior/WarriorGestures.js  reconhecedor de gestos do guerreiro (trajetória, velocidade, pose ao longo do tempo)
src/warrior/WarriorController.js  estados do guerreiro: seleção, caminhada, golpe, recuperação
src/fx/WarriorFx.js         rastro da lâmina e faíscas
src/ui/WarriorUi.js         troca de personagem, barra do guerreiro e leitura do gesto
src/dev/fakeHand.js         mão sintética (21 pontos) para os testes
assets/guerreiro.glb        o guerreiro exportado, pronto para o Blender
src/runes/RuneRecognizer.js reconhecimento das runas ($1 adaptado, várias formas de traço, medidas de forma)
src/spells/spellBook.js     os números das oito magias
src/spells/spellRules.js    regras das magias: alvo válido, área, alvo sugerido, o que acontece no impacto
src/spells/SpellCaster.js   o fluxo da magia: roda, desenho, runa reconhecida, alvo, lançamento
src/spells/castEffects.js   a execução de cada magia na cena (as oito)
src/character/CastAnimator.js  animações de conjuração em código, nos ossos (as oito), e a reação a dano
src/combat/Combat.js        combate por turnos: unidades, dano, efeitos, obstáculos, áreas perigosas, mana, recargas
src/combat/statusEffects.js os cinco efeitos de status e as regras de duração
src/combat/enemyAI.js       os autômatos: andar até o mago e atacar
src/combat/TurnFlow.js      o turno dos inimigos, passo a passo
src/combat/UnitViews.js     liga as unidades do combate às figuras da cena (dano, efeitos, queda, pulo)
src/world/TargetMarkers.js  alcance, área, mira e casa inválida no tabuleiro
src/core/Settings.js        qualidade gráfica (alta, média, baixa)
src/dev/selfTest.js         teste automático no navegador (?testes)
tests/                      testes sem navegador (npm test): cursor, pinça, contextos, calibração, runas (e casos difíceis), rastreamento, ímã, treino, combate e guerreiro
vendor/three/               Three.js r170 e os módulos usados
assets/mago.glb             o mago exportado, pronto para o Blender
```

### Camada de comandos

O jogo não reage a teclas, cliques nem dedos: reage a **comandos** (`camera.rotateLeft`, `action.cancel`, `pointer.down`...). O teclado, o mouse e a mão são só fontes que emitem esses comandos (`src/input/Commands.js` e `src/input/HandInput.js`). Uma fonte nova, como um controle de videogame ou outro modelo de mãos, só precisa emitir os mesmos nomes.

**Para ajustar a mão:** os números (limites da pinça, tempos de cada gesto, filtro do cursor) ficam em `HAND_CONFIG`, no começo de `src/input/hand/handReading.js`, com um comentário em cada um. No console do navegador, `runa3d.hand.config` mostra os valores em uso, e `runa3d.hand.hand` mostra a leitura da mão quadro a quadro.

## Como trocar ou melhorar o modelo

**No código.** As formas do tecido são anéis empilhados (`innerRobe`, `outerCloak`, `capelet`, `hood`, `sleeve` em `MageBuilder.js`): mudar raios e alturas muda a silhueta. As cores e os barrados ficam em `makeMaterials`. As proporções do corpo ficam em `skeleton.js`.

**No Blender.**

1. Baixe `mago.glb` com a tecla `G`, ou use `assets/mago.glb`.
2. No Blender: *File › Import › glTF 2.0*. Vêm a malha, o esqueleto (*armature*), os pesos, os materiais e o cajado.
3. Edite à vontade: esculpir as dobras, refazer o rosto, ajustar pesos (*Weight Paint*). Mantenha os **nomes dos ossos**, o objeto **Cajado** e o material **olhos**, porque o jogo procura por eles.
4. Exporte: *File › Export › glTF 2.0*, formato *glTF Binary (.glb)*, com *Skinning* marcado. Salve em `assets/`, por exemplo `assets/mago-blender.glb`.
5. Rode o `iniciar.command` e abra `http://localhost:8001/?modelo=assets/mago-blender.glb`. O jogo usa o arquivo no lugar do modelo feito em código. Se faltar algum osso importante, ele avisa no rodapé. Isso precisa do servidor: aberto direto do arquivo, o navegador não lê o `.glb`.

**Com um personagem pronto (Mixamo, Sketchfab...).** Funciona do mesmo jeito, desde que seja um `.glb` com esqueleto. Os nomes do Mixamo (`mixamorig:Hips`...) já são reconhecidos. Sem um objeto chamado **Cajado**, o mago aparece sem o brilho do cristal, mas o resto funciona.

## O que é verdade agora e o que ainda falta

- **Feito e testado.** Os testes automáticos rodam num navegador sem placa de vídeo e conferem estes pontos.
  - **Etapa A (11 testes):**
    - a malha com 35 ossos e pesos que somam 1;
    - as luvas acompanham o braço;
    - o cajado preso à mão;
    - o tecido balança;
    - a casa sob o cursor e o dano de teste;
    - o giro da câmera;
    - o `.glb` que exporta e volta a abrir.
  - **Telecinese com o mouse (26 testes):**
    - passar em cima seleciona e acende a borda dourada;
    - apertar agarra, e o mago sobe acima de 50 cm;
    - arrastar leva o mago, e o destino aparece válido;
    - as casas ocupadas ficam marcadas;
    - as pernas dobram no ar;
    - soltar desce, pousa no centro da casa certa e solta faíscas;
    - casa ocupada e fora do tabuleiro fazem ele voltar, com aviso;
    - `Esc` no ar cancela, e `Esc` no chão volta o último movimento.
  - **Telecinese com a mão (18 testes):** usam mãos simuladas com proporções reais, alimentadas no mesmo leitor que recebe a câmera.
    - apontar seleciona, e a pinça pega o mago;
    - mover a mão leva o mago, e abrir os dedos pousa;
    - polegar para baixo volta o último movimento;
    - pousar sobre um boneco é recusado;
    - a mão sumir segurando o mago faz ele voltar;
    - o V esconde o painel, e o polegar para cima volta a câmera.
  - **Modelo de arquivo:** o mago carregado de `assets/mago.glb` também é pego, levita e pousa.
  - **Aberto direto do arquivo:** os testes da telecinese passam também com o `index.html` aberto direto do disco, sem servidor.
  - **Câmera falsa do Chrome:** com ela, o jogo liga a câmera e carrega o leitor de mãos direto do disco. O modelo de mãos em si não dá para baixar aqui, então essa parte só roda de verdade no seu computador.
- **Limites.**
  - **Câmera de verdade.** Os testes desta etapa usaram mãos simuladas. Uma webcam de verdade não foi testada aqui. Os números da pinça e dos gestos vieram do Runa 2D, onde foram ajustados com mãos de verdade. Se a pinça estiver dura ou solta demais, comece calibrando o alcance e depois ajuste `pinchOn` e `pinchOff`.
  - **As poses da telecinese são calculadas em código, quadro a quadro, nos ossos:** susto, subida, voo, inclinação e agachamento do pouso. Não são clipes de animação feitos à mão. A Etapa C troca isso por uma máquina de estados de animação com transições suaves.
  - **Modelos de outro programa.** Com um modelo vindo do Mixamo ou de outro programa, os ossos podem ter outros eixos, e a pose de voo pode dobrar para o lado errado.
  - **Movimento sem limite.** O mago pode ir para qualquer casa livre. O alcance por turno chega com o combate (Etapa E).
  - **Volta em linha reta.** Ao voltar sozinho, o mago voa em linha reta e pode passar por cima de um boneco no caminho.
  - **Câmera do jogo e gestos.** Girar e dar zoom ainda não tem gesto: só mouse e teclado.
- **Ainda não feito.**
  - **C:** as animações da lista (repouso respirando, caminhada, corrida, giro, guarda de combate, dano, morte, ressurreição e as da telecinese como clipes).
  - **D:** pronta (veja a seção da Etapa D). Falta só o teste com a webcam de verdade.
  - **E:** o combate de verdade, fora da arena de treino (inimigos que não voltam, vitória e derrota, alcance de movimento por turno).

## Próximas etapas

- **C. Animações:** uma máquina de estados com transições suaves entre todas.
- **D. Magias:** pronta. As oito magias, cada uma conjurada pela sua runa.
- **E. Combate:** fora da arena de treino, com vitória, derrota e alcance de movimento por turno.

## Créditos

- Three.js r170, licença MIT (`vendor/three/LICENSE`).
- Fontes: Cinzel e Alegreya Sans, pelo Google Fonts.
- MediaPipe Tasks Vision 0.10.21 e o modelo Gesture Recognizer, do Google (licença Apache 2.0), baixados do jsDelivr e do Google Cloud Storage quando a câmera liga.
