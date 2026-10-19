# pi-watch

[pi](https://pi.dev) 编程助手扩展：让模型在没有原生视频模态的情况下「看视频」。

`/watch` 把本地文件或 URL 预加工成模型已经支持的输入：**带时间戳的字幕文本** + **抽帧 JPEG**。优先用字幕；没有字幕再走本机 Whisper。结果注入当前会话（文本 + 图片；若宿主不接受 image part，则写入模型可用 `Read` 读取的文件路径）。

系统依赖**只探测、不打包**：`ffmpeg` / `ffprobe`（必需）、`yt-dlp`（链接）、`mlx-whisper` 或 `whisper-cli`（可选转写）。

English: [README.md](./README.md)

## 安装到 pi / piwin

npm 包（发布后）：

```bash
pi install npm:pi-watch
```

从 git 或本地克隆：

```bash
pi install git:github.com/mimimaster/pi-watch
# 或
pi install ./path/to/pi-watch
```

然后在会话里 `/reload`（或重启 pi）。

**piwin** 使用同一套 pi 扩展包。用 piwin 的扩展管理安装 `pi-watch`，或像上面一样 `pi install`。本仓库**不修改** piwin 核心。

开发时：

```bash
pi --extension ./extensions/pi-watch.ts
```

需要 **Node.js ≥ 22.19.0**。

## 系统依赖

| 工具 | 用途 | 安装 |
| --- | --- | --- |
| **ffmpeg** + **ffprobe** | 时长与抽帧 | `brew install ffmpeg` · `apt install ffmpeg` |
| **yt-dlp** | http(s) / YouTube 等公开页 | `brew install yt-dlp` · `pip install yt-dlp` |
| **mlx-whisper**（Apple Silicon）或 **whisper-cli**（whisper.cpp） | 无字幕时的转写 | `pip install mlx-whisper` · `brew install whisper-cpp` |

在 pi 里验收：

```
/watch doctor
```

缺二进制会打印安装提示，**不会崩**。没有 ffmpeg 则拒绝运行；没有 yt-dlp 仍可处理本地文件；没有 Whisper 仍会抽帧，有字幕就用字幕。

不启动 pi 时也可以探测：

```bash
node --input-type=module -e \
  'import { checkDeps, formatDoctorReport } from "./src/doctor.ts"; console.log(formatDoctorReport(await checkDeps()));'
```

## 命令

```
/watch <本地路径或 URL> [--start <秒>] [--end <秒>]
/watch doctor
/watch status
```

时间可以是秒（`12.5`）或时钟（`1:30`、`0:01:30`）。

### 示例

```
/watch ./demo.mp4
/watch ./lecture.mkv --start 1:00 --end 3:30
/watch https://www.youtube.com/watch?v=VIDEO_ID --start 0 --end 60
/watch status
```

## 行为与限制

- 抽帧：短片密、长片稀；默认最多约 **100** 帧、宽约 **768px**。
- 转写顺序：内嵌字幕 → 旁路 `.vtt`/`.srt` → yt-dlp 字幕 → 本机 Whisper → 仅帧图（并注明未转写）。
- 默认单次素材不超过 **20 分钟**；更长请用 `--start` / `--end` 裁到 20 分钟以内。
- 临时文件在系统临时目录，不进 git。

## 拖入

Pi 目前没有一等的视频附件类型。把文件拖进 TUI 通常会插入转义后的**文件路径**。本扩展挂在交互式 `input` 钩子上：若路径像视频且文件存在，则自动跑同一管道。

明确入口仍是 `/watch`。粘贴 URL **不会**自动下载，请用 `/watch <url>`。不改 piwin / pi 核心。

## yt-dlp 与站点条款

只有你在 `/watch` 里给出的 `http://` / `https://` 才会调用 yt-dlp。请只处理你有权下载和使用的内容，并遵守 YouTube 等站点的服务条款。本项目不绕过 DRM 或访问限制。

单元测试**不会**真实访问 YouTube。

## 测试

```bash
npm test
```

## 许可

MIT
