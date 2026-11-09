extends PanelContainer

signal instruction_sent(body: Dictionary)
var api := HTTPRequest.new()
var action_api := HTTPRequest.new()
var summary := Label.new()
var feedback := Label.new()
var identity := OptionButton.new()
var intensity := HSlider.new()
var aggression := HSlider.new()
var send := Button.new()
var language := OptionButton.new()
var labels: Array = []
var selected := 0
var locale := 0
var game_number := -1
var fixture := ""
var refresh_elapsed := 0.0
var busy := false
var strings := {
	"create": ["Criar nome e atributos • antes da partida", "Create name and attributes • before match", "Crear nombre y atributos • antes del partido"],
	"schedule": ["Agendar próximo teste • ambos no acesso", "Schedule next test • both at access", "Programar próxima prueba • ambos en acceso"],
	"title": ["CARREIRA • TESTE", "CAREER • TEST", "CARRERA • PRUEBA"],
	"identity": ["Identidade de desenvolvimento", "Development identity", "Identidad de desarrollo"],
	"physical": ["Intensidade física", "Physical intensity", "Intensidad física"],
	"risk": ["Agressividade tática", "Tactical aggression", "Agresividad táctica"],
	"send": ["Orientar no intervalo", "Send between games", "Instrucción entre juegos"],
	"train": ["Treino: academia 4h / quadra 10h / descanso 10h", "Train: gym 4h / court 10h / rest 10h", "Entrenar: gimnasio 4h / pista 10h / descanso 10h"],
	"rest": ["Semana: 2h academia / 4h quadra / 18h recuperação", "Week: 2h gym / 4h court / 18h recovery", "Semana: 2h gimnasio / 4h pista / 18h recuperación"],
	"coach": ["Contratar treinador • 150 + 200/semana", "Hire coach • 150 + 200/week", "Contratar entrenador • 150 + 200/semana"],
	"physio": ["Contratar fisioterapeuta • 100 + 120/semana", "Hire physio • 100 + 120/week", "Contratar fisioterapeuta • 100 + 120/semana"],
	"travel": ["Viajar ao acesso • 250", "Travel to access • 250", "Viajar al acceso • 250"],
	"equipment": ["Raquete controle / corda 24 kg • 180", "Control racket / strings 24 kg • 180", "Raqueta control / cuerdas 24 kg • 180"],
	"sponsor": ["Patrocínio: 300 + 150/sem • exige controle", "Sponsor: 300 + 150/week • requires control", "Patrocinio: 300 + 150/sem • exige control"],
	"decline": ["Recusar patrocínio", "Decline sponsorship", "Rechazar patrocinio"],
	"accepted": ["Decisão confirmada pelo servidor", "Decision confirmed by server", "Decisión confirmada por servidor"],
	"offline": ["Aguardando autoridade…", "Waiting for authority…", "Esperando autoridad…"],
	"balance": ["Saldo", "Balance", "Saldo"],
	"fatigue": ["Fadiga", "Fatigue", "Fatiga"],
	"ticket": ["Vaga de acesso", "Access ticket", "Plaza de acceso"],
	"notice": ["Valores provisórios • moeda do jogo\nUma semana a cada 24 horas reais", "Provisional values • game currency\nOne week every 24 real hours", "Valores provisionales • moneda del juego\nUna semana cada 24 horas reales"]
}

func tr_key(key: String) -> String:
	return strings[key][locale]

func caption(container: VBoxContainer, key: String) -> Label:
	var label := Label.new()
	label.text = tr_key(key)
	container.add_child(label)
	labels.append([label, key])
	return label

func action_button(container: VBoxContainer, key: String, action: String, values: Dictionary) -> void:
	var button := Button.new()
	button.text = tr_key(key)
	button.clip_text = true
	button.tooltip_text = tr_key(key)
	button.add_theme_font_size_override("font_size", 13)
	button.pressed.connect(func(): submit(action, values))
	container.add_child(button)
	labels.append([button, key])

