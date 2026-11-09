extends Node

var url := ""
var headers := PackedStringArray()
var local_mode := true
var failure := ""
var child_pid := -1
var ready_path := ""
var startup_time := 0.0

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument == "--external-server":
			local_mode = false
			url = "http://127.0.0.1:8765"
			return
	var user_root := OS.get_environment("ATP_MVP_SAVE_DIR")
	if user_root.is_empty():
		user_root = ProjectSettings.globalize_path("user://")
	DirAccess.make_dir_recursive_absolute(user_root)
	ready_path = user_root.path_join("session-%d-%d.json" % [OS.get_process_id(), Time.get_ticks_usec()])
	var python := OS.get_environment("ATP_PYTHON")
	var launch: String
	if OS.has_feature("macos") and not OS.has_feature("editor"):
		var resources := OS.get_executable_path().get_base_dir().path_join("../Resources").simplify_path()
		python = resources.path_join("python/bin/python3")
		launch = resources.path_join("authority/server/launcher.py")
	else:
		if python.is_empty():
			python = "python3"
		launch = ProjectSettings.globalize_path("res://../server/launcher.py").simplify_path()
	var args := PackedStringArray(["-I", "-B", launch, "--local-mvp", "--port", "0", "--database", user_root.path_join("mvp-v1.sqlite3"), "--ready-file", ready_path, "--owner-pid", str(OS.get_process_id())])
	child_pid = OS.create_process(python, args)
	if child_pid < 0:
		failure = "Não foi possível iniciar a sessão local. Consulte o guia do MVP."

func _process(delta: float) -> void:
	if not local_mode or not url.is_empty() or not failure.is_empty():
		return
	startup_time += delta
	if FileAccess.file_exists(ready_path):
		var data = JSON.parse_string(FileAccess.get_file_as_string(ready_path))
		if data is Dictionary and data.has("url") and data.has("token"):
			url = data.url
			headers = PackedStringArray(["Authorization: Bearer " + str(data.token)])
			return
	if startup_time > 20:
		failure = "A sessão local não iniciou. Feche outras cópias do jogo e tente novamente."

func _exit_tree() -> void:
	if child_pid > 0 and OS.is_process_running(child_pid):
		OS.kill(child_pid)
	if not ready_path.is_empty() and FileAccess.file_exists(ready_path):
		DirAccess.remove_absolute(ready_path)
