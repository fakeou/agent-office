extends Node2D


class WorkerActor:
	var session_id := ""
	var title := ""
	var state := "idle"
	var node: Node2D
	var sprite: AnimatedSprite2D
	var path_points: Array[Vector2] = []
	var assigned_work_seat_key := ""
	var reserved_zone_cell := Vector2i(999999, 999999)
	var has_reserved_zone_cell := false
	var pending_seat_activation := false
	var current_zone := ""
	var facing_direction := Vector2.DOWN

	func _init(p_node: Node2D, p_sprite: AnimatedSprite2D) -> void:
		node = p_node
		sprite = p_sprite


class WorkSeat:
	var key := ""
	var spot: WorkSpot
	var side := ""
	var marker: Marker2D
	var occupied_by := ""
	var animation_name := "idle_north"

	func _init(
		p_key: String,
		p_spot: WorkSpot,
		p_side: String,
		p_marker: Marker2D,
		p_animation_name: String
	) -> void:
		key = p_key
		spot = p_spot
		side = p_side
		marker = p_marker
		animation_name = p_animation_name


const WORKER_SCENE := preload("res://scence/baseworker.tscn")

const STATE_IDLE := "idle"
const STATE_WORKING := "working"
const STATE_APPROVAL := "approval"
const STATE_ATTENTION := "attention"
const INVALID_CELL := Vector2i(999999, 999999)
const WORKER_CLICK_RADIUS := 28.0

@export var move_speed := 150.0
@export var arrive_distance := 6.0
@export var desktop_camera_zoom := Vector2.ONE
@export var mobile_camera_zoom := Vector2(0.82, 0.82)
@export var mobile_viewport_width_threshold := 900.0

@onready var overview_camera: Camera2D = $Camera2D
@onready var walkable_layer: TileMapLayer = $walk_able
@onready var idle_zone: TileMapLayer = $idle/zone
@onready var work_zone: TileMapLayer = $work/zone
@onready var world_depth_root: Node2D = $world_depth
@onready var bridge: WebBridge = get_node_or_null("Bridge") as WebBridge

var _rng := RandomNumberGenerator.new()
var _astar := AStarGrid2D.new()
var _walkable_cells: Dictionary = {}
var _zone_layers: Dictionary = {}
var _zone_walkable_cells: Dictionary = {}
var _zone_cell_occupants: Dictionary = {}
var _work_seats: Array[WorkSeat] = []
var _work_seat_by_key: Dictionary = {}
var _workers_by_session: Dictionary = {}
var _workers_root: Node2D
var _template_worker_scale := Vector2.ONE


func _ready() -> void:
	_rng.randomize()
	_apply_camera_zoom()
	get_viewport().size_changed.connect(_apply_camera_zoom)
	_cache_template_worker_scale()
	_ensure_workers_root()
	_hide_template_worker()
	_build_navigation()
	_build_zone_cache()
	_discover_work_seats()

	if bridge != null:
		bridge.message_received.connect(_on_bridge_message)


func _apply_camera_zoom() -> void:
	if overview_camera == null:
		return

	var viewport_size: Vector2 = get_viewport_rect().size
	var is_mobile_width := viewport_size.x <= mobile_viewport_width_threshold
	overview_camera.enabled = true
	overview_camera.zoom = mobile_camera_zoom if is_mobile_width else desktop_camera_zoom


func _process(delta: float) -> void:
	for actor_variant in _workers_by_session.values():
		var actor: WorkerActor = actor_variant
		_advance_worker(actor, delta)


func _input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return

	var click_position: Vector2 = get_global_mouse_position()
	for actor_variant in _workers_by_session.values():
		var actor: WorkerActor = actor_variant
		var click_target: Vector2 = _get_actor_click_position(actor)
		if click_position.distance_to(click_target) <= WORKER_CLICK_RADIUS:
			_emit_worker_click(actor)
			return


func _on_bridge_message(message_type: String, payload: Variant, _envelope: Dictionary) -> void:
	match message_type:
		"sync_sessions":
			_apply_session_snapshot(payload)
		"set_worker_state":
			_apply_single_worker_state(payload)