func _ready() -> void:
	position = Vector2(875, 20)
	custom_minimum_size = Vector2(385, 650)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(385, 740)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 8)
	scroll.add_child(stack)
	caption(stack, "title")
	for name in ["Português", "English", "Español"]:
		language.add_item(name)
	stack.add_child(language)
	language.item_selected.connect(func(index):
		locale = index
		for item in labels:
			item[0].text = tr_key(item[1])
		refresh())
	caption(stack, "identity")
	identity.add_item("A")
	identity.add_item("B")
	stack.add_child(identity)
	for argument in OS.get_cmdline_user_args():
		if argument == "--participant=1":
			selected = 1
			identity.select(1)
	identity.item_selected.connect(func(index): selected = index; refresh())
	summary.add_theme_font_size_override("font_size", 15)
	stack.add_child(summary)
	var create := Button.new()
	create.text = tr_key("create")
	labels.append([create, "create"])
	create.pressed.connect(create_dialog)
	stack.add_child(create)
	caption(stack, "physical")
	intensity.min_value = 0
	intensity.max_value = 1
	intensity.step = 0.1
	intensity.value = 0.6
	stack.add_child(intensity)
	caption(stack, "risk")
	aggression.min_value = 0
	aggression.max_value = 1
	aggression.step = 0.1
	aggression.value = 0.5
	stack.add_child(aggression)
	send.text = tr_key("send")
	send.disabled = true
	send.pressed.connect(send_instruction)
	stack.add_child(send)
	labels.append([send, "send"])
	action_button(stack, "train", "plan_week", {"gym": 4, "court": 10, "recovery": 10, "focus": "forehand"})
	action_button(stack, "rest", "plan_week", {"gym": 2, "court": 4, "recovery": 18, "focus": "backhand"})
	action_button(stack, "coach", "team", {"role": "coach", "hire": true})
	action_button(stack, "physio", "team", {"role": "physio", "hire": true})
	action_button(stack, "travel", "travel", {"destination": "access-court"})
	action_button(stack, "equipment", "equipment", {"model": "control", "tension": 24})
	action_button(stack, "sponsor", "sponsor", {"accept": true})
	action_button(stack, "decline", "sponsor", {"accept": false})
	var schedule := Button.new()
	schedule.text = tr_key("schedule")
	schedule.pressed.connect(func(): post("/schedule", {"id": "schedule-%s" % Time.get_ticks_usec()}))
	stack.add_child(schedule)
	labels.append([schedule, "schedule"])
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	feedback.custom_minimum_size = Vector2(365, 36)
	stack.add_child(feedback)
	caption(stack, "notice")
	add_child(api)
	add_child(action_api)
	api.request_completed.connect(received)
	action_api.request_completed.connect(action_received)
	refresh()

func refresh() -> void:
	if api.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
		api.request("http://127.0.0.1:8765/career")

func received(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		summary.text = tr_key("offline")
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	if not data is Dictionary:
		return
	var athlete = data.athletes[selected]
	summary.text = "%s   •   2027 / %d\n%s: %.2f   |   %s: %.1f\n%s: %s" % [athlete.name, data.week + 1, tr_key("balance"), athlete.balance_cents / 100.0, tr_key("fatigue"), athlete.fatigue, tr_key("ticket"), str(athlete.access_ticket)]

func update_window(events: Array, elapsed: float, match_fixture: String) -> void:
	fixture = match_fixture
	game_number = -1
	for event in events:
		if event.kind == "instruction_window" and event.at <= elapsed and elapsed < event.closes_at:
			game_number = int(event.game_number)
	send.disabled = game_number < 0 or busy

func send_instruction() -> void:
	var body := {"id": "ui-instruction-%s-%s" % [Time.get_unix_time_from_system(), Time.get_ticks_usec()], "player": selected, "game_number": game_number, "fixture": fixture, "plan": {"intensity": intensity.value, "aggression": aggression.value}}
	post("/instruction", body)

func submit(action: String, values: Dictionary) -> void:
	var body := values.duplicate()
	body.merge({"id": "ui-career-%s-%s" % [Time.get_unix_time_from_system(), Time.get_ticks_usec()], "athlete": selected, "action": action})
	post("/career", body)

func post(path: String, body: Dictionary) -> void:
	if busy:
		return
	busy = true
	action_api.request("http://127.0.0.1:8765" + path, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body))

func action_received(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	busy = false
	if result != HTTPRequest.RESULT_SUCCESS:
		feedback.text = tr_key("offline")
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	feedback.text = tr_key("accepted") if code == 200 else str(data.get("error", "Error"))
	refresh()

func _process(delta: float) -> void:
	refresh_elapsed += delta
	if refresh_elapsed >= 2:
		refresh_elapsed = 0
		refresh()

func create_dialog() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.title = "360 points • 40–80 each • provisional balance"
	var stack := VBoxContainer.new()
	var name_input := LineEdit.new()
	name_input.placeholder_text = "Nome / Name / Nombre"
	stack.add_child(name_input)
	var fields := {}
	for attribute in ["serve", "forehand", "backhand", "return", "fitness", "speed"]:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = attribute
		label.custom_minimum_size.x = 120
		row.add_child(label)
		var value := SpinBox.new()
		value.min_value = 40
		value.max_value = 80
		value.value = 60
		row.add_child(value)
		fields[attribute] = value
		stack.add_child(row)
	dialog.add_child(stack)
	dialog.confirmed.connect(func():
		var attributes := {}
		for attribute in fields:
			attributes[attribute] = int(fields[attribute].value)
		submit("create", {"name": name_input.text, "attributes": attributes})
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	add_child(dialog)
	dialog.popup_centered(Vector2i(380, 350))
