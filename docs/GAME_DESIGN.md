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
| Distribuição | Gratuita, com o objetivo de formar uma comunidade. |
| Dificuldade | Simulação dura: anos no circuito, derrotas frequentes e possibilidade real de a carreira não dar certo. |
| Modo de jogo | Circuito online compartilhado, com atletas administrados por pessoas competindo entre si. |
| Organização online | Um único circuito mundial e um ranking compartilhado por todos. |
| Partidas entre humanos | Horários agendados pelo circuito; orientação ao vivo e plano tático automático para ausências. |
| Idiomas iniciais | Português, inglês e espanhol. |
| Partidas | 3D realista, com proporções, movimentos e câmera próximos de uma transmissão de TV. |
| Carreira inicial | Criar um profissional com nível técnico de Challenger; a posição no ranking é conquistada pelos resultados. |
| Criação do atleta | Personalização completa e distribuição de atributos dentro de um orçamento equilibrado para todos. |
| Fim de carreira | Novo atleta com novo orçamento inicial; a carreira anterior permanece no histórico. |
| Acesso à competição | Circuito de acesso próprio do jogo, com torneios abertos que dão vagas; manter o calendário real de ATP e Challenger. |
| Mundo | Calendário e adversários reais, com o atleta do jogador criado. |
| Renovação do circuito | Tenistas reais envelhecem e se aposentam; novos talentos fictícios entram no circuito. |
| Temporada inicial | 2027. |
| Velocidade do mundo | Uma semana do jogo por dia real, aproximadamente 52 dias por temporada. |
| Ritmo de acompanhamento | Partida comum em aproximadamente 10–15 minutos; relógio comum ao vivo e pausa/aceleração nos replays. |
| Condição financeira inicial | Apoio limitado: reserva ou patrocinador que permita planejar a primeira temporada. |
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

O usuário concluiu a revisão estrutural em 9 de novembro de 2026 e aprovou o início do desenvolvimento na nuvem. Autorizou retomar o chat de configuração do ambiente e abrir um novo chat de desenvolvimento.

O escopo consolidado aprovado está em [V1_SCOPE.md](V1_SCOPE.md). A posição inicial perto do top 300 foi substituída, por decisão do usuário, pelo nível técnico de Challenger com classificação conquistada por resultados.

## Proposta de ciclo de jogo — para discussão

1. Avaliar condição física, evolução técnica, dinheiro e situação no ranking.
2. Planejar o próximo período: treinar, disputar um torneio ou recuperar.
3. Distribuir o treino entre academia, quadra e foco técnico.
4. Rever propostas de patrocínio e ajustar equipamento quando necessário.
5. Preparar a partida considerando piso, adversário, intensidade e condição do atleta.
6. Assistir à partida em 3D e dar orientações entre games.
7. Receber um resumo que conecte resultado, desempenho, desgaste, receitas e ranking às decisões anteriores.
8. Replanejar a carreira com as novas informações.

O ranking precisa refletir o circuito inteiro: os adversários também disputam torneios e conquistam ou perdem pontos. A escolha de um torneio deve respeitar calendário, elegibilidade e acesso à chave. A temporada inicial é 2027; a revisão das regras aplicáveis ainda será concluída.

## Princípios propostos para os sistemas

- **Estilos viáveis:** saque, jogo de fundo, defesa, devolução e jogo de rede devem permitir caminhos competitivos diferentes.
- **Treino com custo de oportunidade:** melhorar um fundamento ocupa tempo que poderia ser investido em outro, em competição ou em recuperação.
- **Desgaste acumulado:** esforço de uma partida deve influenciar as seguintes e o planejamento do calendário.
- **Intensidade contextual:** o custo e a utilidade de jogar forte variam com condicionamento, duração, adversário e situação da carreira.
- **Esforço e tática separados:** intensidade física não é o mesmo controle que agressividade dos golpes. Uma estratégia defensiva pode exigir grande esforço em trocas longas.
- **Equipamento com trocas claras:** opções favorecem características diferentes; trocar raquete ou cordas não deve equivaler a comprar uma vitória.
- **Patrocínio como decisão:** remuneração pode vir acompanhada de obrigações e restrições que façam sentido na carreira.
- **Explicação do resultado:** o pós-jogo deve mostrar evidências de acertos e limitações, sem tratar um único evento aleatório como prova de uma estratégia errada.
- **Mundo persistente:** a temporada progride para todos, e a carreira pode continuar por vários anos.
- **Concorrência compartilhada:** humanos e adversários controlados pelo jogo participam do mesmo circuito, com resultados persistentes e calendário comum.
- **Dificuldade explicável:** sucesso não é garantido. Condição, habilidade, tática, concorrência e recursos devem sustentar o desafio, com evidências para o jogador analisar suas decisões.

Parâmetros de treino, fadiga e lesões serão modelos de jogo sujeitos a balanceamento; ainda não foram estabelecidos números ou fórmulas.

## Direção técnica proposta — ainda sem engine escolhida

Separar a simulação da carreira, a simulação da partida e a apresentação 3D. Isso permite validar regras e resultados na nuvem e depois observar visualmente a mesma partida.

A quadra 3D deve representar os eventos produzidos pela simulação: movimentação, golpes, bola, pontos e placar devem concordar. Evitar uma animação desconectada do que determina o resultado.

Dados de atletas, equipamentos, calendários e regras devem ser identificados por temporada e origem. Adversários reais exigem um ponto de partida datado; as temporadas seguintes passam a ser consequências da simulação.

A engine, o desempenho alvo e os formatos de distribuição ainda estão em aberto. A direção visual confirmada é realista, e as plataformas iniciais são Windows e macOS. O repositório contém apenas documentação, sem dependências ou código do jogo.

## Primeiro recorte jogável aprovado