func _apply_session_snapshot(payload: Variant) -> void:
	if not (payload is Dictionary):
		return

	var payload_dict: Dictionary = payload
	var sessions_payload: Array = payload_dict.get("sessions", [])
	var incoming_ids: Dictionary = {}

	for session_variant in sessions_payload:
		if not (session_variant is Dictionary):
			continue

		var session: Dictionary = session_variant
		var session_id: String = _extract_session_id(session)
		if session_id.is_empty():
			continue

		incoming_ids[session_id] = true

		var is_new := not _workers_by_session.has(session_id)
		var actor: WorkerActor = _ensure_worker_actor(session_id)
		actor.title = _extract_session_title(session)
		_sync_worker_title(actor)
		var next_state: String = _normalize_state(str(session.get("state", session.get("status", STATE_IDLE))))
		_set_worker_state(actor, next_state, is_new)

	for session_id_variant in _workers_by_session.keys().duplicate():
		var session_id: String = str(session_id_variant)
		if not incoming_ids.has(session_id):
			_remove_worker_actor(session_id)


func _apply_single_worker_state(payload: Variant) -> void:
	if not (payload is Dictionary):
		return

	var payload_dict: Dictionary = payload
	var session_id: String = str(payload_dict.get("sessionId", payload_dict.get("id", "")))
	if session_id.is_empty():
		return

	if not _workers_by_session.has(session_id):
		var actor_new: WorkerActor = _ensure_worker_actor(session_id)
		actor_new.title = str(payload_dict.get("title", session_id))
		_sync_worker_title(actor_new)
		_set_worker_state(
			actor_new,
			_normalize_state(str(payload_dict.get("state", payload_dict.get("status", STATE_IDLE)))),
			true
		)
		return

	var actor: WorkerActor = _workers_by_session[session_id]
	if payload_dict.has("title") or payload_dict.has("name"):
		actor.title = str(payload_dict.get("title", payload_dict.get("name", actor.title)))
		_sync_worker_title(actor)
	_set_worker_state(
		actor,
		_normalize_state(str(payload_dict.get("state", payload_dict.get("status", STATE_IDLE)))),
		false
	)


func _ensure_worker_actor(session_id: String) -> WorkerActor:
	if _workers_by_session.has(session_id):
		return _workers_by_session[session_id]

	var node: Node2D = WORKER_SCENE.instantiate() as Node2D
	node.scale = _template_worker_scale
	_workers_root.add_child(node)
	node.visible = false
	node.name = "worker_%s" % session_id.left(8)

	var sprite: AnimatedSprite2D = node.get_node("AnimatedSprite2D") as AnimatedSprite2D
	var actor: WorkerActor = WorkerActor.new(node, sprite)
	actor.session_id = session_id
	_assign_work_seat_binding(actor)
	_workers_by_session[session_id] = actor
	return actor


func _remove_worker_actor(session_id: String) -> void:
	if not _workers_by_session.has(session_id):
		return

	var actor: WorkerActor = _workers_by_session[session_id]
	_release_zone_cell(actor)
	_release_work_seat(actor)
	actor.node.queue_free()
	_workers_by_session.erase(session_id)


func _set_worker_state(actor: WorkerActor, next_state: String, is_new: bool) -> void:
	if actor.assigned_work_seat_key.is_empty():
		_assign_work_seat_binding(actor)

	if is_new:
		_spawn_actor_for_state(actor, next_state)
		return

	if actor.state == next_state:
		return

	if actor.state == STATE_WORKING:
		_unseat_actor_to_marker(actor)

	_release_zone_cell(actor)
	actor.state = next_state
	actor.current_zone = _resolve_zone_for_state(next_state)
	_sync_worker_state_indicator(actor)

	if next_state == STATE_WORKING:
		_begin_work_transition(actor)
		return

	_move_actor_to_random_zone_cell(actor, actor.current_zone)


func _spawn_actor_for_state(actor: WorkerActor, state_name: String) -> void:
	_release_zone_cell(actor)
	actor.state = state_name
	actor.current_zone = _resolve_zone_for_state(state_name)
	actor.path_points.clear()
	actor.pending_seat_activation = false
	_sync_worker_state_indicator(actor)

	if state_name == STATE_WORKING:
		_seat_actor_immediately(actor)
		return

	_place_actor_on_random_zone_cell(actor, actor.current_zone)


