# Spike capture target (Plan 088 Phase 1). Continuous motion proves live frames
# (T001); the on-screen log makes injected input (T003) visible in capture stills
# and in stdout.
extends Node2D

var t := 0.0
var drag_count := 0
var lines: PackedStringArray = []

@onready var rect: ColorRect = $Rect
@onready var fps_label: Label = $FPS
@onready var log_label: Label = $Log

func _process(delta: float) -> void:
	t += delta
	var size := get_viewport_rect().size
	rect.position = Vector2(
		size.x * 0.5 - 40.0 + (size.x * 0.35) * sin(t * 2.0),
		size.y * 0.5 - 40.0 + (size.y * 0.3) * sin(t * 3.1)
	)
	rect.color = Color.from_hsv(fmod(t * 0.1, 1.0), 0.85, 1.0)
	fps_label.text = "fps: %d   t: %.1fs" % [Engine.get_frames_per_second(), t]

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		_log("mouse btn=%d at (%.0f, %.0f)" % [event.button_index, event.position.x, event.position.y])
	elif event is InputEventMouseMotion and event.button_mask != 0:
		drag_count += 1
		if drag_count % 15 == 0:
			_log("drag at (%.0f, %.0f)" % [event.position.x, event.position.y])
	elif event is InputEventKey and event.pressed and not event.echo:
		var ch := char(event.unicode) if event.unicode > 0 else ""
		_log("key keycode=%s unicode='%s'" % [event.keycode, ch])

func _log(s: String) -> void:
	lines.append(s)
	while lines.size() > 14:
		lines.remove_at(0)
	log_label.text = "\n".join(lines)
	print("[input] ", s)
