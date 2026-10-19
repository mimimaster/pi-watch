# pi-watch

A [pi](https://pi.dev) coding-agent extension that lets the model **watch a video** without a native video modality.

`/watch` preprocesses a local file or URL into what the model already accepts: a **timestamped transcript** plus **sampled JPEG frames**. Captions are used first; if none exist, a local Whisper binary is used. Results are injected into the current session as text + image parts (or as file paths the model can `Read` if image parts are unavailable).

System tools are **detected, never vendored**: `ffmpeg` / `ffprobe` (required), `yt-dlp` (URLs), `mlx-whisper` or `whisper-cli` (optional ASR).

Chinese: [README.zh-CN.md](./README.zh-CN.md)

## Install into pi / piwin

Pi package (npm, once published):

```bash
pi install npm:pi-watch
```

From a git checkout or local clone:

```bash
pi install git:github.com/mimimaster/pi-watch
# or
pi install ./path/to/pi-watch
```

Then `/reload` in the session (or restart pi).

**piwin** loads the same pi extension packages. Install `pi-watch` through piwin’s extension manager, or with `pi install` as above. This package does **not** patch piwin core.

During development:

```bash
pi --extension ./extensions/pi-watch.ts
```

Requires **Node.js ≥ 22.19.0**.

## System dependencies

| Tool | Needed for | Install |
| --- | --- | --- |
| **ffmpeg** + **ffprobe** | duration + frame sampling | `brew install ffmpeg` · `apt install ffmpeg` |
| **yt-dlp** | http(s) / YouTube / many public pages | `brew install yt-dlp` · `pip install yt-dlp` |
| **mlx-whisper** (Apple Silicon) or **whisper-cli** (whisper.cpp) | ASR when no captions | `pip install mlx-whisper` · `brew install whisper-cpp` |

Verify from inside pi:

```
/watch doctor
```

Missing binaries print install hints and **do not crash**. Without ffmpeg, `/watch` refuses. Without yt-dlp, local files still work. Without Whisper, `/watch` still samples frames and uses captions if present.

From the repo (no pi required):

```bash
node --input-type=module -e \
  'import { checkDeps, formatDoctorReport } from "./src/doctor.ts"; console.log(formatDoctorReport(await checkDeps()));'
```

## Commands

```
/watch <local-path-or-url> [--start <sec>] [--end <sec>]
/watch doctor
/watch status
```

Times are seconds (`12.5`) or clocks (`1:30`, `0:01:30`).

### Examples

Local file:

```
/watch ./demo.mp4
```

Only a slice of a longer clip:

```
/watch ./lecture.mkv --start 1:00 --end 3:30
```

Public URL (needs yt-dlp; respect the site’s terms):

```
/watch https://www.youtube.com/watch?v=VIDEO_ID --start 0 --end 60
```

Last run in this session:

```
/watch status
```

## What you get

1. **Frames** — adaptive sampling, default cap **100** JPEGs at about **768px** wide. Short clips are denser; long clips are sparse.
2. **Transcript** — in order: embedded subtitle track → sibling `.vtt`/`.srt` → yt-dlp subtitles → local Whisper → frames only (with a note).
3. **Injection** — `sendUserMessage` with text + `image/jpeg` parts. If the host rejects image parts, the prompt lists frame file paths for `Read`.
4. **Limits** — default max duration **20 minutes**. Longer files are rejected unless `--start`/`--end` selects a window of at most 20 minutes.

Temporary files live under the process temp dir (`pi-watch-*`) and are not meant for git.

## Drag-and-drop

Pi does not ship a first-class video attachment type. Dropping a file into the TUI typically inserts an escaped **file path**. This extension listens on the interactive `input` hook: if that path looks like a video (`mp4`, `webm`, `mov`, `mkv`, …) and the file exists, it runs the same pipeline and transforms the prompt.

`/watch …` is still the supported, explicit entry point. URL paste does **not** auto-download (too easy to trigger by accident); use `/watch <url>`.

No piwin/pi core changes are required. If a future pi build adds a dedicated attachment hook, this package can grow into it without forking the host.

## yt-dlp / site terms

`yt-dlp` is only invoked for `http://` and `https://` sources you pass to `/watch`. Use it solely on content you have the right to download and process. Follow YouTube’s and other sites’ terms of service. This project does not circumvent DRM or access restrictions.

CI and unit tests **never** hit live YouTube; downloads are mocked.

## Tests

```bash
npm test
```

Subprocess calls (ffmpeg, ffprobe, yt-dlp, Whisper) are injected/mocked.

## License

MIT
