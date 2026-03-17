@tool
extends Node2D
class_name WorkSpot

enum DeskColor {
	PINK,
	WOOD,
}

enum TabletopVariant {
	NONE,
	VARIANT_1,
	VARIANT_2,
	VARIANT_3,
}

@export var desk_color: DeskColor = DeskColor.PINK:
	set(value):
		desk_color = value
		_apply_if_ready()

@export var tabletop_back_variant: TabletopVariant = TabletopVariant.VARIANT_2:
	set(value):
		tabletop_back_variant = value
		_apply_if_ready()

@export var tabletop_front_variant: TabletopVariant = TabletopVariant.NONE:
	set(value):
		tabletop_front_variant = value
		_apply_if_ready()

@onready var marker_front: Marker2D = get_node_or_null("markers/marker_fron") as Marker2D
@onready var marker_beh: Marker2D = get_node_or_null("markers/marker_beh") as Marker2D
@onready var worker_seat_front: AnimatedSprite2D = get_node_or_null("front/worker_seat_front") as AnimatedSprite2D
@onready var worker_seat_beh: AnimatedSprite2D = get_node_or_null("beh/worker_seat_beh") as AnimatedSprite2D
@onready var seat_label_front: Label = get_node_or_null("front/name_anchor_front/name_label_front") as Label
@onready var seat_label_beh: Label = get_node_or_null("beh/name_anchor_beh/name_label_beh") as Label

var _seat_occupants: Dictionary = {
	"front": "",
	"beh": "",
}


func _ready() -> void:
	_apply_visual_state()
	_reset_worker_seats()


func _apply_if_ready() -> void:
	if not is_node_ready():
		return
	_apply_visual_state()


func _apply_visual_state() -> void:
	_set_desk_color()
	_set_tabletop_variant(["beh/tabletop_beh", "tabletop/tabletop_beh"], "tabletop_beh", tabletop_back_variant)
	_set_tabletop_variant(["front/tabletop_front", "tabletop/tabletop_front"], "tabletop_front", tabletop_front_variant)


func get_marker_for_side(side: String) -> Marker2D:
	match side:
		"front":
			return marker_front
		"beh":
			return marker_beh
	return null


func has_side(side: String) -> bool:
	return get_marker_for_side(side) != null and _get_seat_sprite(side) != null


func is_side_available(side: String) -> bool:
	var occupant: String = str(_seat_occupants.get(side, ""))
	return occupant.is_empty()


func assign_side(side: String, session_id: String, animation_name: String) -> bool:
	var seat_sprite: AnimatedSprite2D = _get_seat_sprite(side)
	if seat_sprite == null:
		return false

	var occupant: String = str(_seat_occupants.get(side, ""))
	if not occupant.is_empty() and occupant != session_id:
		return false

	_seat_occupants[side] = session_id
	seat_sprite.visible = true
	if seat_sprite.sprite_frames != null and seat_sprite.sprite_frames.has_animation(animation_name):
		seat_sprite.play(animation_name)
	_set_side_label_visibility(side, true)
	return true


func release_side(side: String, session_id: String = "") -> void:
	var occupant: String = str(_seat_occupants.get(side, ""))
	if not session_id.is_empty() and occupant != session_id:
		return

	_seat_occupants[side] = ""
	var seat_sprite: AnimatedSprite2D = _get_seat_sprite(side)
	if seat_sprite != null:
		seat_sprite.stop()
		seat_sprite.visible = false
	_set_side_label_visibility(side, false)


func get_side_session(side: String) -> String:
	return str(_seat_occupants.get(side, ""))


func set_side_label(side: String, label_text: String) -> void:
	var seat_label: Label = _get_side_label(side)
	if seat_label == null:
		return

	seat_label.text = label_text
	_set_side_label_visibility(side, not label_text.is_empty() and _is_side_active(side))


func clear_side_label(side: String) -> void:
	var seat_label: Label = _get_side_label(side)
	if seat_label == null:
		return

	seat_label.text = ""
	_set_side_label_visibility(side, false)


func get_side_click_position(side: String) -> Vector2:
	var seat_sprite: AnimatedSprite2D = _get_seat_sprite(side)
	if seat_sprite != null:
		return seat_sprite.global_position + Vector2(0.0, -18.0)

	var marker: Marker2D = get_marker_for_side(side)
	if marker != null:
		return marker.global_position

	return global_position


func _set_desk_color() -> void:
	var use_pink := desk_color == DeskColor.PINK
	_set_visible_if_exists(["front/desk_front/desk_pink", "desk_front/desk_pink"], use_pink)
	_set_visible_if_exists(["front/desk_front/desk_wood", "desk_front/desk_wood"], not use_pink)
	_set_visible_if_exists(["beh/desk_beh/desk_pink", "desk_beh/desk_pink"], use_pink)
	_set_visible_if_exists(["beh/desk_beh/desk_wood", "desk_beh/desk_wood"], not use_pink)


func _set_tabletop_variant(group_paths: Array[String], node_prefix: String, variant: TabletopVariant) -> void:
	var group := _get_first_existing_node(group_paths)
	if group == null:
		return

	group.visible = variant != TabletopVariant.NONE

	for index in range(1, 4):
		var node_paths: Array[String] = []
		for group_path in group_paths:
			node_paths.append("%s/%s_%d" % [group_path, node_prefix, index])
		_set_visible_if_exists(node_paths, variant == index)


func _set_visible_if_exists(node_paths: Array[String], is_visible: bool) -> void:
	var node := _get_first_existing_node(node_paths)
	if node != null:
		node.visible = is_visible


func _get_first_existing_node(node_paths: Array[String]) -> CanvasItem:
	for node_path in node_paths:
		var node := get_node_or_null(node_path)
		if node is CanvasItem:
			return node
	return null


func _reset_worker_seats() -> void:
	for side in ["front", "beh"]:
		_seat_occupants[side] = ""
		var seat_sprite: AnimatedSprite2D = _get_seat_sprite(side)
		if seat_sprite != null:
			seat_sprite.visible = false
			seat_sprite.stop()
		clear_side_label(side)


func _get_seat_sprite(side: String) -> AnimatedSprite2D:
	match side:
		"front":
			return worker_seat_front
		"beh":
			return worker_seat_beh
	return null


func _get_side_label(side: String) -> Label:
	match side:
		"front":
			return seat_label_front
		"beh":
			return seat_label_beh
	return null


func _set_side_label_visibility(side: String, is_visible: bool) -> void:
	var seat_label: Label = _get_side_label(side)
	if seat_label == null:
		return

	var should_show := is_visible and not seat_label.text.is_empty()
	seat_label.visible = should_show


func _is_side_active(side: String) -> bool:
	var seat_sprite: AnimatedSprite2D = _get_seat_sprite(side)
	return seat_sprite != null and seat_sprite.visible
