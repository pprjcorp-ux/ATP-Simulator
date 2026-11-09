# Implementação na nuvem

## Engine e arquitetura

Godot **4.6.3 stable official**, identificado por `.godot-version`; cliente GDScript, renderizador Compatibility. Escolha inicial: cenas 3D, animação procedural, futura adoção de Skeleton3D/AnimationTree e exportação desktop sem dependência de navegador. Esta escolha não comprova qualidade final de animação nem desempenho em hardware alvo.

Servidor Python 3 com biblioteca padrão e SQLite: uma autoridade, relógio comum, histórico ordenado, planos por participante e comandos idempotentes. O cliente nunca envia pontos ou vencedores. SQLite persiste estado, gerador aleatório, eventos e confirmações na mesma transação. Serviço restrito a loopback, com identidades de teste; **não publicar este serviço** antes de autenticação, autorização por atleta, limites operacionais e migrações.

## Executar

Na raiz do repositório:

```sh
python3 -m server.http --database world.sqlite3
```

Em outro terminal:

```sh
godot --path client
```

Dois processos Godot podem observar a mesma autoridade. O cliente consulta o relógio e os eventos públicos com dois segundos de buffer. Reabrir o cliente recupera o estado; não reinicia a partida. O arquivo de banco conserva a partida entre reinícios do servidor.

```sh
python3 -m unittest discover -s tests -v
godot --headless --path client --editor --import --quit
godot --headless --path client --quit-after 120
```

## Limites atuais

Primeira fundação, não marco aceito. Dados fictícios de teste, evento de acesso de desenvolvimento, sem ranking/pontos ATP ou calendário oficial importado. Atributos, fórmulas e intervalos são provisórios.

A simulação tem placar com vantagem, sets e tie-break por pontos, lançamento, saque, quique, devolução e rali com trajetórias balísticas. Ainda faltam segundo saque/faltas, let, trocas de lado, seleção de golpes avançada, colisão física raquete/bola e determinação de alcance pela capacidade do atleta. O histórico dirige a apresentação; o contato ainda é uma restrição geométrica do evento, sem IK ou animação humana final. Não tratar esse estado como tênis realista concluído.

Planos de intensidade e agressividade alteram duração e erro dos golpes futuros. Ausência conserva o plano, sem penalidade de atributos. API de instrução valida game e prazo; controles gráficos de instrução, autenticação e replay ainda pendentes.

Carreira, economia, calendário, localização completa, ranking e temporadas seguem como trabalho obrigatório. Este documento registra implementação, sem substituir o escopo aprovado.