func _begin_work_transition(actor: WorkerActor) -> void:
	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat == null:
		return

	seat.spot.release_side(seat.side, actor.session_id)
	actor.pending_seat_activation = true
	actor.node.visible = true
	_sync_worker_title(actor)
	_set_actor_path_to_world(actor, seat.marker.global_position)


func _move_actor_to_random_zone_cell(actor: WorkerActor, zone_name: String) -> void:
	var reserved_cell: Vector2i = _reserve_random_zone_cell(zone_name, actor.session_id)
	if reserved_cell == INVALID_CELL:
		actor.path_points.clear()
		return

	actor.reserved_zone_cell = reserved_cell
	actor.has_reserved_zone_cell = true
	var target_world: Vector2 = _cell_to_world(reserved_cell)
	_set_actor_path_to_world(actor, target_world)


func _place_actor_on_random_zone_cell(actor: WorkerActor, zone_name: String) -> void:
	var reserved_cell: Vector2i = _reserve_random_zone_cell(zone_name, actor.session_id)
	if reserved_cell == INVALID_CELL:
		actor.node.visible = false
		return

	actor.reserved_zone_cell = reserved_cell
	actor.has_reserved_zone_cell = true
	actor.node.global_position = _cell_to_world(reserved_cell)
	actor.node.visible = true
	actor.path_points.clear()
	actor.current_zone = _detect_zone_for_position(actor.node.global_position)
	_sync_worker_title(actor)
	actor.facing_direction = Vector2.DOWN
	_play_idle_for_direction(actor, actor.facing_direction)


func _set_actor_path_to_world(actor: WorkerActor, target_world: Vector2) -> void:
	actor.path_points.clear()

	if _walkable_cells.is_empty():
		actor.path_points.append(target_world)
		return

	var start_cell: Vector2i = _find_nearest_walkable_cell(_world_to_cell(actor.node.global_position), 8)
	var end_cell: Vector2i = _find_nearest_walkable_cell(_world_to_cell(target_world), 8)
	var cell_path: Array[Vector2i] = _astar.get_id_path(start_cell, end_cell)

	for cell in cell_path:
		var world: Vector2 = _cell_to_world(cell)
		if actor.path_points.is_empty() and world.distance_to(actor.node.global_position) <= arrive_distance:
			continue
		actor.path_points.append(world)

	if actor.path_points.is_empty() or actor.path_points[actor.path_points.size() - 1].distance_to(target_world) > 1.0:
		actor.path_points.append(target_world)

	if actor.path_points.is_empty():
		_on_actor_destination_reached(actor)


func _advance_worker(actor: WorkerActor, delta: float) -> void:
	if actor.path_points.is_empty():
		return

	var next_point: Vector2 = actor.path_points[0]
	var to_target: Vector2 = next_point - actor.node.global_position
	var distance: float = to_target.length()

	if distance <= arrive_distance:
		actor.node.global_position = next_point
		actor.path_points.remove_at(0)
		if actor.path_points.is_empty():
			_on_actor_destination_reached(actor)
		return

	actor.facing_direction = to_target
	_play_walk_for_direction(actor, actor.facing_direction)
	var step: float = minf(distance, move_speed * delta)
	actor.node.global_position += to_target.normalized() * step


func _on_actor_destination_reached(actor: WorkerActor) -> void:
	if actor.pending_seat_activation:
		_activate_actor_work_seat(actor)
		return

	actor.current_zone = _detect_zone_for_position(actor.node.global_position)
	_play_idle_for_direction(actor, actor.facing_direction)


func _activate_actor_work_seat(actor: WorkerActor) -> void:
	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat == null:
		actor.pending_seat_activation = false
		return

	if seat.spot.assign_side(seat.side, actor.session_id, seat.animation_name):
		actor.pending_seat_activation = false
		actor.node.visible = false
		actor.path_points.clear()
		_release_zone_cell(actor)
		actor.current_zone = STATE_WORKING
		_sync_worker_title(actor)
		return

	actor.pending_seat_activation = false
	actor.node.visible = true
	_play_idle_for_direction(actor, Vector2.DOWN)


