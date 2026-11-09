extends Node3D

var request := HTTPRequest.new()
var events: Array = []
var live_time := 0.0
var poll_elapsed := 0.0
var connected := false
var ball: MeshInstance3D
var players: Array[Node3D] = []
var rackets: Array[Node3D] = []
var score := Label.new()
var status := Label.new()
var last_event := -1

func material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.8
	return mat

func box(parent: Node3D, size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var shape := BoxMesh.new()
	shape.size = size
	mesh.mesh = shape
	mesh.material_override = material(color)
	mesh.position = pos
	parent.add_child(mesh)
	return mesh

func sphere(parent: Node3D, radius: float, pos: Vector3, color: Color) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var shape := SphereMesh.new()
	shape.radius = radius
	shape.height = radius * 2
	mesh.mesh = shape
	mesh.material_override = material(color)
	mesh.position = pos
	parent.add_child(mesh)
	return mesh

func vector(value: Array) -> Vector3:
	return Vector3(value[0], value[1], value[2])

func _ready() -> void:
	box(self, Vector3(34, 0.2, 48), Vector3(0, -0.15, 0), Color("234c47"))
	box(self, Vector3(10.97, 0.04, 23.77), Vector3.ZERO, Color("367faa"))
	for x in [-5.485, -4.115, 4.115, 5.485]:
		box(self, Vector3(0.045, 0.02, 23.77), Vector3(x, 0.035, 0), Color.WHITE)
	for z in [-11.885, -6.4, 6.4, 11.885]:
		box(self, Vector3(8.23 if abs(z) < 7 else 10.97, 0.02, 0.045), Vector3(0, 0.035, z), Color.WHITE)
	box(self, Vector3(0.045, 0.02, 12.8), Vector3(0, 0.035, 0), Color.WHITE)
	for x in [-5.8, 5.8]:
		box(self, Vector3(0.12, 1.07, 0.12), Vector3(x, 0.535, 0), Color("dddddd"))
	for x in range(-57, 58):
		box(self, Vector3(0.012, 0.91, 0.012), Vector3(x * 0.1, 0.46, 0), Color("233039"))
	for y in range(1, 10):
		box(self, Vector3(11.6, 0.012, 0.012), Vector3(0, y * 0.1, 0), Color("233039"))
	box(self, Vector3(11.6, 0.045, 0.045), Vector3(0, 0.94, 0), Color.WHITE)
	for index in range(2):
		var player := Node3D.new()
		add_child(player)
		players.append(player)
		var shirt := Color("f6b343") if index == 0 else Color("eff5f6")
		box(player, Vector3(0.48, 0.6, 0.26), Vector3(0, 1.15, 0), shirt)
		sphere(player, 0.16, Vector3(0, 1.66, 0), Color("bd8a66"))
		for x in [-0.14, 0.14]:
			box(player, Vector3(0.15, 0.67, 0.16), Vector3(x, 0.48, 0), Color("bd8a66"))
			box(player, Vector3(0.19, 0.1, 0.32), Vector3(x, 0.08, -0.04), Color.WHITE)
		box(player, Vector3(0.15, 0.55, 0.15), Vector3(0.3, 1.1, 0), Color("bd8a66"))
		var racket := Node3D.new()
		add_child(racket)
		rackets.append(racket)
		box(racket, Vector3(0.035, 0.32, 0.035), Vector3(0, -0.3, 0), Color("eeeeee"))
		var ring := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = 0.12
		torus.outer_radius = 0.15
		ring.mesh = torus
		ring.rotation_degrees.x = 90
		ring.scale.y = 1.3
		ring.material_override = material(Color("ed684c"))
		racket.add_child(ring)
	ball = sphere(self, 0.067, Vector3(0, 1, 0), Color("e7ff54"))
	var camera := Camera3D.new()
	add_child(camera)
	camera.position = Vector3(15, 20, 32)
	camera.look_at(Vector3(0, 0, 0))
	camera.fov = 48
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-60, -25, 0)
	light.light_energy = 1.4
	add_child(light)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("162632")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("d9e9fa")
	environment.environment.ambient_light_energy = 0.65
	add_child(environment)
	var layer := CanvasLayer.new()
	add_child(layer)
	score.position = Vector2(32, 26)
	score.add_theme_font_size_override("font_size", 25)
	layer.add_child(score)
	status.position = Vector2(32, 710)
	status.add_theme_font_size_override("font_size", 18)
	layer.add_child(status)
	add_child(request)
	request.request_completed.connect(received)
	poll()

func poll() -> void:
	request.request("http://127.0.0.1:8765/match")

func received(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		connected = false
		status.text = "Reconectando ao servidor…"
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	if not data is Dictionary:
		return
	events = data.events
	# Two-second presentation buffer; never requests or displays future events.
	live_time = maxf(0, float(data.elapsed) - 2.0)
	connected = true

func _process(delta: float) -> void:
	poll_elapsed += delta
	if poll_elapsed >= 0.5:
		poll_elapsed = 0
		if request.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
			poll()
	if not connected:
		return
	live_time += delta
	var current: Dictionary = {}
	for event in events:
		if float(event.at) > live_time:
			break
		current = event
	if current.is_empty():
		score.text = "ATP SIMULATOR  /  Aguardando início"
		return
	score.text = "ACESSO • TESTE 2027\nA   %d sets   %d games   %s\nB   %d sets   %d games   %s" % [current.sets[0], current.games[0], point_label(current.points, 0), current.sets[1], current.games[1], point_label(current.points, 1)]
	status.text = "AO VIVO  •  %s\nAtletas fictícios • ambiente de desenvolvimento • sem pontos ATP" % current.kind
	if current.has("velocity"):
		var t := clampf(live_time - float(current.at), 0, float(current.duration))
		ball.position = vector(current.start) + vector(current.velocity) * t + Vector3(0, -4.905 * t * t, 0)
		for index in range(2):
			var goal := vector(current.move_targets[index])
			if int(current.player) == index and current.kind in ["serve", "return", "stroke"]:
				goal = vector(current.start) - Vector3(0.55, float(current.start[1]), -0.4 if index == 0 else 0.4)
			players[index].position = players[index].position.move_toward(goal, delta * 7)
			rackets[index].position = players[index].position + Vector3(0.55, 1.05, 0)
			if int(current.player) == index and current.kind in ["serve", "return", "stroke"]:
				rackets[index].position = vector(current.start) + Vector3(0, 0, sin(t * 10) * 0.25)

func point_label(points: Array, index: int) -> String:
	if mini(points[0], points[1]) >= 3:
		return "AD" if points[index] > points[1-index] else "40"
	return str([0, 15, 30, 40][mini(int(points[index]), 3)])
