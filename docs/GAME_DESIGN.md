# ATP Simulator — visão de jogo

Documento de trabalho, iniciado em 9 de novembro de 2026. As seções distinguem decisões confirmadas de propostas ainda em discussão. O nome do repositório é um nome de trabalho.

## Objetivo confirmado

Criar um jogo de gestão de carreira de tênis para PC. O jogador administra um atleta e tenta levá-lo ao número 1 do ranking. As partidas são disputadas automaticamente, e o jogador assiste aos efeitos das suas decisões.

O desenvolvimento será colaborativo, com perguntas ao usuário em etapas. A implementação deve começar em um ambiente de nuvem; a preparação local está limitada ao desenho do jogo e à documentação para transferência.

Repositório escolhido pelo usuário: https://github.com/pprjcorp-ux/ATP-Simulator

## Decisões confirmadas

| Tema | Decisão do usuário |
| --- | --- |
| Plataforma | Windows e macOS desde a primeira versão. |
| Partidas | 3D realista, com proporções, movimentos e câmera próximos de uma transmissão de TV. |
| Carreira inicial | Criar um profissional no Challenger, perto do top 300. |
| Mundo | Calendário e adversários reais, com o atleta do jogador criado. |
| Controle dos golpes | Automático; o jogador assiste à partida. |
| Orientações durante a partida | Ajustar intensidade e instruções táticas entre games. |
| Profundidade da gestão | Máximo detalhe, com controle de treinos, finanças, equipe, viagens e equipamentos. |
| Progressão | Administrar a carreira para alcançar o número 1. |
| Treino físico | Decidir quanto tempo investir na academia. |
| Treino técnico | Decidir o tempo de quadra e quais movimentos priorizar. |
| Patrocínios | Avaliar propostas e aceitar ou recusar contratos. |
| Equipamento | Escolher raquete e configuração de cordas. |
| Calendário | Escolher os torneios e quando descansar. |
| Intensidade | Definir o esforço em cada partida, equilibrando desempenho e risco de lesão. |
| Execução do desenvolvimento | Migrar para a nuvem assim que a implementação começar. |

## Proposta de ciclo de jogo — para discussão

1. Avaliar condição física, evolução técnica, dinheiro e situação no ranking.
2. Planejar o próximo período: treinar, disputar um torneio ou recuperar.
3. Distribuir o treino entre academia, quadra e foco técnico.
4. Rever propostas de patrocínio e ajustar equipamento quando necessário.
5. Preparar a partida considerando piso, adversário, intensidade e condição do atleta.
6. Assistir à partida em 3D e dar orientações entre games.
7. Receber um resumo que conecte resultado, desempenho, desgaste, receitas e ranking às decisões anteriores.
8. Replanejar a carreira com as novas informações.

O ranking precisa refletir o circuito inteiro: os adversários também disputam torneios e conquistam ou perdem pontos. A escolha de um torneio deve respeitar calendário, elegibilidade e acesso à chave. A temporada inicial e o nível de detalhe das regras ainda serão definidos.

## Princípios propostos para os sistemas

- **Estilos viáveis:** saque, jogo de fundo, defesa, devolução e jogo de rede devem permitir caminhos competitivos diferentes.
- **Treino com custo de oportunidade:** melhorar um fundamento ocupa tempo que poderia ser investido em outro, em competição ou em recuperação.
- **Desgaste acumulado:** esforço de uma partida deve influenciar as seguintes e o planejamento do calendário.
- **Intensidade contextual:** o custo e a utilidade de jogar forte variam com condicionamento, duração, adversário e situação da carreira.
- **Equipamento com trocas claras:** opções favorecem características diferentes; trocar raquete ou cordas não deve equivaler a comprar uma vitória.
- **Patrocínio como decisão:** remuneração pode vir acompanhada de obrigações e restrições que façam sentido na carreira.
- **Explicação do resultado:** o pós-jogo deve mostrar evidências de acertos e limitações, sem tratar um único evento aleatório como prova de uma estratégia errada.
- **Mundo persistente:** a temporada progride para todos, e a carreira pode continuar por vários anos.

Parâmetros de treino, fadiga e lesões serão modelos de jogo sujeitos a balanceamento; ainda não foram estabelecidos números ou fórmulas.

## Direção técnica proposta — ainda sem engine escolhida

Separar a simulação da carreira, a simulação da partida e a apresentação 3D. Isso permite validar regras e resultados na nuvem e depois observar visualmente a mesma partida.

A quadra 3D deve representar os eventos produzidos pela simulação: movimentação, golpes, bola, pontos e placar devem concordar. Evitar uma animação desconectada do que determina o resultado.

Dados de atletas, equipamentos, calendários e regras devem ser identificados por temporada e origem. Adversários reais exigem um ponto de partida datado; as temporadas seguintes passam a ser consequências da simulação.

A engine, o desempenho alvo e os formatos de distribuição ainda estão em aberto. A direção visual confirmada é realista, e as plataformas iniciais são Windows e macOS. Nenhuma dependência de implementação foi instalada.

## Primeiro recorte jogável proposto

Um trecho de carreira no Challenger que já conecte treino, descanso, torneio, intensidade, equipamento, uma proposta de patrocínio, partida 3D e atualização do ranking. Esse recorte serve para testar o ciclo completo; não substitui o objetivo final de uma carreira até o número 1.

Aprovar um protótipo requer observar uma partida real da simulação, com golpes e placar coerentes, e verificar efeitos das decisões sobre evolução, desempenho e desgaste. Também é necessário salvar e retomar a carreira sem perder o estado.

Ainda não há aprovação do tamanho desse recorte ou da qualidade visual inicial.

## Decisões seguintes

- Referências concretas de qualidade visual e animação para a direção realista escolhida.
- Temporada e data de início da carreira, incluindo elenco real e histórico inicial de pontos.
- Ritmo: duração de uma partida assistida, aceleração e melhores momentos.
- Idade, orçamento e personalização do atleta inicial.
- Dimensões do treino, equipe, economia e configuração de cordas.
- Tratamento de marcas reais e conteúdo visual antes de qualquer publicação comercial.
- Escopo do primeiro recorte jogável e critérios de aceitação.

## Referências oficiais localizadas

- Calendário ATP: https://www.atptour.com/en/tournaments/
- Visão do calendário ATP 2026: https://www.atptour.com/en/news/what-is-the-2026-atp-tour-calendar/
- Perguntas sobre o ranking: https://www.atptour.com/en/rankings/rankings-faq
- Explicação do ranking ao vivo: https://www.atptour.com/en/rankings/rankings-faq/live

Pesquisa inicial em 9 de novembro de 2026. O acesso direto à página de perguntas do ranking retornou HTTP 403; os resultados indexados não substituem a validação do regulamento completo. Calendário Challenger, distribuição de pontos, elegibilidade, resultados obrigatórios e exceções precisam ser verificados na fonte correspondente à temporada escolhida antes de implementar as regras.

## Execução do projeto

A implementação começa na nuvem, depois da validação do ambiente e do acesso ao repositório. Este documento registra decisões de produto e propostas; não constitui uma implementação ou uma validação do jogo.
