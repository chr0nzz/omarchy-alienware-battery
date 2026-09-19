import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "xyzlab.alienware-battery"
  ipcTarget: ""
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool openedFromHotkey: false
  property var info: ({})
  property int profileCursor: -1
  readonly property var barIdentity: hostWidget || root

  readonly property color fg: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.4)
  readonly property color urgentColor: bar ? bar.urgent : Color.urgent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property var w: hostWidget
  readonly property var device: w ? w.device : ({ isPresent: false })
  readonly property bool onBattery: w ? w.onBattery : false
  readonly property var states: w ? w.states : ({})
  readonly property string phase: w ? w.phase : "missing"
  readonly property bool low: w ? w.low : false
  readonly property real fraction: Model.fraction(device)
  readonly property bool flowing: phase === "charging" || phase === "discharging"
  readonly property var profile: w ? w.profile : Model.parseProfile("")
  readonly property bool profilesShown: w ? w.profilesUsable : false
  readonly property var profiles: profile.choices

  function open() {
    openedFromHotkey = false
    root.controller.show()
    onOpened()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    onOpened()
  }

  function onOpened() {
    profileCursor = -1
    refresh()
    if (w) w.refreshProfile()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function refresh() {
    if (device.isPresent !== true || infoProc.running) return
    infoProc.running = true
  }

  function applyInfo(text) {
    var next = Model.parseKeyValue(text)
    // Keep the last good read: the script briefly returns nothing around an
    // AC plug or unplug, and the stats should not blink out.
    if (Object.keys(next).length > 0) info = next
  }

  function moveProfileCursor(delta) {
    if (!profilesShown || !profiles.length) return
    if (profileCursor < 0) {
      var idx = profiles.indexOf(profile.current)
      profileCursor = idx >= 0 ? idx : 0
      return
    }
    profileCursor = Math.max(0, Math.min(profiles.length - 1, profileCursor + delta))
  }

  function activateProfileCursor() {
    if (!w || profileCursor < 0 || profileCursor >= profiles.length) return
    w.setProfile(profiles[profileCursor])
  }

  onOpenedChanged: if (w) w.panelWantsFastPoll = opened

  Process {
    id: infoProc
    command: ["omarchy-battery-status", "--shell"]
    stdout: StdioCollector { waitForEnd: true; onStreamFinished: root.applyInfo(text) }
  }

  Timer { interval: 5000; running: root.opened; repeat: true; onTriggered: root.refresh() }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened && root.device.isPresent === true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveProfileCursor(dx !== 0 ? dx : dy) }
      onActivateRequested: root.activateProfileCursor()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(14)

        Item {
          width: parent.width
          implicitHeight: Math.max(heroIcon.implicitHeight, heroLabels.implicitHeight, heroPercent.implicitHeight)

          Text {
            id: heroIcon
            textFormat: Text.PlainText
            text: root.w ? root.w.glyph : ""
            color: root.low ? root.urgentColor : root.fg
            font.family: root.fontFamily
            font.pixelSize: Style.font.display
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            Behavior on color { ColorAnimation { duration: 200 } }
          }

          Column {
            id: heroLabels
            anchors.left: heroIcon.right
            anchors.leftMargin: Style.space(14)
            anchors.right: heroPercent.left
            anchors.rightMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              text: "Battery"
              color: root.fg
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
              width: parent.width
            }

            Text {
              textFormat: Text.PlainText
              text: {
                var parts = [Model.phaseLabel(root.phase)]
                var time = Model.timeLine(root.device, root.onBattery, root.states)
                if (time) parts.push(time)
                return parts.join(" · ").toUpperCase()
              }
              color: root.low ? root.urgentColor : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1.2
              elide: Text.ElideRight
              width: parent.width
            }
          }

          Text {
            id: heroPercent
            textFormat: Text.PlainText
            text: Model.percentText(root.device) || "-"
            color: root.low ? root.urgentColor : root.fg
            font.family: root.fontFamily
            font.pixelSize: Style.font.displayLarge
            font.bold: true
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
          }
        }

        Item {
          width: parent.width
          implicitHeight: Style.space(8)

          Rectangle {
            id: track
            anchors.fill: parent
            radius: height / 2
            color: Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.12)
          }

          Rectangle {
            anchors.left: track.left
            anchors.verticalCenter: track.verticalCenter
            height: track.height
            radius: track.radius
            color: root.low ? root.urgentColor : root.fg
            width: Math.max(track.height, track.width * root.fraction)
            Behavior on width { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }

            SequentialAnimation on opacity {
              running: root.phase === "charging" && root.opened
              loops: Animation.Infinite
              alwaysRunToEnd: true
              NumberAnimation { from: 1.0; to: 0.55; duration: 950; easing.type: Easing.InOutSine }
              NumberAnimation { from: 0.55; to: 1.0; duration: 950; easing.type: Easing.InOutSine }
            }
          }

          Rectangle {
            // Where the lowBattery warning starts, so the bar reads against it.
            visible: root.w !== null
            x: track.width * (root.w ? root.w.lowBattery : 15) / 100 - width / 2
            anchors.verticalCenter: track.verticalCenter
            width: 2
            height: track.height + Style.space(4)
            radius: 1
            color: root.urgentColor
            opacity: 0.6
          }
        }

        Grid {
          width: parent.width
          columns: 2
          columnSpacing: Style.space(20)
          rowSpacing: Style.spacing.labelGap

          readonly property real cell: (width - columnSpacing) / 2

          InfoPair {
            width: parent.cell
            label: root.phase === "charging" ? "Charging at" : "Draw"
            value: root.flowing ? (Model.formatRate(root.device.changeRate) || root.info.rate || "-") : "-"
          }
          InfoPair {
            width: parent.cell
            label: root.phase === "holding" ? "Charge limit" : (root.onBattery ? "Time left" : "Time to full")
            value: {
              if (root.phase === "holding") return root.info.threshold || "-"
              if (!root.flowing) return "-"
              var t = Model.formatDuration(root.onBattery ? root.device.timeToEmpty : root.device.timeToFull)
              return t || root.info.time || "-"
            }
          }
          InfoPair { width: parent.cell; label: "Battery size"; value: root.info.size || "-" }
          InfoPair { width: parent.cell; label: "Charge cycles"; value: root.info.cycles || "-" }
        }

        PanelSeparator {
          visible: root.profilesShown
          foreground: root.fg
        }

        Column {
          visible: root.profilesShown
          width: parent.width
          spacing: Style.space(10)

          PanelSectionHeader {
            text: "THERMAL PROFILE"
            foreground: root.fg
            fontFamily: root.fontFamily
          }

          Flow {
            width: parent.width
            spacing: Style.space(4)

            Repeater {
              model: root.profiles

              Button {
                required property var modelData
                required property int index
                text: Model.profileLabel(modelData, root.profile.gmodeForced)
                iconText: Model.profileGlyph(modelData)
                selected: root.profile.current === modelData
                hasCursor: root.profileCursor === index
                enabled: root.profile.writable
                bordered: true
                foreground: root.fg
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                onClicked: if (root.w) root.w.setProfile(modelData)
                onHovered: function(h) { if (h) root.profileCursor = index }
              }
            }
          }

          Text {
            visible: !root.profile.writable
            width: parent.width
            wrapMode: Text.Wrap
            text: "The thermal profile is read only right now"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }
    }
  }

  component InfoPair: Row {
    property string label: ""
    property string value: ""
    spacing: Style.space(8)

    Text {
      id: labelText
      textFormat: Text.PlainText
      text: parent.label
      color: root.fg
      opacity: 0.6
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
    Item {
      width: Math.max(0, parent.width - labelText.implicitWidth - valueText.implicitWidth - parent.spacing * 2)
      height: 1
    }
    Text {
      id: valueText
      textFormat: Text.PlainText
      text: parent.value
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }
}
