extends Node
class_name WebBridge

signal bridge_ready(handshake: Dictionary)
signal message_received(message_type: String, payload: Variant, envelope: Dictionary)

const BRIDGE_NAME := "agenttown-godot"

@export var target_origin := "*"

var _window = null
var _parent_window = null
var _bridge_callback = null
var _bridge_installed := false


func _ready() -> void:
	if not OS.has_feature("web"):
		return

	_setup_web_bridge()
	call_deferred("notify_ready")


func is_available() -> bool:
	return _bridge_installed


func notify_ready(extra: Dictionary = {}) -> void:
	var payload: Dictionary = {
		"engine": "godot",
		"bridge": BRIDGE_NAME,
		"node_path": str(get_path()),
	}
	payload.merge(extra, true)
	send_message("ready", payload)
	bridge_ready.emit(payload)


func send_message(message_type: String, payload: Variant = {}, meta: Dictionary = {}) -> void:
	if not _bridge_installed or _parent_window == null:
		return

	var envelope: Dictionary = {
		"bridge": BRIDGE_NAME,
		"source": "godot",
		"type": message_type,
		"payload": payload,
		"meta": meta,
		"timestamp": Time.get_unix_time_from_system(),
	}
	_parent_window.postMessage(JSON.stringify(envelope), target_origin)


func _setup_web_bridge() -> void:
	_window = JavaScriptBridge.get_interface("window")
	if _window == null:
		push_warning("WebBridge: window interface unavailable")
		return

	_parent_window = _window.parent
	_bridge_callback = JavaScriptBridge.create_callback(_on_js_message)
	_window.__agenttownGodotDispatch = _bridge_callback

	JavaScriptBridge.eval(
		"""
		(function () {
			if (window.__agenttownGodotBridgeInstalled) {
				return;
			}
			window.__agenttownGodotBridgeInstalled = true;
			window.addEventListener("message", function (event) {
				if (typeof window.__agenttownGodotDispatch !== "function") {
					return;
				}
				window.__agenttownGodotDispatch(JSON.stringify({
					bridge: "agenttown-godot",
					source: "parent",
					origin: event.origin || "",
					data: event.data
				}));
			});
		})();
		""",
		true
	)

	_bridge_installed = true


func _on_js_message(args: Array) -> void:
	if args.is_empty():
		return

	var raw_envelope: Variant = JSON.parse_string(str(args[0]))
	if not (raw_envelope is Dictionary):
		return

	var js_envelope: Dictionary = raw_envelope
	var normalized: Dictionary = _normalize_incoming_message(
		js_envelope.get("data"),
		str(js_envelope.get("origin", ""))
	)
	if normalized.is_empty():
		return

	_handle_internal_message(normalized)
	message_received.emit(
		str(normalized.get("type", "message")),
		normalized.get("payload"),
		normalized
	)


func _normalize_incoming_message(raw_payload: Variant, origin: String) -> Dictionary:
	var payload: Variant = raw_payload
	if payload is String:
		var parsed_payload: Variant = JSON.parse_string(payload)
		if parsed_payload != null:
			payload = parsed_payload

	var envelope: Dictionary = {
		"bridge": BRIDGE_NAME,
		"source": "parent",
		"origin": origin,
		"type": "message",
		"payload": payload,
	}

	if payload is Dictionary:
		var payload_dict: Dictionary = payload
		if payload_dict.has("bridge") and str(payload_dict.get("bridge")) != BRIDGE_NAME:
			return {}
		if payload_dict.has("type"):
			envelope["type"] = str(payload_dict.get("type", "message"))
			envelope["payload"] = payload_dict.get("payload", {})
			if payload_dict.has("meta"):
				envelope["meta"] = payload_dict.get("meta")
			if payload_dict.has("requestId"):
				envelope["requestId"] = payload_dict.get("requestId")

	return envelope


func _handle_internal_message(envelope: Dictionary) -> void:
	var message_type: String = str(envelope.get("type", ""))
	var payload: Variant = envelope.get("payload", {})

	match message_type:
		"ping":
			send_message("pong", payload, _reply_meta(envelope))
		"set_target_origin":
			if payload is Dictionary and payload.has("origin"):
				target_origin = str(payload.get("origin", "*"))
				send_message("target_origin_updated", {"origin": target_origin}, _reply_meta(envelope))


func _reply_meta(envelope: Dictionary) -> Dictionary:
	var meta: Dictionary = {}
	if envelope.has("requestId"):
		meta["replyTo"] = envelope.get("requestId")
	return meta
