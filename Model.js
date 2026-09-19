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

// A plain snapshot of UPower.displayDevice, so the logic below can be tested
// without Quickshell and bindings only depend on the fields they read.
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

// Charging with the battery parked below full means a charge limit is holding
// it there. UPower reports that a few different ways depending on the driver.
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

// "Time left" on battery, "Time to full" while charging, nothing otherwise.
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

// `alienwarectl status` prints one JSON object. Only the thermal profile is
// read here; anything unparseable means the helper is absent or down.
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

function cmdStatus() { return ["alienwarectl", "status"] }
function cmdProfile(name) { return ["alienwarectl", "profile", String(name || "")] }