Uma semana do mundo, com um grupo pequeno de teste, que já conecte criação do atleta, treino, descanso, evento de acesso, intensidade, equipamento, uma proposta de patrocínio, partida 3D e atualização do ranking nos eventos pontuáveis. O detalhamento está em [V1_SCOPE.md](V1_SCOPE.md). Esse recorte serve para testar o ciclo completo; não substitui o objetivo final de uma carreira até o número 1.

Aprovar um protótipo requer observar uma partida real da simulação, com golpes e placar coerentes, e verificar efeitos das decisões sobre evolução, desempenho e desgaste. Também é necessário persistir e retomar a carreira sem perder o estado oficial do circuito. Com o modo online confirmado, o recorte deve demonstrar dois participantes na mesma partida e a execução do plano de ausência.

O usuário aprovou esse recorte. A qualidade visual precisa ser demonstrada durante o desenvolvimento; a aprovação do escopo não comprova a qualidade de um resultado ainda inexistente.

## Decisões seguintes

- Referências concretas de qualidade visual e animação para a direção realista escolhida.
- Data exata de início em 2027, elenco real e histórico inicial de pontos, com versões e datas das fontes.
- Detalhes da seleção de melhores momentos e da retomada até o momento ao vivo, respeitando o relógio comum aprovado.
- Faixas de idade, limites dos atributos e valor exato do apoio financeiro, como parâmetros de balanceamento da criação completa já confirmada.
- Dimensões do treino, equipe, economia e configuração de cordas.
- Tratamento de marcas reais e conteúdo visual antes da distribuição pública gratuita.
- Quantidade de vagas e regras detalhadas do circuito de acesso confirmado.
- Disponibilidade para partidas agendadas e condições detalhadas do plano de ausência.

As propostas detalhadas estão em [CAREER_SYSTEMS.md](CAREER_SYSTEMS.md). Elas não devem ser promovidas a decisões confirmadas sem a conversa correspondente.

O desenho do mundo compartilhado e suas decisões pendentes estão em [ONLINE_CIRCUIT.md](ONLINE_CIRCUIT.md).

## Referências oficiais localizadas

- Calendário ATP: https://www.atptour.com/en/tournaments/
- Anúncio do calendário ATP 2027: https://www.atptour.com/en/news/2027-atp-tour-calendar-release
- Calendário ATP 2027, versão de 14 de janeiro de 2026: https://www.atptour.com/-/media/files/calendar-pdfs/2026/2027-atp-tour-calendar-14-january-2026.pdf
- Perguntas sobre o ranking: https://www.atptour.com/en/rankings/rankings-faq
- Explicação do ranking ao vivo: https://www.atptour.com/en/rankings/rankings-faq/live

Pesquisa inicial em 9 de novembro de 2026. O acesso direto à página de perguntas do ranking retornou HTTP 403; os resultados indexados não substituem a validação do regulamento completo. Calendário Challenger, distribuição de pontos, elegibilidade, resultados obrigatórios e exceções precisam ser verificados na fonte correspondente à temporada escolhida antes de implementar as regras.

O anúncio oficial confirma que o calendário principal de 2027 já foi publicado. A pesquisa não validou um calendário Challenger completo de 2027 nem um conjunto completo de regras e rankings iniciais de 2027. O PDF de janeiro foi localizado como referência inicial, sem comprovação de ser a revisão mais recente. Dados ainda não disponíveis ou não verificados não devem ser inventados e apresentados como oficiais. O desenvolvimento pode usar dados provisórios identificados, com atualização posterior das fontes.

### Conferência adicional de fontes — 9 de novembro de 2026

| Dado | Evidência localizada | Limite de uso |
| --- | --- | --- |
| Savannah Challenger 2027 | O [organizador anuncia 5–11 de abril de 2027](https://savannahchallenger.com/tournament/). | Confirma a data anunciada desse evento. A mesma página conserva resultados e ordens de jogo de outras edições; não importar esses blocos como dados de 2027. Categoria, premiação e regras de entrada ainda precisam de fonte específica. |
| Sede das ATP Finals de 2027 | A [ATP confirmou Turim em 16 de julho de 2026](https://www.atptour.com/en/news/nitto-atp-finals-2027-turin-extension), em texto oficial disponível no índice de pesquisa. | Atualiza a sede genérica “Itália” do calendário inicial; valores financeiros de edições anteriores na notícia não são a premiação de 2027. |
| Regras de ranking versionadas | A [ATP anunciou 18 resultados contabilizáveis em 2026](https://www.atptour.com/en/news/atp-builds-on-record-year-2026), em vez dos 19 anteriores. | Evidência de mudança entre temporadas. Não assumir que uma fórmula antiga ou a de 2026 já corresponde ao regulamento de 2027. |

Foram localizados também links de PDFs combinados com datas de [18 de junho](https://www.atptour.com/-/media/files/calendar-pdfs/2026/2026-27-atp-challenger-calendar-as-of-18-jun-2026.pdf) e [18 de agosto de 2026](https://www.atptour.com/-/media/files/calendar-pdfs/2026/2026-27-atp-challenger-calendar-as-of-18-aug-2026.pdf). O acesso direto retornou HTTP 403; o conteúdo completo e a revisão mais recente continuam sem validação. Um título contendo “2026–27” não comprova que todos os eventos Challenger de 2027 estejam incluídos.

Na carga de dados, conferir a temporada em cada seção e associar origem, data de consulta e estado de confirmação aos campos importados. Datas anunciadas pelo organizador são evidência por evento, não substituem a validação do calendário completo pela ATP.

## Execução do projeto

A implementação começa na nuvem, depois da validação do ambiente e do acesso ao repositório. Este documento registra decisões de produto e propostas; não constitui uma implementação ou uma validação do jogo.
