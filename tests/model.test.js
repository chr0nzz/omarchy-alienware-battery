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

const MONITORS = JSON.stringify([
  { name: "eDP-2", width: 2560, height: 1440, refreshRate: 240.002, x: 0, y: 0, scale: 1.6, availableModes: ["2560x1440@240.00Hz", "2560x1440@60.00Hz"] },
  { name: "HDMI-A-1", width: 1920, height: 1080, refreshRate: 60, x: 2560, y: 0, scale: 1, availableModes: ["1920x1080@60.00Hz"] }
])

test("refreshTarget picks the rate for the power source", () => {
  assert.equal(Model.refreshTarget(true, 60, 240), 60)
  assert.equal(Model.refreshTarget(false, 60, 240), 240)
  assert.equal(Model.refreshTarget(true, 0, 240), 0)
  assert.equal(Model.clampHz(10), 30)
  assert.equal(Model.clampHz("x"), 0)
})

test("parseMonitors reads hyprctl output and finds the internal panel", () => {
  const list = Model.parseMonitors(MONITORS)
  assert.equal(list.length, 2)
  assert.deepEqual(Model.internalMonitors(list).map(m => m.name), ["eDP-2"])
  assert.deepEqual(Model.parseMonitors("not json"), [])
  const external = Model.parseMonitors(JSON.stringify([{ name: "HDMI-A-1", width: 1920, height: 1080, availableModes: [] }]))
  assert.deepEqual(Model.internalMonitors(external).map(m => m.name), ["HDMI-A-1"])
})

test("a plan only touches a panel that supports the rate and is not already there", () => {
  const list = Model.parseMonitors(MONITORS)
  const toBattery = Model.refreshPlan(list, true, 60, 240)
  assert.equal(toBattery.length, 1)
  assert.deepEqual(toBattery[0].argv, ["hyprctl", "eval", 'hl.monitor({ output = "eDP-2", mode = "2560x1440@60", position = "0x0", scale = 1.6 })'])
  assert.deepEqual(Model.refreshPlan(list, false, 60, 240), [])
  assert.deepEqual(Model.refreshPlan(list, true, 0, 0), [])
  assert.deepEqual(Model.refreshPlan(list, true, 144, 240), [])
})

test("monitorArgs refuses names and values that could escape the Lua source", () => {
  const panel = Model.parseMonitors(MONITORS)[0]
  const hostile = ['eDP-1", scale = 1 }) os.execute("id") --', "eDP-1\\", "eDP 1", "eDP-1\n", "", "-eDP", "e".repeat(65)]
  for (const name of hostile) {
    assert.deepEqual(Model.monitorArgs(Object.assign({}, panel, { name }), 60), [])
  }
  assert.deepEqual(Model.monitorArgs(Object.assign({}, panel, { scale: Infinity }), 60), [])
  assert.deepEqual(Model.monitorArgs(Object.assign({}, panel, { x: 1.5 }), 60), [])
  assert.deepEqual(Model.monitorArgs(Object.assign({}, panel, { width: "2560" }), 60), [])
  assert.deepEqual(Model.monitorArgs(Object.assign({}, panel, { name: "HEADLESS-2", x: -1920 }), 60), ["hyprctl", "eval", 'hl.monitor({ output = "HEADLESS-2", mode = "2560x1440@60", position = "-1920x0", scale = 1.6 })'])
  const evil = JSON.stringify([{ name: 'eDP-1"})os.execute("id")--', width: 2560, height: 1440, refreshRate: 240, x: 0, y: 0, scale: 1, availableModes: ["2560x1440@60.00Hz"] }])
  assert.deepEqual(Model.refreshPlan(Model.parseMonitors(evil), true, 60, 240), [])
})

test("lowPowerPlan drops to low power on battery and restores what was there", () => {
  assert.deepEqual(Model.lowPowerPlan(true, true, "balanced", ""), { profile: "low-power", remember: "balanced" })
  assert.deepEqual(Model.lowPowerPlan(true, true, "low-power", "balanced"), { profile: "", remember: "balanced" })
  assert.deepEqual(Model.lowPowerPlan(false, true, "low-power", "balanced"), { profile: "balanced", remember: "" })
  assert.deepEqual(Model.lowPowerPlan(false, true, "quiet", ""), { profile: "", remember: "" })
  assert.deepEqual(Model.lowPowerPlan(true, false, "balanced", ""), { profile: "", remember: "" })
})

test("the low warning fires once per discharge below the threshold", () => {
  const low = { isPresent: true, percentage: 0.12, state: 2 }
  const ok = { isPresent: true, percentage: 0.5, state: 2 }
  assert.equal(Model.lowWarningDue(low, true, 15, true), true)
  assert.equal(Model.lowWarningDue(low, true, 15, false), false)
  assert.equal(Model.lowWarningDue(low, false, 15, true), false)
  assert.equal(Model.lowWarningArmed(low, true, 15, true), false)
  assert.equal(Model.lowWarningArmed(ok, true, 15, false), false)
  assert.equal(Model.lowWarningArmed(ok, true, 15, true), true)
  assert.equal(Model.lowWarningArmed(low, false, 15, false), true)
  assert.deepEqual(Model.cmdLowWarning(low), ["omarchy-battery-low", "12"])
})
