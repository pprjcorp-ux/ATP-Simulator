# ATP Simulator — preparação para a nuvem

## Limite de execução

O usuário determinou que a implementação do jogo comece na nuvem. A etapa local prepara o produto e o repositório. Este documento não comprova uma migração: é necessário observar um ambiente executável, um checkout correto e comandos executados nesse ambiente.

**Direção atual:** as decisões estruturais foram consolidadas em [V1_SCOPE.md](V1_SCOPE.md), que aguarda a revisão final do usuário antes de abrir o chat de desenvolvimento na nuvem. Uma configuração de ambiente pode estar em preparação, mas isso não autoriza iniciar o código do jogo antes de concluir essa etapa com o usuário.

Repositório: https://github.com/pprjcorp-ux/ATP-Simulator

## Contexto confirmado

Ler primeiro [GAME_DESIGN.md](GAME_DESIGN.md). As decisões já respondidas pelo usuário são:

1. Jogo para Windows e macOS desde a primeira versão.
2. Partidas 3D realistas, com proporções, movimentos e câmera próximos de uma transmissão de TV.
3. Atleta criado com nível técnico de Challenger; a posição efetiva no ranking é conquistada pelos resultados.
4. Calendário e adversários reais.
5. Golpes automáticos; o jogador dá instruções táticas e altera intensidade entre games.
6. Gestão no máximo detalhe: treinos, finanças, equipe, viagens e equipamentos.
7. Treino físico e técnico, patrocínios, raquete, cordas, calendário, descanso e risco de lesão são partes obrigatórias da carreira.
8. Temporada inicial de 2027.
9. Partida comum acompanhada em aproximadamente 10–15 minutos, com velocidade ajustável.
10. Apoio financeiro inicial limitado para permitir o planejamento da primeira temporada.
11. Distribuição gratuita para formar uma comunidade.
12. Simulação dura, com derrotas frequentes, carreira de vários anos e possibilidade real de não alcançar o topo.
13. Um único circuito online mundial, com ranking compartilhado e atletas humanos competindo entre si.
14. Partidas agendadas pelo circuito, com orientações ao vivo e plano tático automático para ausências.
15. Português, inglês e espanhol na primeira versão pública.
16. Tenistas reais envelhecem e se aposentam; novos talentos fictícios entram no circuito.
17. Uma semana do jogo por dia real, aproximadamente 52 dias por temporada.
18. Personalização completa e distribuição de atributos dentro de um orçamento equilibrado para todos.
19. Ao terminar uma carreira, criar outro atleta com novo orçamento inicial e preservar o histórico anterior.
20. Circuito de acesso próprio do jogo, com torneios abertos que concedem vagas; manter o calendário real de ATP e Challenger.

A decisão atual de entrada substitui a proposta anterior de garantir uma posição perto do top 300. Consultar [ONLINE_CIRCUIT.md](ONLINE_CIRCUIT.md) para as regras do mundo compartilhado e [V1_SCOPE.md](V1_SCOPE.md) para a sequência de implementação proposta.

Uma interface de gestão isolada, uma partida apenas textual ou um demonstrador 2D não atendem à direção confirmada. O primeiro recorte deve caminhar para a carreira completa até o número 1; um protótipo não encerra o objetivo.

## Preparação do ambiente

1. Confirmar que o ambiente pertence a este projeto e está executável. Se houver ferramentas de status do ambiente, usá-las antes de presumir acesso.
2. Verificar que o checkout corresponde ao repositório e à revisão pretendidos. Ler o estado Git e preservar alterações existentes.
3. Confirmar acesso ao repositório, instalação de dependências de fontes oficiais, capacidade de executar testes e disponibilidade de renderização 3D.
4. Escolher e fixar uma versão estável da engine e dos exportadores. A decisão deve considerar animação de personagens, contato raquete/bola, Windows, macOS e validação em nuvem.
5. Configurar um build mínimo em branch `codex/` e validar sua execução no próprio ambiente. Não instalar a ferramenta de desenvolvimento local como substituto da migração solicitada.
6. Registrar comandos e resultados reais. Distinguir execução sem interface, exportação, observação visual e validação em cada sistema operacional.

