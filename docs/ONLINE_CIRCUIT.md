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
- Início com nível técnico de Challenger; a classificação é conquistada pelos resultados.
- Uma semana do jogo por dia real, aproximadamente 52 dias por temporada.
- Circuito de acesso próprio do jogo, com torneios abertos que dão vagas, preservando o calendário real de ATP e Challenger.

## Entrada e ritmo do mundo

### Entrada no ranking

O usuário optou por manter o nível técnico de um profissional de Challenger e conquistar a classificação pelos resultados. Essa escolha substitui a proposta inicial de garantir entrada perto do top 300. A criação de um atleta não deve inserir pontos fictícios no ranking como se tivessem sido conquistados em torneios reais.

### Velocidade do calendário

O mundo avança uma semana do jogo por dia real, com temporada de aproximadamente 52 dias. Datas, duração dos eventos e períodos de recuperação seguem o calendário simulado. A programação das partidas apresenta prazos e horários reais ao usuário, convertidos para seu fuso.

### Acompanhamento e velocidade de reprodução

O alvo confirmado é aproximadamente 10–15 minutos por partida comum. O modo online exige que ambos os participantes tenham o mesmo prazo para orientar.

Regra aprovada pelo usuário em 9 de novembro de 2026: a partida ao vivo usa um relógio comum. Replays podem ser pausados ou acelerados, e quem chega atrasado pode acompanhar o resumo antes de alcançar o momento ao vivo. Reprodução e pausa locais não congelam o adversário, não revelam o futuro e não permitem editar pontos já concluídos.

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

## Circuito de acesso

O usuário aprovou um circuito de acesso próprio do jogo, com torneios abertos que concedem vagas, mantendo o calendário real de ATP e Challenger. Esse circuito oferece uma rota de competição a quem ainda não tem classificação suficiente.

Proposta de regra: os eventos de acesso concedem vagas para as etapas de entrada do circuito virtual, sem conceder diretamente pontos apresentados como ATP. Quantidade, validade, destino e condições das vagas serão calibrados. As premiações, se adotadas, fazem parte da economia do jogo.

O circuito de acesso e suas vagas são adaptações do jogo e devem ser identificados assim. Não inventar eventos e apresentá-los como calendário oficial. As vagas precisam corresponder a capacidade real nas chaves da simulação; uma premiação não pode prometer a mesma vaga a dois atletas.

## Evolução entre temporadas — proposta

O ranking e as carreiras persistem entre temporadas. Uma virada de ano não reinicia automaticamente habilidades, contratos ou histórico. A forma de adaptar calendários futuros ainda precisa ser definida; calendários não publicados não serão apresentados como oficiais.

A entrada de novos talentos controlados pelo jogo evita um circuito sem renovação quando a geração real se aposenta. O balanço entre humanos, profissionais reais remanescentes e talentos gerados será calibrado sem reservar o topo permanentemente para qualquer grupo.

## Validação necessária

O primeiro recorte online precisa demonstrar duas pessoas acompanhando a mesma partida, enviando instruções nos intervalos e recebendo o mesmo resultado. Deve também concluir a partida com um participante ausente, permitir reconexão e manter o ranking e a economia consistentes.

Ainda não existe implementação ou teste desses requisitos. Um modo local isolado não comprova o circuito compartilhado pedido pelo usuário.