func _unseat_actor_to_marker(actor: WorkerActor) -> void:
	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat == null:
		return

	seat.spot.release_side(seat.side, actor.session_id)
	actor.node.visible = true
	actor.node.global_position = seat.marker.global_position
	actor.path_points.clear()
	actor.pending_seat_activation = false
	actor.current_zone = _detect_zone_for_position(actor.node.global_position)
	_sync_worker_title(actor)
	actor.facing_direction = Vector2.UP if seat.side == "beh" else Vector2.DOWN
	_play_idle_for_direction(actor, actor.facing_direction)


func _assign_work_seat_binding(actor: WorkerActor) -> void:
	if not actor.assigned_work_seat_key.is_empty():
		return

	for seat in _work_seats:
		if seat.occupied_by.is_empty():
			seat.occupied_by = actor.session_id
			actor.assigned_work_seat_key = seat.key
			return


func _release_work_seat(actor: WorkerActor) -> void:
	if actor.assigned_work_seat_key.is_empty():
		return

	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat != null:
		seat.spot.release_side(seat.side, actor.session_id)
		if seat.occupied_by == actor.session_id:
			seat.occupied_by = ""

	actor.assigned_work_seat_key = ""


func _get_actor_work_seat(actor: WorkerActor) -> WorkSeat:
	if actor.assigned_work_seat_key.is_empty():
		return null
	if not _work_seat_by_key.has(actor.assigned_work_seat_key):
		return null
	return _work_seat_by_key[actor.assigned_work_seat_key]


func _build_navigation() -> void:
	_walkable_cells.clear()

	for cell_variant in walkable_layer.get_used_cells():
		var cell: Vector2i = cell_variant
		_walkable_cells[cell] = true

	if _walkable_cells.is_empty():
		return

	var min_x := 2147483647
	var min_y := 2147483647
	var max_x := -2147483648
	var max_y := -2147483648

	for cell_variant in _walkable_cells.keys():
		var cell: Vector2i = cell_variant
		min_x = mini(min_x, cell.x)
		min_y = mini(min_y, cell.y)
		max_x = maxi(max_x, cell.x)
		max_y = maxi(max_y, cell.y)

	_astar.region = Rect2i(min_x, min_y, max_x - min_x + 1, max_y - min_y + 1)
	_astar.cell_size = Vector2(walkable_layer.tile_set.tile_size)
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_NEVER
	_astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
	_astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_MANHATTAN
	_astar.update()

	for x in range(min_x, max_x + 1):
		for y in range(min_y, max_y + 1):
			var cell := Vector2i(x, y)
			_astar.set_point_solid(cell, not _walkable_cells.has(cell))


func _build_zone_cache() -> void:
	_zone_layers.clear()
	_zone_walkable_cells.clear()
	_register_zone(STATE_IDLE, idle_zone)
	_register_zone(STATE_WORKING, work_zone)

	var approve_zone: TileMapLayer = get_node_or_null("approve/zone") as TileMapLayer
	var attention_zone: TileMapLayer = get_node_or_null("attention/zone") as TileMapLayer
	if approve_zone != null:
		_register_zone(STATE_APPROVAL, approve_zone)
	if attention_zone != null:
		_register_zone(STATE_ATTENTION, attention_zone)


func _register_zone(zone_name: String, tilemap: TileMapLayer) -> void:
	_zone_layers[zone_name] = tilemap
	_zone_walkable_cells[zone_name] = _extract_walkable_zone_cells(tilemap)


func _extract_walkable_zone_cells(tilemap: TileMapLayer) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for cell_variant in tilemap.get_used_cells():
		var cell: Vector2i = cell_variant
		if _walkable_cells.has(cell):
			result.append(cell)
	return result


func _discover_work_seats() -> void:
	_work_seats.clear()
	_work_seat_by_key.clear()

	if world_depth_root == null:
		return

	for child in world_depth_root.get_children():
		if not (child is WorkSpot):
			continue

		var spot: WorkSpot = child
		for side in ["front", "beh"]:
			if not spot.has_side(side):
				continue

			var marker: Marker2D = spot.get_marker_for_side(side)
			var animation_name: String = "idle_north" if side == "front" else "idle_south"
			var seat_key: String = "%s:%s" % [spot.name, side]
			var seat: WorkSeat = WorkSeat.new(seat_key, spot, side, marker, animation_name)
			_work_seats.append(seat)
			_work_seat_by_key[seat_key] = seat


