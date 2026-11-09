# Circuito mundial online

## Decisões confirmadas

- Um único circuito mundial, com ranking compartilhado por todos os jogadores.
- Cada jogador administra seu atleta e enfrenta atletas de outras pessoas, além de adversários controlados pelo jogo.
- Partidas em horários agendados pelo circuito.
- Orientações ao vivo entre games; um plano tático automático cobre ausências.
- O circuito começa em 2027, com calendário e adversários reais no ponto de partida.
- Tenistas reais envelhecem e se aposentam; novos talentos fictícios renovam o circuito.
- Distribuição gratuita, em português, inglês e espanhol.
- Gestão com máximo detalhe e simulação dura; alcançar o número 1 não é garantido.

## Decisões que precisam ser conciliadas

### Entrada perto do top 300

Começar perto do top 300 foi confirmado antes da escolha do mundo único. Garantir essa faixa a todo novo usuário entra em conflito com a população crescente de um ranking comum.

Proposta apresentada ao usuário: manter o nível técnico de um profissional de Challenger e fazer a posição efetiva depender dos resultados. As alternativas em discussão são limitar vagas humanas ou buscar outra solução. Não implementar uma mudança silenciosa no início da carreira.

### Velocidade do calendário

Ainda em decisão: uma semana do jogo por dia real, por três dias reais ou calendário em tempo real. A duração da temporada influencia a rotina, as viagens, o ritmo de envelhecimento e quantas partidas um usuário precisa preparar por dia.

### Acompanhamento e velocidade de reprodução

O alvo confirmado é aproximadamente 10–15 minutos por partida comum, com opção de mudar a velocidade. O modo online exige que ambos os participantes tenham o mesmo prazo para orientar.

Proposta a validar: a partida ao vivo usa um relógio comum. Replays podem ser acelerados, e quem chega atrasado pode acompanhar o resumo antes de alcançar o momento ao vivo. Reprodução e pausa locais não congelam o adversário, não revelam o futuro e não permitem editar pontos já concluídos.

## Planejamento e ausências — proposta

O jogador pode preparar intensidade e instruções por situação: início de partida, vantagem/desvantagem, queda de condição física, dificuldade em um padrão de troca ou mudança de set. A lista exata de condições será refinada no protótipo.

Durante a janela entre games, uma nova orientação pode substituir o plano para os próximos pontos. Se não houver orientação válida no prazo, a partida segue o plano ativo. Ausência não reduz artificialmente os atributos do atleta.

A agenda exibe horários no fuso do usuário. O circuito deve considerar disponibilidade declarada ao programar partidas, sem garantir que todas ocorram no horário preferido. Regras para ausência, atraso, abandono e falha de conexão ainda precisam de especificação.

## Integridade da competição — proposta técnica

- O servidor mantém os resultados, a condição do atleta, a economia, a agenda e o ranking como estado oficial.
- O cliente apresenta a partida 3D e envia decisões; não escolhe vencedores, pontos ou evolução de atributos.
- Comandos têm identidade, prazo e confirmação para impedir execução duplicada após reconexão.
- Uma orientação recebida após o fechamento da janela vale somente para uma janela futura permitida; não reescreve o passado.
- O histórico da partida deve permitir reconstruir o placar e o replay.
- Os critérios esportivos e as restrições de calendário são compartilhados por humanos e adversários controlados pelo jogo, respeitadas as regras de cada competição.
- Uma queda de conexão não deve duplicar receitas, cobranças, inscrições ou resultados.

Esses pontos definem comportamento esperado. Nenhum backend, serviço de autenticação, fornecedor de hospedagem ou orçamento operacional foi escolhido.

## Capacidade do circuito — pendência

O calendário real tem limites de vagas por evento. Precisamos definir como a base crescente de usuários entra em torneios e qualifying, o que acontece com quem fica fora das listas e como evitar que um usuário passe muito tempo sem conseguir competir.

Não aumentar chaves, inventar eventos ou dar convites ilimitados e apresentar essas mudanças como regulamento oficial. Qualquer adaptação de jogo precisa ser deliberada e identificada.

## Evolução entre temporadas — proposta

O ranking e as carreiras persistem entre temporadas. Uma virada de ano não reinicia automaticamente habilidades, contratos ou histórico. A forma de adaptar calendários futuros ainda precisa ser definida; calendários não publicados não serão apresentados como oficiais.

A entrada de novos talentos controlados pelo jogo evita um circuito sem renovação quando a geração real se aposenta. O balanço entre humanos, profissionais reais remanescentes e talentos gerados será calibrado sem reservar o topo permanentemente para qualquer grupo.

## Validação necessária

O primeiro recorte online precisa demonstrar duas pessoas acompanhando a mesma partida, enviando instruções nos intervalos e recebendo o mesmo resultado. Deve também concluir a partida com um participante ausente, permitir reconexão e manter o ranking e a economia consistentes.

Ainda não existe implementação ou teste desses requisitos. Um modo local isolado não comprova o circuito compartilhado pedido pelo usuário.
