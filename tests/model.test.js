const test = require("node:test")
const assert = require("node:assert/strict")
const { Model } = require("./load")

const S = { Charging: 1, Discharging: 2, FullyCharged: 4, PendingCharge: 5 }

function dev(percentage, state, extra) {
  return Object.assign({ isPresent: true, percentage, state, changeRate: 40, timeToFull: 3600, timeToEmpty: 7200 }, extra || {})
}

test("snapshot copies only what the widget reads", () => {
  assert.deepEqual(Model.snapshot(null), { isPresent: false })
  assert.deepEqual(Model.snapshot({ isPresent: false, percentage: 0.5 }), { isPresent: false })
  assert.deepEqual(Model.snapshot({ isPresent: true, percentage: 0.5, state: 2, changeRate: 9, timeToFull: 0, timeToEmpty: 60, model: "x" }),
    { isPresent: true, percentage: 0.5, state: 2, changeRate: 9, timeToFull: 0, timeToEmpty: 60 })
})

test("phase covers each power state", () => {
  assert.equal(Model.phase({ isPresent: false }, false, S), "missing")
  assert.equal(Model.phase(dev(0.4, S.Discharging), true, S), "discharging")
  assert.equal(Model.phase(dev(0.4, S.Charging), false, S), "charging")
  assert.equal(Model.phase(dev(1, S.FullyCharged), false, S), "full")
  assert.equal(Model.phase(dev(0.8, S.PendingCharge), false, S), "holding")
  assert.equal(Model.phase(dev(0.8, S.FullyCharged), false, S), "holding")
  assert.equal(Model.phase(dev(0.8, S.Charging, { changeRate: 0.1 }), false, S), "holding")
  assert.equal(Model.phase(dev(0.8, S.Charging, { timeToFull: 9 * 3600 }), false, S), "holding")
})

test("glyph follows level and phase", () => {
  assert.equal(Model.glyph({ isPresent: false }, false, S), "󱉝")
  assert.equal(Model.glyph(dev(0.05, S.Discharging), true, S), "󰁺")
  assert.equal(Model.glyph(dev(0.55, S.Discharging), true, S), "󰁿")
  assert.equal(Model.glyph(dev(0.55, S.Charging), false, S), "󰂉")
  assert.equal(Model.glyph(dev(1, S.FullyCharged), false, S), "󰂅")
  assert.equal(Model.glyph(dev(0.8, S.PendingCharge), false, S), "󰂂")
})

test("isLow only fires on battery at or under the clamped threshold", () => {
  assert.equal(Model.isLow(dev(0.15, S.Discharging), true, 15), true)
  assert.equal(Model.isLow(dev(0.16, S.Discharging), true, 15), false)
  assert.equal(Model.isLow(dev(0.05, S.Charging), false, 15), false)
  assert.equal(Model.isLow(dev(0.04, S.Discharging), true, 1), true)
  assert.equal(Model.clampLow(1), 5)
  assert.equal(Model.clampLow(80), 50)
  assert.equal(Model.clampLow("x"), 15)
})

test("durations, rates and the time line", () => {
  assert.equal(Model.formatDuration(0), "")
  assert.equal(Model.formatDuration(1500), "25m")
  assert.equal(Model.formatDuration(3600), "1h")
  assert.equal(Model.formatDuration(3960), "1h 6m")
  assert.equal(Model.formatRate(42.8), "43 W")
  assert.equal(Model.formatRate(-7.25), "7.3 W")
  assert.equal(Model.formatRate(0), "")
  assert.equal(Model.timeLine(dev(0.4, S.Discharging), true, S), "2h left")
  assert.equal(Model.timeLine(dev(0.4, S.Charging), false, S), "1h to full")
  assert.equal(Model.timeLine(dev(1, S.FullyCharged), false, S), "")
})

test("tooltip summarises state and the thermal profile", () => {
  assert.equal(Model.tooltip({ isPresent: false }, false, S, ""), "No battery")
  assert.equal(Model.tooltip(dev(0.384, S.Charging), false, S, ""), "38% · Charging · 40 W · 1h to full")
  assert.equal(Model.tooltip(dev(1, S.FullyCharged), false, S, "quiet"), "100% · Fully charged\nThermal profile: Quiet")
})

test("parseKeyValue reads omarchy-battery-status --shell", () => {
  assert.deepEqual(Model.parseKeyValue("percentage\t38%\nsize\t72Wh\n\njunk\n"), { percentage: "38%", size: "72Wh" })
  assert.deepEqual(Model.parseKeyValue(undefined), {})
})

test("parseProfile reads alienwarectl status and orders the choices", () => {
  const out = Model.parseProfile(JSON.stringify({ ok: true, profile: { current: "quiet", choices: ["performance", "quiet", "balanced"], writable: true } }))
  assert.deepEqual(out, { available: true, current: "quiet", choices: ["quiet", "balanced", "performance"], writable: true, gmodeForced: false })
  assert.equal(Model.parseProfile("").available, false)
  assert.equal(Model.parseProfile("not json").available, false)
  assert.equal(Model.parseProfile(JSON.stringify({ ok: false, error: "no-daemon" })).available, false)
  assert.equal(Model.parseProfile(JSON.stringify({ ok: true, status: { profile: { current: "balanced", choices: [] } } })).current, "balanced")
})

test("profile labels, glyphs and cycling", () => {
  assert.equal(Model.profileLabel("performance", true), "G-Mode")
  assert.equal(Model.profileLabel("balanced-performance"), "Balanced perf")
  assert.equal(Model.profileLabel("my-thing"), "My thing")
  assert.equal(Model.profileGlyph("quiet"), "󰤄")
  assert.equal(Model.nextProfile(["quiet", "balanced", "performance"], "performance", 1), "quiet")
  assert.equal(Model.nextProfile(["quiet", "balanced"], "quiet", -1), "balanced")
  assert.equal(Model.nextProfile(["quiet"], "gone", 1), "quiet")
  assert.equal(Model.nextProfile([], "quiet", 1), "")
  assert.deepEqual(Model.cmdProfile("quiet"), ["alienwarectl", "profile", "quiet"])
})
