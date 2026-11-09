# ATP Simulator — MVP local para Apple Silicon

Decisão de 9 de novembro de 2026: priorizar uma versão para o usuário jogar e ajustar em seu Mac Apple Silicon antes de adicionar circuito público, autenticação e complexidade de deploy. Partidas de aproximadamente uma hora são aceitáveis. O circuito mundial continua como objetivo posterior, sem ser requisito para este teste local.

## Abrir

1. Baixe e extraia `ATP-Simulator-MVP-Apple-Silicon.zip`.
2. Mova `ATP Simulator MVP.app` para Aplicativos e abra o app.
3. Não é necessário instalar Python, Godot ou executar um servidor manualmente. O app inicia seu próprio processo local, restrito a este computador.

Este é um build experimental com assinatura ad hoc, sem notarização Apple. O macOS pode pedir confirmação em Ajustes do Sistema → Privacidade e Segurança para abrir um app de desenvolvedor não identificado. Não desative o Gatekeeper. Se o macOS informar que o arquivo está danificado, não tente contornar o aviso: envie a mensagem para investigarmos o pacote.

## Jogar

1. Clique em **Criar meu atleta**. Escolha nome e distribua exatamente 360 pontos: 40–80 em cada um dos seis atributos.
2. Escolha treino ou recuperação. Se desejar, contrate treinador/fisioterapeuta, troque o equipamento e avalie o contrato de patrocínio. Os valores são provisórios e usam saldo do jogo.
3. Clique em **Viajar ao acesso**. Escolha intensidade física e agressividade para o plano inicial.
4. Clique em **Jogar partida de acesso**. Os golpes são automáticos; durante os intervalos entre games, use **Orientar no intervalo**.
5. Use **Replay**, pausa/velocidades de replay e **Ao vivo** para rever pontos. O replay não altera o resultado nem pausa a partida em andamento.
6. Após o término, o resultado altera saldo e fadiga. Você pode avançar uma semana para executar treino, recuperação e custos; depois disputar outra partida.

A carreira é salva automaticamente no computador. Fechar e reabrir preserva atleta, planos, finanças, histórico e partida. No MVP local, partidas já iniciadas continuam seguindo o plano preparado durante sua ausência e são recuperadas ao reabrir. Uma semana também avança a cada 24 horas reais, ou pelo botão local de teste fora da partida.

Os saves ficam em `~/Library/Application Support/Godot/app_userdata/ATP Simulator MVP/`. Não apague essa pasta para atualizar o app. Abra apenas uma cópia do jogo por vez.

## O que testar primeiro

- Clareza para criar o atleta e chegar à primeira partida.
- Legibilidade da bola, deslocamento e contato com a raquete.
- Efeito percebido de intensidade/agressividade e fadiga.
- Custos e benefícios de treino, recuperação, equipe e equipamento.
- Fechar/reabrir sem perder progresso.

## Limites deste MVP

Elenco e evento fictícios, sem ranking ATP, calendário oficial ou circuito online público. A vaga de acesso é apenas um indicador de teste. Animação procedural simplificada, sem captura de movimentos; ainda faltam variedade de golpes, let e refinamento visual. Há primeiro/segundo saque, dupla falta, games com vantagem, sets e tie-break. Não é a versão final realista.

Validação feita na nuvem Linux: testes de simulação/persistência/API, inicialização automática e observação gráfica. Exportação, empacotamento e assinatura ad hoc podem ser conferidos na nuvem; execução nativa no macOS Apple Silicon depende do primeiro teste no Mac do usuário. Não afirmamos que essa execução já foi verificada.
