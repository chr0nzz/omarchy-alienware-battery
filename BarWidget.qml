import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.UPower
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "xyzlab.alienware-battery"

  readonly property var device: Model.snapshot(UPower.displayDevice)
  readonly property bool present: device.isPresent === true
  readonly property bool onBattery: present && UPower.onBattery
  readonly property var states: ({
    Charging: UPowerDeviceState.Charging,
    Discharging: UPowerDeviceState.Discharging,
    FullyCharged: UPowerDeviceState.FullyCharged,
    PendingCharge: UPowerDeviceState.PendingCharge
  })

  readonly property bool showPercentage: Model.boolOr(setting("showPercentage", false), false)
  readonly property int lowBattery: Model.clampLow(setting("lowBattery", Model.LOW_DEFAULT))
  readonly property bool showProfiles: Model.boolOr(setting("showProfiles", true), true)

  readonly property string phase: Model.phase(device, onBattery, states)
  readonly property bool low: Model.isLow(device, onBattery, lowBattery)
  readonly property string glyph: Model.glyph(device, onBattery, states)
  readonly property string percentText: showPercentage ? Model.percentText(device) : ""

  property var profile: Model.parseProfile("")
  property bool panelWantsFastPoll: false
  readonly property bool profilesUsable: showProfiles && profile.available

  function refreshProfile() {
    if (!showProfiles || statusProc.running) return
    statusProc.running = true
  }

  function setProfile(name) {
    if (!profilesUsable || !profile.writable || !name || setProc.running) return
    setProc.command = Model.cmdProfile(name)
    setProc.running = true
  }

  function cycleProfile(direction) {
    setProfile(Model.nextProfile(profile.choices, profile.current, direction))
  }

  function togglePercentage() {
    var next = {}
    for (var k in settings) if (k !== "id") next[k] = settings[k]
    next.showPercentage = !showPercentage
    settings = next
    if (bar && bar.shell && typeof bar.shell.updateEntryInline === "function")
      bar.shell.updateEntryInline(moduleName, next)
  }

  Process {
    id: statusProc
    command: Model.cmdStatus()
    stdout: StdioCollector { id: statusOut; waitForEnd: true }
    onExited: root.profile = Model.parseProfile(statusOut.text)
  }

  Process {
    id: setProc
    onExited: root.refreshProfile()
  }

  Timer {
    interval: root.panelWantsFastPoll ? 3000 : 20000
    running: root.showProfiles
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refreshProfile()
  }

  onShowProfilesChanged: if (!showProfiles) profile = Model.parseProfile("")

  readonly property color glyphColor: {
    if (low) return bar ? bar.urgent : Color.urgent
    return button.foreground
  }

  readonly property string tooltip: {
    var lines = [Model.tooltip(device, onBattery, states, profilesUsable ? profile.current : "")]
    lines.push(profilesUsable
      ? "Left click details · right click percentage · middle click profile"
      : "Left click details · right click percentage")
    return lines.join("\n")
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  visible: present
  implicitWidth: present ? button.implicitWidth : 0
  implicitHeight: present ? button.implicitHeight : 0

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onPresentChanged: if (!present) close()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    tooltipText: root.tooltip
    readonly property bool textVisible: root.percentText !== ""
    horizontalMargin: textVisible && !root.vertical ? 6 : 0
    fixedWidth: root.vertical ? -1 : (textVisible ? content.implicitWidth + Style.spaceReal(12) : Style.bar.iconSlot)
    fixedHeight: root.vertical ? (textVisible ? content.implicitHeight + Style.spaceReal(10) : Style.bar.iconSlot) : -1

    onPressed: function(b) {
      if (b === Qt.RightButton) root.togglePercentage()
      else if (b === Qt.MiddleButton) root.cycleProfile(1)
      else root.togglePanel()
    }

    Grid {
      id: content
      anchors.centerIn: parent
      columns: root.vertical ? 1 : 2
      rows: root.vertical ? 2 : 1
      columnSpacing: Style.space(4)
      rowSpacing: Style.space(1)
      horizontalItemAlignment: Grid.AlignHCenter
      verticalItemAlignment: Grid.AlignVCenter

      Text {
        textFormat: Text.PlainText
        text: root.glyph
        color: root.glyphColor
        font.family: button.fontFamily
        font.pixelSize: Style.bar.iconFont
        renderType: Text.NativeRendering
        Behavior on color { ColorAnimation { duration: 160 } }
      }

      Text {
        visible: button.textVisible
        textFormat: Text.PlainText
        text: root.vertical ? root.percentText.replace("%", "") : root.percentText
        color: root.glyphColor
        font.family: button.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: root.low
        renderType: Text.NativeRendering
        Behavior on color { ColorAnimation { duration: 160 } }
      }
    }
  }
}
