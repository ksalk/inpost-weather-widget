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

// Parse a raw fetch response into
//   { level: "VERY_GOOD", sensors: { TEMPERATURE: 18.65, ... } }
// or null when nothing usable arrived (404 HTML, malformed JSON, an empty
// sensor list and no level). A missing level with usable sensors still
// parses — the pill then shows the readings with an unknown-state face.
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

  var level = trimmed(data.air_index_level).toUpperCase()
  if (!level && !hasReadings(sensors)) return null

  return { level: level, sensors: sensors }
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

// Hover tooltip: point, level, readings with units, last update time.
function tooltip(state, pointName, updatedAt) {
  var out = [pointName && String(pointName) !== "" ? String(pointName) : "paczkomat"]
  if (!state) {
    out.push("no data")
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
    parseResponse: parseResponse,
    hasReadings: hasReadings,
    pill: pill,
    tooltip: tooltip
  }
}