func _reserve_random_zone_cell(zone_name: String, session_id: String) -> Vector2i:
	if not _zone_walkable_cells.has(zone_name):
		return INVALID_CELL

	var candidates: Array[Vector2i] = _zone_walkable_cells[zone_name]
	if candidates.is_empty():
		return INVALID_CELL

	var free_cells: Array[Vector2i] = []
	for cell in candidates:
		var occupant: String = str(_zone_cell_occupants.get(_cell_key(cell), ""))
		if occupant.is_empty() or occupant == session_id:
			free_cells.append(cell)

	if free_cells.is_empty():
		return INVALID_CELL

	var chosen: Vector2i = free_cells[_rng.randi_range(0, free_cells.size() - 1)]
	_zone_cell_occupants[_cell_key(chosen)] = session_id
	return chosen


func _release_zone_cell(actor: WorkerActor) -> void:
	if not actor.has_reserved_zone_cell:
		return

	var key: String = _cell_key(actor.reserved_zone_cell)
	if str(_zone_cell_occupants.get(key, "")) == actor.session_id:
		_zone_cell_occupants.erase(key)

	actor.has_reserved_zone_cell = false
	actor.reserved_zone_cell = INVALID_CELL


func _find_nearest_walkable_cell(origin: Vector2i, max_radius: int) -> Vector2i:
	if _walkable_cells.has(origin):
		return origin

	for radius in range(1, max_radius + 1):
		for x in range(origin.x - radius, origin.x + radius + 1):
			for y in range(origin.y - radius, origin.y + radius + 1):
				var candidate := Vector2i(x, y)
				if _walkable_cells.has(candidate):
					return candidate

	return origin


func _resolve_zone_for_state(state_name: String) -> String:
	match state_name:
		STATE_WORKING:
			return STATE_WORKING
		STATE_APPROVAL:
			if _zone_layers.has(STATE_APPROVAL):
				return STATE_APPROVAL
		STATE_ATTENTION:
			if _zone_layers.has(STATE_ATTENTION):
				return STATE_ATTENTION
	return STATE_IDLE


func _detect_zone_for_position(world_position: Vector2) -> String:
	for zone_name_variant in _zone_layers.keys():
		var zone_name: String = str(zone_name_variant)
		var zone_layer: TileMapLayer = _zone_layers[zone_name]
		if _tilemap_contains_world_position(zone_layer, world_position):
			return zone_name
	return STATE_IDLE


func _tilemap_contains_world_position(tilemap: TileMapLayer, world_position: Vector2) -> bool:
	var local_position: Vector2 = tilemap.to_local(world_position)
	var cell: Vector2i = tilemap.local_to_map(local_position)
	return tilemap.get_cell_source_id(cell) != -1


func _normalize_state(raw_state: String) -> String:
	var state_name: String = raw_state.strip_edges().to_lower()
	match state_name:
		"work", "worker", "working":
			return STATE_WORKING
		"approve", "approval":
			return STATE_APPROVAL
		"attention", "alert":
			return STATE_ATTENTION
		"idle", "":
			return STATE_IDLE
	return STATE_IDLE


func _extract_session_id(session: Dictionary) -> String:
	return str(session.get("sessionId", session.get("id", "")))


func _extract_session_title(session: Dictionary) -> String:
	var title: String = str(session.get("title", session.get("name", "")))
	if title.is_empty():
		return _extract_session_id(session)
	return title


func _sync_worker_title(actor: WorkerActor) -> void:
	var display_title: String = actor.title.strip_edges()
	if display_title.is_empty():
		display_title = actor.session_id.left(8)
	if display_title.length() > 14:
		display_title = "%s..." % display_title.left(11)

	var actor_label: Label = _get_worker_name_label(actor.node)
	if actor_label != null:
		actor_label.text = display_title

	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat != null:
		seat.spot.set_side_label(seat.side, display_title)


