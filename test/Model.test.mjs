import { createRequire } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"

const require = createRequire(import.meta.url)
const Model = require("../Model.js")

const SAMPLE = JSON.stringify({
  message: "Data source: Drupal point_entity_field_data table",
  air_index_level: "VERY_GOOD",
  air_sensors: [
    "PM1:5.5861467369042:",
    "PM25:7.957341244281:31.829364977124",
    "PM4:8.3552031817966:",
    "PM10:10.666088590753:21.332177181506",
    "TEMPERATURE:18.654333333333:",
    "HUMIDITY:73.086889166667:",
    "PRESSURE:1020.2110833333:"
  ]
})

test("parseResponse reads level and sensors", () => {
  const state = Model.parseResponse(SAMPLE)
  assert.equal(state.level, "VERY_GOOD")
  assert.equal(state.sensors.TEMPERATURE, 18.654333333333)
  assert.equal(state.sensors.PRESSURE, 1020.2110833333)
  assert.equal(state.sensors.HUMIDITY, 73.086889166667)
  assert.equal(state.sensors.PM25, 7.957341244281)
  assert.equal(state.sensors.PM10, 10.666088590753)
})

test("parseResponse returns null on unusable payloads", () => {
  assert.equal(Model.parseResponse(""), null)
  assert.equal(Model.parseResponse("<html>redirect</html>"), null)
  assert.equal(Model.parseResponse('{"message":"Point not found."}'), null)
  assert.equal(Model.parseResponse('{"air_index_level":null,"air_sensors":[""]}'), null)
})

test("parseResponse keeps readings when the level is missing", () => {
  const state = Model.parseResponse('{"air_index_level":null,"air_sensors":["TEMPERATURE:21.5:"]}')
  assert.equal(state.level, "")
  assert.equal(state.sensors.TEMPERATURE, 21.5)
})

test("parseResponse tolerates malformed sensor rows", () => {
  const state = Model.parseResponse('{"air_sensors":["PM25:","GARBAGE","TEMPERATURE:-3.4:"]}')
  assert.equal(state.sensors.PM25, undefined)
  assert.equal(state.sensors.GARBAGE, undefined)
  assert.equal(state.sensors.TEMPERATURE, -3.4)
})

test("levelMeta maps every known level to a face and human text", () => {
  assert.equal(Model.levelMeta("VERY_GOOD").text, "Very good")
  assert.equal(Model.levelMeta("GOOD").text, "Good")
  assert.equal(Model.levelMeta("SATISFACTORY").text, "Satisfactory")
  assert.equal(Model.levelMeta("MODERATE").text, "Moderate")
  assert.equal(Model.levelMeta("BAD").text, "Bad")
  assert.equal(Model.levelMeta("VERY_BAD").text, "Very bad")
  assert.equal(Model.levelMeta("very_bad").text, "Very bad")
  assert.equal(Model.levelMeta(" BAD "), Model.LEVELS.BAD)
  assert.equal(Model.levelMeta("NOPE"), null)
  assert.equal(Model.levelMeta(null), null)
})

test("level faces split good/neutral/bad", () => {
  assert.equal(Model.levelMeta("VERY_GOOD").face, Model.levelMeta("GOOD").face)
  assert.equal(Model.levelMeta("SATISFACTORY").face, Model.levelMeta("MODERATE").face)
  assert.equal(Model.levelMeta("BAD").face, Model.levelMeta("VERY_BAD").face)
  assert.notEqual(Model.levelMeta("VERY_GOOD").face, Model.levelMeta("MODERATE").face)
  assert.notEqual(Model.levelMeta("MODERATE").face, Model.levelMeta("VERY_BAD").face)
})

test("pill formats temperature, pressure, humidity, face and level", () => {
  const state = Model.parseResponse(SAMPLE)
  assert.equal(Model.pill(state), "18.7°C · 1020 hPa · 73% · \uF118 Very good")
})

test("pill skips missing parts and falls back to the unknown face", () => {
  assert.equal(Model.pill(null), "…")
  assert.equal(
    Model.pill({ level: "", sensors: { TEMPERATURE: -3.42 } }),
    "-3.4°C · …"
  )
})

test("tooltip composes point, level, readings and update time", () => {
  const state = Model.parseResponse(SAMPLE)
  const text = Model.tooltip(state, "XYZ12AB", "09:24")
  assert.match(text, /^XYZ12AB · Very good · /)
  assert.match(text, /18\.7°C, 1020 hPa, 73%, PM2\.5 8\.0 µg\/m³, PM10 10\.7 µg\/m³ · updated 09:24$/)
})

test("tooltip handles no-data and unnamed points", () => {
  assert.equal(Model.tooltip(null, "", "09:24"), "paczkomat · no data · updated 09:24")
  assert.equal(Model.tooltip({ level: "", sensors: {} }, "XYZ12AB", ""), "XYZ12AB · air level unknown")
})
