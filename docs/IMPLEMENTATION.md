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

A simulação tem placar com vantagem, sets e tie-break por pontos, lançamento, saque, quique, devolução e rali com trajetórias balísticas. Ainda faltam segundo saque/faltas, let, trocas de lado, seleção de golpes avançada e colisão física raquete/bola. Alcance usa velocidade, intensidade e fadiga provisórias; não é ainda um modelo biomecânico. O histórico dirige a apresentação; o contato ainda é uma restrição geométrica do evento, sem IK ou animação humana final. Não tratar esse estado como tênis realista concluído.

Planos de intensidade e agressividade alteram duração e erro dos golpes futuros. Ausência conserva o plano, sem penalidade de atributos. API de instrução valida identidade da partida, game e prazo. O painel permite orientar nos intervalos e preparar as próximas semanas. Replay local oferece pausa, velocidades e retorno ao vivo; a autoridade continua avançando.

Há criação básica com seis atributos e orçamento equivalente, apoio limitado, treino/recuperação semanal, treinador, fisioterapeuta, viagem, três conjuntos de equipamento na API, patrocínio com obrigação de raquete, saldo em centavos e livro financeiro por carreira. A partida captura atributos/equipamento no início; alterações de equipamento durante a partida só afetam a seguinte. Treinos e salários são liquidados a cada 24 horas reais. O prêmio de acesso é idempotente. A vaga ainda é um indicador, sem chave de destino/capacidade: não atende ao critério de acesso válido do escopo. A primeira partida é uma fixture automática de teste; as seguintes exigem ambos os atletas ativos no local. `/schedule` agenda a próxima após o encerramento oficial. Aposentadoria e recomeço preservam resumo e livro financeiro, mas ainda faltam histórico esportivo completo e criação visual.

O painel de carreira oferece PT/EN/ES; mensagens de erro, atributos e partes da apresentação ainda precisam de localização. Calendário oficial, ranking, temporadas completas, lesões, envelhecimento, adversários reais, autenticação e capacidade do serviço seguem como trabalho obrigatório. Este documento registra implementação, sem substituir o escopo aprovado.

## Exportadores

Templates oficiais `Godot_v4.6.3-stable_export_templates.tpz` obtidos da release `godotengine/godot` 4.6.3-stable; SHA-512 conferido contra `SHA512-SUMS.txt` da mesma release:

`da606b61c10157844f8300172df374472665f95015495cb1a7cd132c40ede404faa96cc1016a4b9662db9909ddea69632c4948b2cd11163438dad4808881fb68`

Presets versionados em `client/export_presets.cfg`. Os templates selecionados estão no diretório ignorado `artifacts/godot-data/godot/export_templates/4.6.3.stable`. Para repetir nesta nuvem:

```sh
XDG_DATA_HOME=/workspace/ATP-Simulator/artifacts/godot-data godot --headless --path client --export-release 'Windows Desktop' ../artifacts/windows/ATP-Simulator.exe
XDG_DATA_HOME=/workspace/ATP-Simulator/artifacts/godot-data godot --headless --path client --export-release macOS ../artifacts/macos/ATP-Simulator.zip
```

Os builds são de desenvolvimento, sem assinatura, não publicados e ainda apontam à autoridade em loopback. Não são uma distribuição online pronta para jogadores externos.
