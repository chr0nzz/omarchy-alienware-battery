.pragma library

var BATTERY_GLYPHS = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"]
var CHARGING_GLYPHS = ["󰢜", "󰂆", "󰂇", "󰂈", "󰢝", "󰂉", "󰢞", "󰂊", "󰂋", "󰂅"]
var FULL_GLYPH = "󰂅"
var NO_BATTERY_GLYPH = "󱉝"

var PROFILE_ORDER = ["low-power", "quiet", "balanced", "balanced-performance", "performance", "custom"]

var PROFILE_LABELS = {
  "low-power": "Low power",
  "quiet": "Quiet",
  "balanced": "Balanced",
  "balanced-performance": "Balanced perf",
  "performance": "Performance",
  "custom": "Custom"
}

var PROFILE_GLYPHS = {
  "low-power": "󰌪",
  "quiet": "󰤄",
  "balanced": "󰾅",
  "balanced-performance": "󰓅",
  "performance": "󰈸",
  "custom": "󰢻"
}

var LOW_MIN = 5
var LOW_MAX = 50
var LOW_DEFAULT = 15

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function toNumber(value, fallback) {
  var n = Number(value)
  return isFinite(n) ? n : fallback
}

function toList(value) {
  return Array.isArray(value) ? value : []
}

function boolOr(value, fallback) {
  if (typeof value === "boolean") return value
  var s = String(value === undefined || value === null ? "" : value).toLowerCase().trim()
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true
  if (s === "false" || s === "0" || s === "no" || s === "off") return false
  return fallback
}

function clampLow(value) {
  var n = Math.round(toNumber(value, LOW_DEFAULT))
  return Math.max(LOW_MIN, Math.min(LOW_MAX, n))
}

function snapshot(device) {
  if (!device || device.isPresent !== true) return { isPresent: false }
  return {
    isPresent: true,
    percentage: device.percentage,
    state: device.state,
    changeRate: device.changeRate,
    timeToFull: device.timeToFull,
    timeToEmpty: device.timeToEmpty
  }
}

function fraction(device) {
  var d = isObject(device) ? device : {}
  if (d.isPresent !== true) return 0
  return Math.max(0, Math.min(1, toNumber(d.percentage, 0)))
}

function percentText(device) {
  var d = isObject(device) ? device : {}
  if (d.isPresent !== true) return ""
  return Math.round(fraction(d) * 100) + "%"
}

function thresholdActive(device, onBattery, states) {
  var d = isObject(device) ? device : {}
  var s = isObject(states) ? states : {}
  if (d.isPresent !== true || onBattery === true) return false
  var f = fraction(d)
  if (d.state === s.Discharging) return false
  if (d.state === s.PendingCharge) return true
  if (d.state === s.FullyCharged && f < 0.99) return true
  if (d.state !== s.Charging || f >= 0.99) return false
  return toNumber(d.changeRate, 0) <= 0.2 || toNumber(d.timeToFull, 0) >= 8 * 60 * 60
}

function phase(device, onBattery, states) {
  var d = isObject(device) ? device : {}
  var s = isObject(states) ? states : {}
  if (d.isPresent !== true) return "missing"
  if (thresholdActive(d, onBattery, s)) return "holding"
  if (onBattery === true) return "discharging"
  if (d.state === s.FullyCharged || fraction(d) >= 0.99) return "full"
  return "charging"
}

function phaseLabel(value) {
  switch (value) {
  case "holding": return "Charge limit reached"
  case "discharging": return "On battery"
  case "full": return "Fully charged"
  case "charging": return "Charging"
  default: return "No battery"
  }
}

function glyph(device, onBattery, states) {
  var d = isObject(device) ? device : {}
  var p = phase(d, onBattery, states)
  if (p === "missing") return NO_BATTERY_GLYPH
  if (p === "full") return FULL_GLYPH
  var index = Math.max(0, Math.min(9, Math.floor(fraction(d) * 10)))
  if (p === "charging") return CHARGING_GLYPHS[index]
  return BATTERY_GLYPHS[index]
}

function isLow(device, onBattery, threshold) {
  var d = isObject(device) ? device : {}
  if (d.isPresent !== true || onBattery !== true) return false
  return fraction(d) * 100 <= clampLow(threshold)
}

