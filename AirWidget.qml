import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "inpost.air"

  // Which paczkomat to watch — set in this widget's bar layout entry in
  // shell.json (required; find both values via the locker page's
  // data-shipx-url attribute, see README):
  //   { "id": "inpost.air", "pointId": "12345", "pointName": "XYZ12AB" }
  // pointId is the numeric id and is the value the API actually matches on;
  // pointName is display-only (the endpoint ignores it).
  readonly property string pointId: String(root.setting("pointId", ""))
  readonly property string pointName: String(root.setting("pointName", ""))
  // Hourly by default; clamped so nobody can hammer the endpoint by accident.
  readonly property int refreshMs: Math.max(60000, Number(root.setting("refreshMs", 3600000)) || 3600000)

  readonly property string url: "https://inpost.pl/shipx-point-data/"
    + encodeURIComponent(pointId) + "/" + encodeURIComponent(pointName || pointId) + "/air_index_level"

  // Last-good parsed response, kept across failed fetches so the pill never
  // blanks out over a transient network error. Named `readings` — `state` is
  // already a QQuickItem property.
  property var readings: null
  property string updatedAt: ""
  property bool fetchFailed: false

  readonly property string pillText: Model.pill(readings)
  readonly property string tooltip: Model.tooltip(readings, pointName || pointId, updatedAt)
    + (fetchFailed ? " · fetch failed" : "")

  // No pointId configured — nothing to fetch, stay out of the bar.
  visible: root.pointId !== ""

  function refresh() {
    if (!pointId) return
    if (fetchProc.running) return
    fetchedThisRun = false
    fetchProc.command = ["curl", "-fsS", "--max-time", "10",
      "-H", "x-requested-with: XMLHttpRequest", root.url]
    fetchProc.running = true
  }

  // Left click: details as a notification. Middle/right: refetch.
  function notify() {
    if (!root.bar) return
    var quoted = "'" + String(root.tooltip).replace(/'/g, "'\\''") + "'"
    root.bar.run("omarchy-notification-send " + quoted)
  }

  onPointIdChanged: Qt.callLater(root.refresh)
  onPointNameChanged: Qt.callLater(root.refresh)

  IpcHandler {
    target: "inpost.air"

    function refresh(): void {
      root.broadcast("refresh")
    }
  }

  // True once this run's stdout parsed into usable data. Checked on exit:
  // curl -f only fails on HTTP >= 400, so a 302 redirect body (exit 0) has
  // to be caught here as well.
  property bool fetchedThisRun: false

  Process {
    id: fetchProc

    stdout: StdioCollector {
      waitForEnd: true

      onStreamFinished: {
        var parsed = Model.parseResponse(text)
        if (parsed) {
          root.readings = parsed
          root.updatedAt = Qt.formatDateTime(new Date(), "HH:mm")
          root.fetchFailed = false
          root.retries = 0
          root.fetchedThisRun = true
        }
      }
    }

    onExited: function(exitCode) {
      if (exitCode !== 0 || !root.fetchedThisRun) root.scheduleRetry()
    }
  }

  property int retries: 0

  function scheduleRetry() {
    root.fetchFailed = true
    // A point that does not exist (404) will not exist on retry either; the
    // backoff only helps transient failures, and the hourly timer catches
    // everything else.
    if (root.retries >= 3) return
    root.retries++
    retryTimer.restart()
  }

  Timer {
    id: retryTimer
    interval: 2500
    onTriggered: root.refresh()
  }

  Timer {
    interval: root.refreshMs
    running: root.pointId !== ""
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Horizontally: a text label in a padded slot (clock-widget pattern).
  // Vertically: just the face glyph, icon-sized.
  readonly property string verticalGlyph: Model.faceFor(readings)

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.vertical ? "" : root.pillText
    labelVisible: !root.vertical
    hasVisualContent: root.vertical ? root.verticalGlyph !== "" : root.pillText !== ""
    tooltipText: root.tooltip

    onPressed: function(b) {
      if (b === Qt.LeftButton) root.notify()
      else root.broadcast("refresh")
    }

    OpticalGlyph {
      visible: root.vertical
      anchors.centerIn: parent
      text: root.verticalGlyph
      fontFamily: button.fontFamily
      fontSize: Style.bar.iconFont
      color: button.foreground
    }
  }
}