func _get_worker_name_label(node: Node2D) -> Label:
	return node.get_node_or_null("name_anchor/name_label") as Label


func _get_worker_state_anchor(node: Node2D) -> Marker2D:
	return node.get_node_or_null("state_anchor") as Marker2D


func _sync_worker_state_indicator(actor: WorkerActor) -> void:
	var state_anchor: Marker2D = _get_worker_state_anchor(actor.node)
	if state_anchor == null:
		return

	state_anchor.visible = actor.state == STATE_APPROVAL


func _get_actor_click_position(actor: WorkerActor) -> Vector2:
	if actor.node.visible:
		return actor.node.global_position + Vector2(0.0, -18.0)

	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat != null:
		return seat.spot.get_side_click_position(seat.side)

	return actor.node.global_position


func _emit_worker_click(actor: WorkerActor) -> void:
	if bridge == null or actor.session_id.is_empty():
		return

	bridge.send_message("worker_click", {
		"sessionId": actor.session_id,
		"title": actor.title,
		"state": actor.state,
		"zone": actor.current_zone,
	})


func _play_idle_for_direction(actor: WorkerActor, vector: Vector2) -> void:
	var direction_name: String = _direction_name_from_vector(vector)
	if direction_name == "north":
		_play_animation(actor.sprite, "idle_north")
	else:
		_play_animation(actor.sprite, "idle_south")


func _play_walk_for_direction(actor: WorkerActor, vector: Vector2) -> void:
	_play_animation(actor.sprite, "walk_%s" % _direction_name_from_vector(vector))


func _direction_name_from_vector(vector: Vector2) -> String:
	if vector == Vector2.ZERO:
		return "south"

	if absf(vector.x) > absf(vector.y):
		return "east" if vector.x > 0.0 else "west"

	return "south" if vector.y > 0.0 else "north"


func _play_animation(sprite: AnimatedSprite2D, animation_name: String) -> void:
	if sprite.sprite_frames == null:
		return
	if not sprite.sprite_frames.has_animation(animation_name):
		return
	if sprite.animation != animation_name:
		sprite.play(animation_name)
	elif not sprite.is_playing():
		sprite.play()


func _seat_actor_immediately(actor: WorkerActor) -> void:
	var seat: WorkSeat = _get_actor_work_seat(actor)
	if seat == null:
		return

	seat.spot.release_side(seat.side, actor.session_id)
	actor.pending_seat_activation = false
	actor.path_points.clear()
	actor.node.global_position = seat.marker.global_position

	if seat.spot.assign_side(seat.side, actor.session_id, seat.animation_name):
		actor.node.visible = false
		actor.current_zone = STATE_WORKING
		_release_zone_cell(actor)
		_sync_worker_title(actor)
		return

	actor.node.visible = true
	_place_actor_on_random_zone_cell(actor, STATE_WORKING)
	_begin_work_transition(actor)


func _cell_to_world(cell: Vector2i) -> Vector2:
	return walkable_layer.to_global(walkable_layer.map_to_local(cell))


func _world_to_cell(world_position: Vector2) -> Vector2i:
	return walkable_layer.local_to_map(walkable_layer.to_local(world_position))


func _cell_key(cell: Vector2i) -> String:
	return "%s:%s" % [cell.x, cell.y]


func _ensure_workers_root() -> void:
	if world_depth_root == null:
		return

	var existing_root: Node2D = world_depth_root.get_node_or_null("workers") as Node2D
	if existing_root != null:
		_workers_root = existing_root
		return

	_workers_root = Node2D.new()
	_workers_root.name = "workers"
	_workers_root.y_sort_enabled = true
	world_depth_root.add_child(_workers_root)


func _hide_template_worker() -> void:
	if world_depth_root == null:
		return

	var template_worker: Node2D = world_depth_root.get_node_or_null("base_worker") as Node2D
	if template_worker != null:
		template_worker.visible = false


func _cache_template_worker_scale() -> void:
	if world_depth_root == null:
		return

	var template_worker: Node2D = world_depth_root.get_node_or_null("base_worker") as Node2D
	if template_worker != null:
		_template_worker_scale = template_worker.scale