function formatDuration(seconds) {
  var s = Math.round(toNumber(seconds, 0))
  if (s <= 0) return ""
  var minutes = Math.round(s / 60)
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  if (h <= 0) return m + "m"
  return m === 0 ? h + "h" : h + "h " + m + "m"
}

function formatRate(watts) {
  var w = Math.abs(toNumber(watts, 0))
  if (w < 0.05) return ""
  return (w >= 10 ? w.toFixed(0) : w.toFixed(1)) + " W"
}

function timeLine(device, onBattery, states) {
  var d = isObject(device) ? device : {}
  var p = phase(d, onBattery, states)
  if (p === "discharging") {
    var left = formatDuration(d.timeToEmpty)
    return left ? left + " left" : ""
  }
  if (p === "charging") {
    var full = formatDuration(d.timeToFull)
    return full ? full + " to full" : ""
  }
  return ""
}

function tooltip(device, onBattery, states, profileName) {
  var d = isObject(device) ? device : {}
  if (d.isPresent !== true) return "No battery"
  var head = [percentText(d), phaseLabel(phase(d, onBattery, states))]
  var p = phase(d, onBattery, states)
  if (p === "charging" || p === "discharging") {
    var rate = formatRate(d.changeRate)
    if (rate) head.push(rate)
    var time = timeLine(d, onBattery, states)
    if (time) head.push(time)
  }
  var lines = [head.join(" · ")]
  if (profileName) lines.push("Thermal profile: " + profileLabel(profileName))
  return lines.join("\n")
}

function parseKeyValue(text) {
  var out = {}
  var lines = String(text === undefined || text === null ? "" : text).split("\n")
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf("\t")
    if (idx <= 0) continue
    out[lines[i].substring(0, idx).trim()] = lines[i].substring(idx + 1).trim()
  }
  return out
}

function profileLabel(name, gmodeForced) {
  var key = String(name || "").trim()
  if (!key) return "Unknown"
  if (key === "performance" && gmodeForced === true) return "G-Mode"
  return PROFILE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ")
}

function profileGlyph(name) {
  return PROFILE_GLYPHS[String(name || "")] || "󰈐"
}

function parseProfile(text) {
  var empty = { available: false, current: "", choices: [], writable: false, gmodeForced: false }
  var raw
  try {
    raw = JSON.parse(String(text || "").trim().split("\n").pop())
  } catch (e) {
    return empty
  }
  if (!isObject(raw) || raw.ok === false) return empty
  var src = isObject(raw.profile) ? raw.profile : (isObject(raw.status) && isObject(raw.status.profile) ? raw.status.profile : null)
  if (!src) return empty
  var choices = []
  var list = toList(src.choices)
  for (var i = 0; i < list.length; i++) {
    var name = String(list[i] || "").trim()
    if (name && choices.indexOf(name) === -1) choices.push(name)
  }
  var current = String(src.current || "").trim()
  if (current && choices.indexOf(current) === -1) choices.push(current)
  choices.sort(function(a, b) {
    var ia = PROFILE_ORDER.indexOf(a)
    var ib = PROFILE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return {
    available: choices.length > 0,
    current: current,
    choices: choices,
    writable: src.writable !== false,
    gmodeForced: src.gmodeForced === true
  }
}

function nextProfile(choices, current, direction) {
  var list = toList(choices)
  if (!list.length) return ""
  var step = Math.round(toNumber(direction, 1)) || 1
  var idx = list.indexOf(String(current || ""))
  if (idx === -1) return String(list[0])
  var next = (idx + step) % list.length
  if (next < 0) next += list.length
  return String(list[next])
}

var HZ_MIN = 30
var HZ_MAX = 1000

function clampHz(value) {
  var n = Math.round(toNumber(value, 0))
  if (!isFinite(n) || n <= 0) return 0
  return Math.max(HZ_MIN, Math.min(HZ_MAX, n))
}

function refreshTarget(onBattery, batteryHz, acHz) {
  return clampHz(onBattery === true ? batteryHz : acHz)
}

function parseMonitors(text) {
  var raw
  try {
    raw = JSON.parse(String(text || "").trim())
  } catch (e) {
    return []
  }
  if (!Array.isArray(raw)) return []
  var out = []
  for (var i = 0; i < raw.length; i++) {
    var m = raw[i]
    if (!isObject(m)) continue
    out.push({
      name: String(m.name || ""),
      width: Math.round(toNumber(m.width, 0)),
      height: Math.round(toNumber(m.height, 0)),
      refreshRate: toNumber(m.refreshRate, 0),
      x: Math.round(toNumber(m.x, 0)),
      y: Math.round(toNumber(m.y, 0)),
      scale: toNumber(m.scale, 1),
      modes: toList(m.availableModes).map(function(v) { return String(v) })
    })
  }
  return out
}

function isInternal(monitor) {
  return /^edp/i.test(String(monitor && monitor.name ? monitor.name : ""))
}

function internalMonitors(list) {
  var all = toList(list)
  var internal = all.filter(isInternal)
  return internal.length ? internal : all
}

function modeRate(mode) {
  var match = /@([0-9.]+)/.exec(String(mode || ""))
  return match ? toNumber(match[1], NaN) : NaN
}

function modeSize(mode) {
  var match = /^([0-9]+)x([0-9]+)/.exec(String(mode || ""))
  return match ? { width: toNumber(match[1], 0), height: toNumber(match[2], 0) } : null
}

function supportsRate(monitor, hz) {
  var want = clampHz(hz)
  if (!want || !isObject(monitor)) return false
  var modes = toList(monitor.modes)
  for (var i = 0; i < modes.length; i++) {
    var size = modeSize(modes[i])
    var rate = modeRate(modes[i])
    if (!size || !isFinite(rate)) continue
    if (size.width === monitor.width && size.height === monitor.height && Math.abs(rate - want) < 1) return true
  }
  return false
}

function atRate(monitor, hz) {
  var want = clampHz(hz)
  return !!want && isObject(monitor) && Math.abs(toNumber(monitor.refreshRate, 0) - want) < 1
}

function safeOutput(name) {
  return typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name)
}

function safeInt(value, min) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= min && value <= 100000
}

