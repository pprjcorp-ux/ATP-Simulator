# ATP Simulator — escopo aprovado da primeira versão

**Estado:** escopo e sequência de execução aprovados pelo usuário em 9 de novembro de 2026, incluindo o relógio comum ao vivo e a pausa/aceleração nos replays. O usuário autorizou concluir a configuração do ambiente e abrir um novo chat de desenvolvimento na nuvem. Ainda não há jogo implementado.

## A experiência

Um jogo gratuito de gestão de carreira para Windows e macOS, em português, inglês e espanhol. Todos participam de um único circuito mundial online, com ranking compartilhado. O objetivo é levar um atleta criado ao número 1 em uma simulação dura, com concorrência real de outros jogadores e possibilidade de a carreira não dar certo.

O mundo começa em 2027. O calendário de ATP e Challenger usa dados reais verificados. Os adversários incluem profissionais reais controlados pelo jogo e atletas administrados por pessoas. A geração real envelhece e se aposenta; novos talentos fictícios renovam o circuito.

Uma semana do jogo passa a cada dia real, e a temporada dura aproximadamente 52 dias. O atleta continua seguindo sua agenda e seu plano tático durante a ausência do jogador.

## Criação e recomeço

O jogador personaliza o atleta e distribui atributos dentro de um orçamento equilibrado para todos. O nível técnico inicial é de Challenger, mas a classificação precisa ser conquistada por resultados. Existe apoio financeiro inicial limitado, suficiente para planejar a primeira temporada; o valor será calibrado.

Um circuito de acesso próprio do jogo oferece torneios abertos que concedem vagas. Seus eventos e regras são identificados como adaptações do jogo, preservando o calendário real de ATP e Challenger.

Quando uma carreira termina por aposentadoria ou fracasso, o jogador pode criar outro atleta com novo orçamento inicial. A carreira anterior permanece no histórico.

## A gestão

O jogador decide quanto tempo investir em academia, quadra e recuperação; quais movimentos e fundamentos treinar; quem contratar para a equipe; quais viagens fazer; quais torneios disputar ou deixar de jogar; qual raquete usar e como configurar as cordas; e quais propostas de patrocínio aceitar ou recusar.

Finanças, equipe, viagens e equipamento têm máximo detalhe. As decisões precisam competir pelo mesmo tempo e pelos mesmos recursos. A intensidade de cada partida afeta desempenho, desgaste e risco de lesão.

Proposta de implementação: separar intensidade física de agressividade tática, permitir evolução de estilos diferentes e explicar as consequências com relatórios de treino e pós-jogo. Valores, fórmulas e limites serão ajustados com testes de balanceamento.

## A partida

Os atletas executam os golpes automaticamente. O jogador acompanha em 3D realista, com proporções, movimentos e câmera próximos de uma transmissão de TV, e orienta entre os games.

As partidas são agendadas pelo circuito. Quem está presente pode alterar instruções e intensidade nos intervalos. Na ausência, o plano tático preparado continua sendo executado.

O alvo para uma partida comum é 10–15 minutos. Está aprovado um relógio comum durante a partida ao vivo, com pausa e aceleração na reprodução de replays. Quem chega atrasado pode acompanhar um resumo até alcançar o momento ao vivo.

## O primeiro recorte jogável aprovado

Uma semana do mundo, com um grupo pequeno de teste no mesmo circuito, deve demonstrar o ciclo completo:

1. Criar atletas com orçamento equivalente de atributos e apoio financeiro inicial.
2. Planejar treino, descanso, equipe, viagem e equipamento.
3. Avaliar uma proposta de patrocínio com benefícios e obrigações.
4. Disputar um evento de acesso e verificar a vaga concedida.
5. Acompanhar uma partida 3D entre dois participantes, com instruções entre games.
6. Concluir outra partida com um participante ausente e seu plano automático ativo.
7. Ver o efeito sobre condição física, desenvolvimento, dinheiro e classificação nos eventos que concedem pontos.
8. Fechar e retomar a sessão conservando o estado oficial do mundo.

Esse recorte testa os sistemas conectados. O objetivo final continua incluindo o circuito completo, temporadas sucessivas e a carreira até a disputa pelo número 1.

## Sequência de execução aprovada

1. **Ambiente de nuvem:** confirmar checkout, ferramentas, capacidade de renderização e fluxo de exportação; escolher e fixar a engine.
2. **Partida e mundo compartilhado:** provar movimentação, golpes, contato raquete/bola, placar, duas pessoas na mesma partida, instruções entre games e plano de ausência.
3. **Carreira conectada:** integrar treino, recuperação, equipe, viagens, finanças, patrocínio, equipamento, acesso e persistência.
4. **Circuito e longevidade:** ampliar calendário, dados reais, ranking, temporadas, envelhecimento, aposentadoria e renovação do elenco.
5. **Versão para a comunidade:** verificar Windows e macOS, os três idiomas, reconexão, integridade dos resultados e capacidade do serviço antes da abertura pública.

Não criar uma versão offline como substituto do circuito único, nem tratar uma tela de gestão ou uma animação isolada como o jogo completo.

## Como avaliar o resultado

- A partida 3D mostra os eventos que determinam seu resultado: bola, raquete, movimentação e placar concordam.
- Dois participantes observam o mesmo resultado, e as instruções só afetam momentos futuros permitidos.
- O plano de ausência funciona sem reduzir artificialmente os atributos do atleta.
- Treino, descanso, equipamento e intensidade produzem efeitos perceptíveis e explicáveis, sujeitos à variabilidade da simulação.
- A economia é consistente: não há dinheiro ou cobranças duplicados após reconexão.
- O circuito de acesso concede vagas válidas; os torneios pontuáveis alimentam o ranking compartilhado.
- As carreiras persistem entre temporadas, e o encerramento permite iniciar outro atleta sem apagar o histórico.
- Textos e formatos funcionam em português, inglês e espanhol.
- Builds e execução em Windows e macOS são avaliados separadamente. Exportação ou teste sem interface não prova qualidade visual ou execução em cada plataforma.

## Ajustes que ficam para o protótipo

Faixas de idade e atributos; valor e origem exatos do apoio financeiro; duração de cada bloco de treino; custos; número de vagas; prazos de inscrição e de instrução; condições financeiras de encerramento; frequência e severidade das lesões; qualidade dos modelos e animações; metas de desempenho e capacidade do serviço.

Esses parâmetros não estão congelados. A proposta mantém as escolhas estruturais do usuário e usa o protótipo para validar seus valores.

## Dependências e riscos concretos

- A animação de tênis precisa sincronizar deslocamento, preparação, contato e trajetória da bola. Esse é um teste inicial de qualidade.
- Um mundo único exige prazos comuns e persistência confiável. Erros de resultado, duplicação ou reconexão afetam outros participantes.
- Parte dos dados de 2027 ainda precisa ser verificada; informações provisórias serão identificadas, e nenhum evento gerado será apresentado como oficial.
- Hospedagem, licenças de materiais, distribuição e orçamento operacional ainda não foram selecionados. A proposta não autoriza contratar serviços, comprar assets ou ampliar acessos.

Referências e detalhes: [GAME_DESIGN.md](GAME_DESIGN.md), [CAREER_SYSTEMS.md](CAREER_SYSTEMS.md), [ONLINE_CIRCUIT.md](ONLINE_CIRCUIT.md) e [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md).
