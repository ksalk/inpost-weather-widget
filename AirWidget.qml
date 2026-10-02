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

  // Last parsed response, kept across failed fetches so the pill never blanks
  // out over a transient network error. A response that only carries InPost's
  // explanation is kept too — see the stdout handler. Named `readings` —
  // `state` is already a QQuickItem property.
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
    outcome = outcomeTransport
    // No -f: it suppresses the body on HTTP >= 400, which is exactly the body
    // that explains *why* there are no readings. -w appends the status on its
    // own final line instead; Model.splitResponse separates the two.
    fetchProc.command = ["curl", "-sS", "--max-time", "10",
      "-H", "x-requested-with: XMLHttpRequest",
      "-w", "\\n%{http_code}", root.url]
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

  // How the last run ended. Only a transport failure is worth an immediate
  // backoff retry; when InPost answers with an explanation ("Air sensors are
  // not available.", "Point not found.") retrying would only get the same
  // answer, so we adopt that state and leave it to the refresh timer.
  readonly property string outcomeTransport: "transport"
  readonly property string outcomeAnswered: "answered"
  readonly property string outcomeOk: "ok"
  property string outcome: outcomeTransport

  Process {
    id: fetchProc

    stdout: StdioCollector {
      waitForEnd: true

      onStreamFinished: {
        // The body is the authoritative signal here, so the status that
        // splitResponse peels off is not branched on: an unreadable body is
        // either a transport failure or an error page, and both are retryable,
        // while a body we can read tells us in its own message whether a
        // retry could ever help.
        var parsed = Model.parseResponse(Model.splitResponse(text).body)
        if (!parsed) return

        // Adopt whatever came back, including a state that carries only
        // InPost's message — Model.tooltip renders that as the reason there
        // are no readings, which is what makes a misconfigured pointId
        // distinguishable from a sleeping feed.
        root.readings = parsed
        root.updatedAt = Qt.formatDateTime(new Date(), "HH:mm")

        if (Model.hasReadings(parsed.sensors)) {
          root.outcome = root.outcomeOk
          root.fetchFailed = false
          root.retries = 0
        } else {
          root.outcome = root.outcomeAnswered
          root.fetchFailed = true
        }
      }
    }

    // Only a run that produced no readable body is worth retrying. curl -sS
    // exits 0 whenever the transfer itself completed, so the exit code only
    // ever covers transport — every other outcome has already set fetchFailed.
    onExited: function() {
      if (root.outcome === root.outcomeTransport) root.scheduleRetry()
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

  // The bar sizes each slot from the widget root's implicitWidth, so a
  // BarWidget that never declares one collapses to zero width and renders
  // nothing at all. Horizontally it is a text label in a padded slot, so the
  // open-panel dot takes the label width; vertically it is a single glyph, so
  // it takes the icon-sized mark (the clock-widget pattern).
  readonly property real openPanelIndicatorWidth: button.labelWidth
  readonly property real openPanelIndicatorHeight: Math.max(Style.space(10), Math.round(Style.bar.iconSlot * 0.55))

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

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
