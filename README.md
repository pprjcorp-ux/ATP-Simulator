# ATP Simulator

Jogo gratuito de gestão de carreira de tênis para **Windows e macOS**, em desenvolvimento colaborativo, com **um circuito online mundial compartilhado**.

Crie um profissional com nível técnico de Challenger, conquiste sua posição pelos resultados e administre a carreira para disputar o **número 1 do ranking mundial compartilhado**. Acompanhe partidas em **3D realista**, com câmera de transmissão, e ajuste intensidade e instruções táticas **entre os games**. Os tenistas executam os golpes automaticamente.

## MVP local para teste

A prioridade atual é um app para **macOS com Apple Silicon**, com sessão local automática, criação do atleta, preparação, partida 3D e save no computador. Não exige instalar Python ou Godot. Veja o [guia de instalação e jogo](docs/MVP_LOCAL.md). O pacote experimental é entregue neste chat; o código e o empacotamento estão no repositório.

O usuário aceitou partidas de aproximadamente uma hora e adiou circuito público, autenticação e deploy até testar e ajustar este MVP. A experiência mundial online continua no objetivo final.

## Direção confirmada

- Calendário e adversários reais; atleta do jogador criado.
- Um único circuito mundial, com atletas humanos competindo entre si e contra adversários controlados pelo jogo.
- Partidas agendadas, orientação ao vivo e plano tático automático para ausências.
- Distribuição gratuita para formar uma comunidade.
- Simulação dura, sem garantia de uma carreira bem-sucedida ou de alcançar o número 1.
- Português, inglês e espanhol.
- Envelhecimento e aposentadoria dos tenistas reais, com entrada de novos talentos fictícios.
- Início em 2027, com dados oficiais identificados por fonte e revisão.
- Partidas acompanhadas em aproximadamente 10–15 minutos; relógio comum ao vivo e pausa/aceleração nos replays.
- Gestão com máximo detalhe: treinos, finanças, equipe, viagens e equipamentos.
- Apoio financeiro inicial limitado para planejar a primeira temporada.
- Uma semana do jogo por dia real: aproximadamente 52 dias por temporada.
- Criação completa do atleta, com distribuição de atributos dentro de um orçamento equilibrado para todos.
- Circuito de acesso próprio do jogo, com torneios abertos que concedem vagas; ATP e Challenger mantêm seu calendário real.
- Ao terminar uma carreira, é possível criar outro atleta com novo orçamento inicial, preservando a carreira anterior no histórico.
- Distribuição do tempo entre academia, quadra e recuperação.
- Foco técnico em movimentos e fundamentos específicos.
- Escolha de torneios e períodos de descanso.
- Escolha de raquete e configuração de cordas.
- Propostas de patrocínio que podem ser aceitas ou recusadas.
- Intensidade de partida com efeitos sobre desempenho, desgaste e risco de lesão.
- Temporadas persistentes e evolução do ranking de todo o circuito.

## Estado do projeto

**Implementação inicial na nuvem.** Godot 4.6.3 com cena 3D conectada a uma autoridade Python/SQLite. A fundação possui testes de placar, persistência e prazos; ainda não atende ao primeiro recorte completo nem à qualidade visual aprovada. Consulte [execução e limites](docs/IMPLEMENTATION.md) e [evidências por plataforma](docs/validation/2026-11-09.md).

A implementação está em um **ambiente de nuvem**. A preparação local está limitada à documentação e à organização do repositório. Exportar um executável futuramente não substituirá a validação da partida em 3D e da carreira em cada sistema operacional suportado.

## Documentação

- [Escopo aprovado da primeira versão](docs/V1_SCOPE.md)
- [Visão e decisões de produto](docs/GAME_DESIGN.md)
- [Proposta dos sistemas de carreira](docs/CAREER_SYSTEMS.md)
- [Circuito mundial online](docs/ONLINE_CIRCUIT.md)
- [Preparação e passagem para o ambiente de nuvem](docs/CLOUD_HANDOFF.md)

## Próximos passos

O escopo V1 foi aprovado em 9 de novembro de 2026. A engine está fixada em Godot 4.6.3; a autoridade de desenvolvimento usa Python/SQLite. Próximas entregas: contato e animação humana, ritmo de 10–15 minutos, chaves de acesso com capacidade válida, dados oficiais e ranking, temporadas completas e execução real em Windows/macOS. O PR inicial é uma fundação em desenvolvimento, sem encerrar o objetivo do jogo.

O nome do projeto é provisório. O uso de dados, marcas e materiais visuais será documentado conforme as fontes forem selecionadas.
