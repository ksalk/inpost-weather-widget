# inpost-weather-widget

An [Omarchy](https://omarchy.org) shell bar widget that shows live air quality
and weather readings from the sensors InPost mounts on its paczkomats
(parcel lockers) across Poland.

The bar pill looks like:

```
18.7°C · 1020 hPa · 73%  Very good
```

The face glyph reflects InPost's air quality index — happy for
very good/good, neutral for satisfactory/moderate, sad for bad/very bad.

The widget stays hidden until you configure which locker it should watch.

## Install

```
omarchy plugin add https://github.com/ksalk/inpost-weather-widget --enable
```

The widget is placed directly to the right of the weather pill in the center
bar section (Omarchy's default center anchor).

## Configure your locker

The widget needs a `pointId` to fetch anything; without one it stays hidden.
To find yours:

1. Open the locker's page on inpost.pl — from InPost's locker finder, pick
   your locker; the URL looks like
   `https://inpost.pl/paczkomat-<city>-<name>-<district>-paczkomaty-<region>`
2. Grab the point id and name from the page's `data-shipx-url` attribute:

   ```
   curl -s '<locker-page-url>' | grep -o 'data-shipx-url="[^"]*"'
   # data-shipx-url="/shipx-point-data/12345/XYZ12AB/air_index_level"
   ```

3. Edit the widget entry in `~/.config/omarchy/shell.json`:

   ```json
   { "id": "inpost.air", "pointId": "12345", "pointName": "XYZ12AB", "refreshMs": 3600000 }
   ```

The shell picks up the change without a restart.

| Setting | Default | Meaning |
| --- | --- | --- |
| `pointId` | none — required | Numeric paczkomat id — the value the API matches on |
| `pointName` | none — optional | Display name only; the endpoint ignores it |
| `refreshMs` | `3600000` | Refresh interval in ms (minimum 60000) |

## Click actions

- **Left** — notification with the full readings
- **Middle / right** — refetch now

## Data source

The widget polls

```
https://inpost.pl/shipx-point-data/<pointId>/<pointName>/air_index_level
```

an unofficial InPost ShipX endpoint. It answers JSON with `air_index_level`
(`VERY_GOOD`, `GOOD`, `SATISFACTORY`, `MODERATE`, `BAD`, `VERY_BAD`) and an
`air_sensors` list (`PM1`, `PM2.5`, `PM4`, `PM10`, temperature, humidity,
pressure). Counterintuitively, the only header it requires is
`x-requested-with: XMLHttpRequest` — no cookies or browser headers needed.

Because the endpoint is unofficial it may change or disappear without notice;
on failure the widget keeps the last readings and marks the tooltip, retrying
a few times before falling back to the refresh timer.

Not every paczkomat has the sensors — InPost answers `404` with
`{"message": "Air sensors are not available."}` for the ones that do not, and
`{"message": "Point not found."}` for an id that does not exist. Those bodies
are read rather than discarded, so the tooltip names the reason instead of
reporting a bare "no data", and the widget does not retry them (the answer
would not change; the refresh timer picks it up later). Worth checking a
locker before wiring it up:

```bash
curl -sS -w ' [%{http_code}]\n' -H 'x-requested-with: XMLHttpRequest' \
  'https://inpost.pl/shipx-point-data/<pointId>/<pointName>/air_index_level'
```

A `200` with an `air_sensors` array is a locker that works.

## Development

```
git clone https://github.com/ksalk/inpost-weather-widget
cd inpost-weather-widget
omarchy plugin validate .   # manifest checks, mirrors the shell's registry
node --test test/Model.test.mjs   # Model.js unit tests
```

To try it live, copy the repo contents into the Omarchy plugins directory —
the shell reloads plugin code on file changes:

```
rsync -a --delete --exclude .git ./ ~/.config/omarchy/plugins/inpost.air/
```

and add `{ "id": "inpost.air", "pointId": "12345", "pointName": "XYZ12AB" }`
to `bar.layout.center` in `~/.config/omarchy/shell.json`.

If an edit does not show up, run `omarchy restart shell`. A widget that fails
to compile is dropped silently — its bar slot collapses to zero width and its
IPC target stops answering, so `omarchy-shell inpost.air refresh` returning
"Target not found." is the signal that the QML no longer loads.

## License

[MIT](LICENSE) © 2026 Konrad Sałkowski
