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
  readonly property color accent: Color.accent
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
    contentWidth: panel.fittedContentWidth(Style.space(460))
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

        Card {
          CardTitle {
            title: "CHARGE"
            detail: Model.phaseLabel(root.phase)
            detailColor: root.low ? root.urgentColor : root.dim
          }

          Item {
            width: parent.width
            implicitHeight: Style.space(10)

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

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: "Warns at " + (root.w ? root.w.lowBattery : 15) + "% on battery"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }

        Grid {
          id: statGrid
          width: parent.width
          columns: 4
          columnSpacing: Style.space(8)
          rowSpacing: Style.space(8)
          readonly property real cell: (width - columnSpacing * (columns - 1)) / columns

          StatTile {
            width: statGrid.cell
            icon: root.phase === "charging" ? "󰚥" : "󱐋"
            label: root.phase === "charging" ? "Charging" : "Draw"
            value: root.flowing ? (Model.formatRate(root.device.changeRate) || root.info.rate || "-") : "-"
          }
          StatTile {
            width: statGrid.cell
            icon: "󰔟"
            label: root.phase === "holding" ? "Limit" : (root.onBattery ? "Left" : "To full")
            value: {
              if (root.phase === "holding") return root.info.threshold || "-"
              if (!root.flowing) return "-"
              var t = Model.formatDuration(root.onBattery ? root.device.timeToEmpty : root.device.timeToFull)
              return t || root.info.time || "-"
            }
          }
          StatTile {
            width: statGrid.cell
            icon: "󰁹"
            label: "Size"
            value: root.info.size || "-"
          }
          StatTile {
            width: statGrid.cell
            icon: "󰑓"
            label: "Cycles"
            value: root.info.cycles || "-"
          }
        }

        Card {
          visible: root.profilesShown

          CardTitle {
            title: "THERMAL MODE"
            detail: root.profile.current ? Model.profileLabel(root.profile.current, root.profile.gmodeForced) : ""
          }

          Row {
            id: modeRow
            width: parent.width
            spacing: Style.space(4)
            readonly property real cell: root.profiles.length ? (width - spacing * (root.profiles.length - 1)) / root.profiles.length : width

            Repeater {
              model: root.profiles

              Rectangle {
                id: modeTile
                required property var modelData
                required property int index
                readonly property bool current: root.profile.current === modelData
                readonly property bool usable: root.profile.writable
                width: modeRow.cell
                height: modeCol.implicitHeight + Style.space(14)
                radius: Math.max(Style.cornerRadius, Style.space(3))
                color: current ? Util.alpha(root.accent, 0.22) : ((modeMouse.containsMouse || root.profileCursor === index) && usable ? Style.hoverFillFor(root.fg, root.accent) : "transparent")
                border.width: current ? Math.max(2, Style.normalBorderWidth * 2) : Style.normalBorderWidth
                border.color: current ? root.accent : (root.profileCursor === index ? root.fg : Util.alpha(root.fg, 0.18))
                opacity: usable ? 1.0 : 0.5
                Behavior on color { ColorAnimation { duration: 140 } }

                Column {
                  id: modeCol
                  anchors.centerIn: parent
                  width: parent.width - Style.space(6)
                  spacing: Style.space(3)

                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: Model.profileGlyph(modeTile.modelData)
                    color: modeTile.current ? root.accent : root.fg
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.title
                  }

                  Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    textFormat: Text.PlainText
                    text: Model.profileLabel(modeTile.modelData, root.profile.gmodeForced)
                    color: modeTile.current ? root.fg : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: modeTile.current
                    elide: Text.ElideRight
                  }
                }

                MouseArea {
                  id: modeMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  enabled: modeTile.usable
                  cursorShape: Qt.PointingHandCursor
                  onClicked: if (root.w) root.w.setProfile(modeTile.modelData)
                }
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

  component Card: Rectangle {
    id: card
    default property alias content: cardBody.data
    width: parent ? parent.width : 0
    implicitHeight: cardBody.implicitHeight + Style.space(24)
    radius: Math.max(Style.cornerRadius, Style.space(4))
    color: Style.normalFillFor(root.fg, root.accent)
    border.color: Util.alpha(root.fg, 0.15)
    border.width: Style.normalBorderWidth

    Column {
      id: cardBody
      x: Style.space(12)
      y: Style.space(12)
      width: card.width - Style.space(24)
      spacing: Style.space(10)
    }
  }

  component CardTitle: Row {
    id: ct
    property string title: ""
    property string detail: ""
    property color detailColor: root.dim
    spacing: Style.space(8)

    Text {
      textFormat: Text.PlainText
      text: ct.title
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
      font.letterSpacing: 1.4
    }

    Text {
      visible: ct.detail !== ""
      textFormat: Text.PlainText
      text: "· " + ct.detail
      color: ct.detailColor
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  component StatTile: Rectangle {
    id: tile
    property string icon: ""
    property string label: ""
    property string value: ""
    implicitHeight: tileCol.implicitHeight + Style.space(20)
    radius: Math.max(Style.cornerRadius, Style.space(4))
    color: Style.normalFillFor(root.fg, root.accent)
    border.color: Util.alpha(root.fg, 0.15)
    border.width: Style.normalBorderWidth

    Column {
      id: tileCol
      x: Style.space(10)
      y: Style.space(10)
      width: tile.width - Style.space(20)
      spacing: Style.space(4)

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: tile.icon + "  " + tile.label.toUpperCase()
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        font.letterSpacing: 1.1
        elide: Text.ElideRight
      }

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: tile.value
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.title
        font.bold: true
        elide: Text.ElideRight
      }
    }
  }
}
