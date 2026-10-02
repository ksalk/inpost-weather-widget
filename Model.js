// Parsing and formatting helpers for the InPost air quality bar widget.
//
// The InPost endpoint we poll is
//
//   https://inpost.pl/shipx-point-data/<pointId>/<pointName>/air_index_level
//
// and answers JSON shaped like
//
//   {"message": "Data source: Drupal point_entity_field_data table",
//    "air_index_level": "VERY_GOOD",
//    "air_sensors": ["PM1:5.5861467369042:",
//                    "PM25:7.957341244281:31.829364977124",
//                    "TEMPERATURE:18.654333333333:",
//                    "HUMIDITY:73.086889166667:",
//                    "PRESSURE:1020.2110833333:"]}
//
// air_sensors entries are "NAME:value[:norm]" — the value is what we display,
// any third field (the daily norm for PM sensors) is ignored. The only header
// the endpoint requires is "x-requested-with: XMLHttpRequest".

// Known air_index_level values → nerd-font face glyph + human text.
// The bar font (JetBrainsMono Nerd Font) carries the FontAwesome set:
// nf-fa-smile U+F118, nf-fa-frown U+F119, nf-fa-meh U+F11A.
var LEVELS = {
  VERY_GOOD: { face: "\uF118", text: "Very good" },
  GOOD: { face: "\uF118", text: "Good" },
  SATISFACTORY: { face: "\uF11A", text: "Satisfactory" },
  MODERATE: { face: "\uF11A", text: "Moderate" },
  BAD: { face: "\uF119", text: "Bad" },
  VERY_BAD: { face: "\uF119", text: "Very bad" }
}

// Shown when the level is missing or unrecognized.
var UNKNOWN_FACE = "\u2026"

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
}

function levelMeta(level) {
  var meta = LEVELS[trimmed(level).toUpperCase()]
  return meta || null
}

function faceFor(state) {
  if (!state) return UNKNOWN_FACE
  var meta = levelMeta(state.level)
  return meta ? meta.face : UNKNOWN_FACE
}

function round1(value) {
  var n = Number(value)
  if (!isFinite(n)) return ""
  return (Math.round(n * 10) / 10).toFixed(1)
}

// The fetch runs through
//   curl -sS --max-time 10 -H x-requested-with: XMLHttpRequest -w '\n%{http_code}' <url>
// so the collected stdout is the response body with the HTTP status code
// appended on its own final line. splitResponse separates the two.
function splitResponse(raw) {
  var text = String(raw === undefined || raw === null ? "" : raw)
  var code = 0
  var idx = text.lastIndexOf("\n")
  if (idx !== -1) {
    var tail = trimmed(text.slice(idx + 1))
    if (/^\d{3}$/.test(tail)) {
      code = parseInt(tail, 10)
      text = text.slice(0, idx)
    }
  }
  return { code: code, body: text }
}

// Parse a response body into
//   { level: "VERY_GOOD", sensors: { TEMPERATURE: 18.65, ... }, message: "" }
// The message is InPost's explanation string — on error bodies like
// {"message":"Air sensors are not available."} it is the only content, and
// the caller decides what an unusable reading means. Returns null only when
// the body is not JSON at all (redirect HTML, empty, garbage).
function parseResponse(raw) {
  var data
  try {
    data = JSON.parse(String(raw === undefined || raw === null ? "" : raw))
  } catch (e) {
    return null
  }
  if (!data || typeof data !== "object") return null

  var sensors = {}
  var list = Array.isArray(data.air_sensors) ? data.air_sensors : []
  for (var i = 0; i < list.length; i++) {
    var parts = String(list[i] === undefined || list[i] === null ? "" : list[i]).split(":")
    var name = trimmed(parts[0]).toUpperCase()
    var value = parseFloat(parts[1])
    if (name && !isNaN(value)) sensors[name] = value
  }

  return {
    level: trimmed(data.air_index_level).toUpperCase(),
    sensors: sensors,
    message: trimmed(data.message)
  }
}

function hasReadings(sensors) {
  for (var name in sensors) return true
  return false
}

// The bar pill: temperature, pressure, humidity, then face + level text.
// Missing parts are skipped; with nothing at all it is just the unknown face.
function pill(state) {
  if (!state) return UNKNOWN_FACE
  var parts = []
  var sensors = state.sensors || {}
  if (isFinite(sensors.TEMPERATURE)) parts.push(round1(sensors.TEMPERATURE) + "°C")
  if (isFinite(sensors.PRESSURE)) parts.push(Math.round(sensors.PRESSURE) + " hPa")
  if (isFinite(sensors.HUMIDITY)) parts.push(Math.round(sensors.HUMIDITY) + "%")

  var meta = levelMeta(state.level)
  if (meta) parts.push(meta.face + " " + meta.text)
  else parts.push(UNKNOWN_FACE)
  return parts.join(" · ")
}

// Hover tooltip: point, level, readings with units, last update time. When
// the fetch came back with InPost's explanation instead of data ("Air sensors
// are not available.", "Point not found."), surface that message so a broken
// config and a sleeping feed are told apart. A successful response also
// carries a `message`, but that one is just provenance ("Data source: Drupal
// point_entity_field_data table") and would only be noise here.
function tooltip(state, pointName, updatedAt) {
  var out = [pointName && String(pointName) !== "" ? String(pointName) : "paczkomat"]
  if (!state) {
    out.push("no data")
  } else if (!state.level && !hasReadings(state.sensors)) {
    out.push(state.message ? "InPost: " + state.message : "no data")
  } else {
    var meta = levelMeta(state.level)
    out.push(meta ? meta.text : "air level unknown")
    var sensors = state.sensors || {}
    var readings = []
    if (isFinite(sensors.TEMPERATURE)) readings.push(round1(sensors.TEMPERATURE) + "°C")
    if (isFinite(sensors.PRESSURE)) readings.push(Math.round(sensors.PRESSURE) + " hPa")
    if (isFinite(sensors.HUMIDITY)) readings.push(Math.round(sensors.HUMIDITY) + "%")
    if (isFinite(sensors.PM25)) readings.push("PM2.5 " + round1(sensors.PM25) + " µg/m³")
    if (isFinite(sensors.PM10)) readings.push("PM10 " + round1(sensors.PM10) + " µg/m³")
    if (readings.length) out.push(readings.join(", "))
  }
  if (updatedAt) out.push("updated " + updatedAt)
  return out.join(" · ")
}

if (typeof module !== "undefined") {
  module.exports = {
    LEVELS: LEVELS,
    UNKNOWN_FACE: UNKNOWN_FACE,
    levelMeta: levelMeta,
    faceFor: faceFor,
    round1: round1,
    splitResponse: splitResponse,
    parseResponse: parseResponse,
    hasReadings: hasReadings,
    pill: pill,
    tooltip: tooltip
  }
}
