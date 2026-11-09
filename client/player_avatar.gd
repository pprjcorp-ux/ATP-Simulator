extends Node3D

var limbs: Array[MeshInstance3D] = []
var racket := Node3D.new()
var skin := Color("bc8969")
var side := 1.0

func mat(color: Color) -> StandardMaterial3D:
	var value := StandardMaterial3D.new()
	value.albedo_color = color
	value.roughness = 0.85
	return value

func capsule(radius: float, height: float, color: Color, origin: Vector3) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = radius
	mesh.height = height
	node.mesh = mesh
	node.material_override = mat(color)
	node.position = origin
	add_child(node)
	return node

func configure(shirt: Color, court_side: float) -> void:
	side = court_side
	capsule(0.21, 0.62, shirt, Vector3(0, 1.19, 0))
	capsule(0.22, 0.32, Color("1b263b"), Vector3(0, 0.86, 0))
	capsule(0.14, 0.31, skin, Vector3(0, 1.65, 0))
	capsule(0.145, 0.13, Color("30291f"), Vector3(0, 1.79, 0))
	for i in range(8):
		limbs.append(capsule(0.065 if i < 4 else 0.05, 1, skin, Vector3.ZERO))
	add_child(racket)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.13
	torus.outer_radius = 0.155
	ring.mesh = torus
	ring.rotation_degrees.x = 90
	ring.scale.y = 1.3
	ring.material_override = mat(Color("ed684c"))
	racket.add_child(ring)
	for x in [-0.08, 0.0, 0.08]:
		var string := MeshInstance3D.new()
		var wire := BoxMesh.new()
		wire.size = Vector3(0.006, 0.24, 0.006)
		string.mesh = wire
		string.position.x = x
		string.material_override = mat(Color("eeeeee"))
		racket.add_child(string)
	var handle := MeshInstance3D.new()
	var grip := CylinderMesh.new()
	grip.top_radius = 0.018
	grip.bottom_radius = 0.018
	grip.height = 0.3
	handle.mesh = grip
	handle.position.y = -0.31
	handle.material_override = mat(Color("d9dedf"))
	racket.add_child(handle)
	pose(0, 0, Vector3(0.55, 1.05, 0))

func bone(index: int, a: Vector3, b: Vector3) -> void:
	var direction := b-a
	limbs[index].position = (a+b)*0.5
	limbs[index].scale = Vector3(1, maxf(0.1, direction.length()), 1)
	limbs[index].quaternion = Quaternion(Vector3.UP, direction.normalized())

func pose(clock: float, movement: float, racket_contact: Vector3) -> void:
	for leg in range(2):
		var x := -0.14 if leg == 0 else 0.14
		var stride := sin(clock*13 + leg*PI)*0.3*movement
		var hip := Vector3(x, 0.88, 0)
		var foot := Vector3(x, 0.09 + maxf(0, stride)*0.3, stride)
		var knee := (hip+foot)*0.5 + Vector3(0, 0, -side*0.12)
		bone(leg*2, hip, knee)
		bone(leg*2+1, knee, foot)
	racket.position = racket_contact
	var shoulder := Vector3(0.25, 1.43, 0)
	var hand := racket_contact + Vector3(0, -0.44, 0)
	var elbow := (shoulder+hand)*0.5 + Vector3(0.12, 0, side*0.12)
	bone(4, shoulder, elbow)
	bone(5, elbow, hand)
	bone(6, Vector3(-0.25, 1.43, 0), Vector3(-0.37, 1.14, -side*0.08))
	bone(7, Vector3(-0.37, 1.14, -side*0.08), Vector3(-0.2, 1.02, -side*0.25))