function safeScale(value) {
  return typeof value === "number" && isFinite(value) && value > 0 && value <= 10
}

function monitorArgs(monitor, hz) {
  var want = clampHz(hz)
  if (!want || !isObject(monitor) || !safeOutput(monitor.name)) return []
  if (!safeInt(monitor.width, 1) || !safeInt(monitor.height, 1)) return []
  if (!safeInt(monitor.x, -100000) || !safeInt(monitor.y, -100000) || !safeScale(monitor.scale)) return []
  var lua = "hl.monitor({ output = \"" + monitor.name + "\", mode = \"" +
    monitor.width + "x" + monitor.height + "@" + want + "\", position = \"" +
    monitor.x + "x" + monitor.y + "\", scale = " + monitor.scale + " })"
  return ["hyprctl", "eval", lua]
}

function refreshPlan(monitors, onBattery, batteryHz, acHz) {
  var want = refreshTarget(onBattery, batteryHz, acHz)
  var plan = []
  if (!want) return plan
  var list = internalMonitors(monitors)
  for (var i = 0; i < list.length; i++) {
    var monitor = list[i]
    if (atRate(monitor, want) || !supportsRate(monitor, want)) continue
    var argv = monitorArgs(monitor, want)
    if (!argv.length) continue
    plan.push({ name: monitor.name, hz: want, argv: argv })
  }
  return plan
}

function lowPowerPlan(onBattery, enabled, current, previous) {
  if (enabled !== true) return { profile: "", remember: previous || "" }
  var now = String(current || "")
  if (onBattery === true) {
    if (now === "low-power") return { profile: "", remember: previous || "" }
    return { profile: "low-power", remember: now }
  }
  var back = String(previous || "")
  if (!back || back === "low-power" || back === now) return { profile: "", remember: "" }
  return { profile: back, remember: "" }
}

function lowWarningDue(device, onBattery, threshold, armed) {
  return armed === true && isLow(device, onBattery, threshold)
}

function lowWarningArmed(device, onBattery, threshold, armed) {
  if (onBattery !== true) return true
  if (isLow(device, onBattery, threshold)) return false
  return armed === true
}

function cmdLowWarning(device) {
  return ["omarchy-battery-low", String(Math.round(fraction(device) * 100))]
}

function cmdStatus() { return ["alienwarectl", "status"] }
function cmdProfile(name) { return ["alienwarectl", "profile", String(name || "")] }