## Estrutura funcional proposta

- **Carreira:** agenda, treino, fadiga, evolução, equipe, finanças, equipamento e patrocínios.
- **Circuito:** eventos, inscrições, acesso às chaves, sorteios, partidas dos adversários, pontuação e ranking.
- **Partida:** regras de tênis, escolhas dos atletas, deslocamento, golpes, condição física e orientações entre games.
- **Apresentação 3D:** quadra, personagens, animação, bola, câmera, placar, áudio e estatísticas.
- **Persistência:** manter a carreira no estado oficial do mundo e retomar a sessão sem perder progresso. Uma reconexão não desfaz resultados já disputados pelo circuito.
- **Mundo online:** agenda comum, persistência confiável, resultados validados no servidor, reconexão e execução dos planos de ausência. Estes são requisitos propostos de implementação para atender ao modo compartilhado, sem fornecedor selecionado.
- **Idiomas:** português, inglês e espanhol desde a estrutura inicial; datas, números, mensagens e nomes de ações devem suportar localização.
- **Dados:** temporada de referência, atletas e fontes rastreáveis, com regras e calendários versionados.

As camadas devem se conectar de forma observável. A trajetória da bola, o contato com a raquete, o resultado dos pontos e o placar precisam ser coerentes. A aceleração de uma partida não pode alterar suas regras ou favorecer um atleta.

## Primeiro recorte proposto para revisão final

Proposta: uma semana do mundo com um grupo pequeno de teste, conforme [V1_SCOPE.md](V1_SCOPE.md). Conectar criação do atleta, agenda, treino, descanso, viagem, equipamento, finanças, uma proposta de patrocínio, evento de acesso e partida 3D. Incluir orientações entre games, pós-jogo, atualização do ranking nos eventos pontuáveis, persistência e retomada de sessão. Demonstrar também a partida entre dois participantes e a execução de um plano de ausência.

Fora desse recorte inicial, mas dentro do objetivo final: circuito e temporadas completos, variedade de contratos e equipe, progressão de longo prazo, manutenção de todos os adversários, regras de ranking e elegibilidade da temporada escolhida e qualidade visual consistente.

Não fixar preços, durações, atributos, fórmulas de lesão ou progressão como se já tivessem sido aprovados. São decisões de balanceamento ainda abertas.

## Evidências esperadas para o primeiro recorte

- Partida observada em 3D: saque, devolução, rali, ponto, game e placar coerentes.
- Instrução entre games aplicada ao próximo game, preservando o resultado dos pontos já jogados.
- Treino e descanso produzem mudanças explicáveis; fadiga persiste entre partidas.
- Equipamento e intensidade afetam a simulação e aparecem no resumo de desempenho.
- Gastos, receitas e obrigações contratuais alteram o mesmo saldo persistente.
- Adversários também geram resultados e alterações do ranking.
- Persistir e retomar preserva calendário, atleta, contratos, finanças, torneios e o estado oficial do mundo, sem desfazer resultados para outros participantes.
- Dois clientes acompanham a mesma partida e observam o mesmo resultado; uma reconexão recupera o estado correto sem duplicar despesas, resultados ou comandos.
- A ausência de um usuário permite executar seu plano tático e concluir a partida agendada.
- Exportação para Windows e macOS testada separadamente; limitações de execução ou assinatura registradas.

## Recuperação do conteúdo anterior

O usuário autorizou remover todo o projeto Pluto/OpenClaw que estava neste repositório e manter apenas o novo jogo. Antes da remoção, o commit `ca1fc007b62efc569d919ca756bfaebf7c0735a1` foi preservado na branch `codex/archive-pre-tennis-20261109`.

A cópia preserva a recuperação do projeto anterior. Seus scripts operacionais, dependências e integrações não fazem parte do ATP Simulator e não devem ser executados para configurar o jogo.
