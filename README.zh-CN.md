<p align="center">
  <img src="public/kiteva-mark.svg" width="88" alt="Kiteva 标志：一只由蓝紫色块面组成的风筝">
</p>

<h1 align="center">kiteva</h1>

<p align="center">
  <b>一个私人的创作小房间，把一个想法变成一段动态图形短片。</b><br>
  使用 <a href="https://platform.claude.com/docs/en/about-claude/models/overview">Claude Opus 5.5</a> 或 <a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol">GPT-6.1 Sol</a>。
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

<p align="center">
  <a href="docs/assets/kiteva-intro.mp4">
    <img src="docs/assets/kiteva-intro-excerpt.webp" width="820" alt="Kiteva 自我介绍短片的无声片段，点击打开带旁白的完整 MP4">
  </a>
  <br>
  <sub>这部短片由 Kiteva 真实运行一次做出：28 秒，带本地 Kokoro 旁白，背景音乐是成片 agent 用代码写出来的。上面是从中段截取的 14 秒无声循环，点击可打开带声音的完整 MP4。<a href="docs/intro-video.md">制作过程</a>。</sub>
</p>

> [!IMPORTANT]
> **非商业许可。** Kiteva 的源码以 [Kiteva 非商业许可（Kiteva Non-Commercial License）](LICENSE) 公开。
> 它以 MIT 为基础，但增加了禁止商业使用的条件，因此属于“源码可见（source-available）”，**不是**
> OSI 认可的开源许可。第三方组件保留各自的许可，见文末 [许可](#许可)。

通过 **EN / 中文** 即时切换界面，详见[界面语言](docs/ui-language.md)。视频语言仍是独立的项目设置。

## 最近更新

以下日期采用新西兰时间，更新通过 `main` 分支发布。

<details>
<summary>2026-10-18</summary>

- **v0.1.0 — 首个源码版本。** 见[发布说明](CHANGELOG.md#010--2026-10-18)。包含 138 种 Motion Graphic、48 种 motion、两种 agent 提供商、无头网站录制及中英文输出。原生 Windows 沙箱与渲染验证已通过 CI；Windows 支持仍为实验性。

- 新增 **English / 简体中文视频语言**，支持翻译旁白和歌词并保留原文，接入独立的中文 Pocket TTS 后端；助手中的 Music 与 Narration / lyrics 分开设置。
- Anatomy 改为启动时安装或更新，离线时保留已校验版本，不再在源码中打包上游文件。
- 新增 **Cassette Futurism（卡带未来主义）**：硬件面板、荧光屏幕、磁带和步进动效，附已渲染的演示预览。现在共 **137 种 Motion Graphic**。
- 新增 **Terminal Lyric Duotone Anime（终端歌词三色墨动画）**：蓝、奶油、黑三色平涂动漫画面配 CRT 终端画框，带双语解码字幕和环形关键词标题，附代码绘制的示意预览。同时新增两种 motion：**旋转声呐扫描显影**和**像素瓦片显形与定点删除**。现在共 **138 种 Motion Graphic、48 种 motion**。
- 新增**实验性的原生 Windows 后端**、适配平台的安装流程和渲染验证命令。实际 Windows 10/11 测试仍待完成；Windows 上须先通过验证，才能创建项目。见 [Windows 安装指南](docs/windows.md)。

- 发布中英文 README、由 Kiteva 自己制作的介绍短片、桌面与 Storyboard 截图、架构图，以及技术清单和费用说明。
- 补充贡献指南和[非商业许可](LICENSE)。

</details>

<details>
<summary>2026-10-17</summary>

- 扩充至 **136 种 Motion Graphic、46 种 motion**，更新动画预览和 Motion Graphic 摘要缓存，并将 [Multiplane](https://github.com/LBEILC/Multiplane) 升级至 **0.3.10**。
- Activity 日志按任务显示具体动作，区分准备、审阅和修复，任务内的更新增加缩进；继续隐藏原始内部内容。
- 新增旁白自动响度匹配和音量控制，简化 Speech / vocals 设置，并通过 Claude SDK 注册随仓库提供的技能。

</details>

## 为什么会有它

本人并不是专业设计师，在内容和创作领域做全栈工程师，接触了一些些 creative 的 idea。正好发现
[Opus 5.5](https://platform.claude.com/docs/en/about-claude/models/overview) 很有灵性，最近公司内部又在准备 Hackathon，自己也觉得这些动效很有意思，于是开始搜集一些很有感觉的动效，
以及它们可以用什么技术实现。搜集得越来越多，就写了一个 agent 去利用这些内容和 Opus 5.5 的能力，想看看到底能做成什么样。
结果效果挺出人意料的，于是把这个 agent 的源码分享出来，采用非商业许可。

搜集了这么多，有非常炫的材料，也有可能有不对的，反正先都收集了 😄

创意部分我最喜欢用 Opus 5.5。[Codex](https://developers.openai.com/codex) 那边的 [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) 也接好了，我在玩着试试。每个项目可以单独选择用哪一家。

## 它能做什么

**想法 → 简报 → Motion Graphic 组合 → 预览 → 完整成片 → 审阅与交付**

<p align="center">
  <img src="docs/assets/desktop-room.png" width="900" alt="Kiteva 深色桌面房间。左边是助手窗口，正在问“What's your idea?”，带有 Idea、Documents、Images、URLs、Music、Settings、Review 标签；旁边是介绍短片的项目小组件，显示 Ready 标记、短片画面和 Play film 按钮。">
  <br><sub>介绍短片刚做完时的房间。助手用来开始新想法，每个项目都有自己的小组件。</sub>
</p>

- **桌面式的房间。** 一切都在个人桌面上的窗口里进行。助手一步步带你填写想法、文档、图片、网站、
  音乐与歌词、设置，旁边还有素材架和每个项目的小组件。按下 **Create** 之前不会调用任何模型。
- **从参考资料生成简报。** 小模型读取你的文件。如果你提供了网站，它会在全新的无头 [Chromium](https://www.chromium.org) 浏览器里打开并截图，
  然后写出结构化简报，再自查一遍。
- **Motion Graphic 组合。** 主模型阅读全部 138 种 Motion Graphic 的摘要，提出十几个甚至更多方向，
  每个方向由一个主 Motion Graphic 搭配若干辅助 Motion Graphic 组成。随后由独立的评估器（[Typesafe](https://docs.typesafe.ai) 的 [JEV](https://docs.typesafe.ai/models)）
  打分，保留你要求的方向数（1–5 个）。
- **3 秒无声预览。** 每个方向都演绎同一个故事节拍，方便对比。
- **完整成片。** 在你选中的预览会话基础上继续制作，支持 1080p 或 1440p、30 或 60 fps，最长 5 分钟，
  可加屏幕歌词和本地旁白（[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) 或 [Pocket TTS](https://pypi.org/project/pocket-tts/)）。
- **审阅与交付。** 每次渲染都会用 `ffprobe` 探测并完整解码。使用默认渲染器
  [HyperFrames](https://github.com/heygen-com/hyperframes) 时，还会做布局和对比度检查，发现的问题分轮做有针对性的修复；
  [Multiplane](https://github.com/LBEILC/Multiplane) 试用版不做这两项检查，改为校验帧的一致性。之后再由小模型审阅结果。
  最后交付 MP4、封面图、项目 ZIP、播放副本和 Storyboard。

<table>
  <tr>
    <td width="50%"><img src="docs/assets/motion-graphics-gallery.png" alt="Motion Graphic 浏览窗口，以正在播放的 3 秒演示卡片和配色色块列出 136 种 Motion Graphic"></td>
    <td width="50%"><img src="docs/assets/preview-directions.png" alt="介绍短片项目的 Directions 标签页。两段 3 秒无声预览演绎同一句“Bring an idea. It writes a brief,”：Paper Room 是淡紫色纸艺工作室和桌上的贴纸，Zine Press 是浅灰底上带颗粒感的蓝紫贴纸。Paper Room 已标记为 Full video built。"></td>
  </tr>
  <tr>
    <td><sub>浏览全部 136 种 Motion Graphic，每张卡片播放一段审阅过的 3 秒演示。</sub></td>
    <td><sub>Kiteva 为上面这部短片预览的两个方向，我选了 Paper Room。</sub></td>
  </tr>
</table>

### Storyboard（分镜）

<p align="center">
  <img src="docs/assets/storyboard.png" width="900" alt="Paper Room 短片的 Storyboard 窗口：9 个场景，0:28。正在播放第 02 场“Collecting motion”，时间 0:03.9。火柴人导演的对话框写着“Scraps land one at a time and scatter across the table”，地面上站着标注为 stage crew、lighting、art dept、sound、camera 的剧组。">
  <br><sub>介绍短片自己的 Storyboard，截图时正播到 9 个场景中的第 2 场。</sub>
</p>

每个预览和成片都会保存一份 `STORYBOARD.json`，里面是与实际合成一致的带时间的场景、节拍、字幕和音频说明。
Storyboard 页面把它回放成一段小小的“幕后排练”：一位火柴人导演和剧组（场务、灯光、字效、音效、摄影），
在节拍需要自己的工种时走到位置上干活。你可以播放、重播，或拖动时间轴查看。

老实说明一下：这些剧组角色只是对已记录节拍的一种趣味演绎，不是真实的制作人员，也不是实时的渲染监控。
实时进度在房间里每个项目的活动记录中。另外，它和那个叫 [Storybook](https://storybook.js.org) 的 UI 组件工具毫无关系。

## 数字（从源码统计）

|                      |                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Motion Graphic       | **138** 种（`assets/catalog/video-style-catalog.json`）                                                                                                                        |
| 动作（motions）      | **46** 种（`assets/catalog/motion-pattern-catalog.json`）                                                                                                                      |
| 技术池条目           | **92** 条推荐，涵盖视觉构建、运动、渲染和辅助工具                                                                                                                              |
| 启动时安装的创作技能 | **1** 个（[Anatomy](https://github.com/wheresryan22/anatomy)）                                                                                                                 |
| 渲染器               | [HyperFrames](https://github.com/heygen-com/hyperframes)（默认）、[Multiplane](https://github.com/LBEILC/Multiplane)（试用）、[Remotion](https://www.remotion.dev)（仅作后备） |

有意思的是组合。一个方向可以把一个主 Motion Graphic 和若干辅助 Motion Graphic 混在一起（30 秒以内的片子共 1–3 种，
3 分钟以上最多 6 种），再由模型挑选合适的动作和技术。这样能得到的起点远比单一风格多。但这不保证每种组合都好用，
有些就是不行，所以才需要预览、评估器和修复。

## 分工

| 工作                                                | Claude 项目                                                                             | Codex 项目                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 简报、参考核对、Motion Graphic 摘要、歌词、简单修复 | [Claude Haiku 5.5](https://platform.claude.com/docs/en/about-claude/models/overview)    | [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)   |
| 组合提案、预览、完整成片、节奏/风格修复             | **[Claude Opus 5.5](https://platform.claude.com/docs/en/about-claude/models/overview)** | [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| 成片结果审阅                                        | 与构建该结果的主模型相同                                                                | 与构建该结果的主模型相同                                                 |
| 给方向打分并挑选                                    | [JEV](https://docs.typesafe.ai/models)（[Typesafe](https://docs.typesafe.ai)）          | [JEV](https://docs.typesafe.ai/models)                                   |
| 记录每次调用、token 数和费用估算                    | 治理报告（Governance）                                                                  | 治理报告                                                                 |

更多细节和流程图见 [docs/architecture.md](docs/architecture.md)（英文）。

视频语言可选 English / 简体中文，旁白默认跟随视频语言。详见[语言设置](docs/video-languages.md)和[中文 Pocket TTS 安装](docs/speech.md#chinese-pocket-tts)。

## 快速开始

macOS 安装需要 [Node.js](https://nodejs.org) 24+、[Chrome](https://www.google.com/chrome/) 或 [Chromium](https://www.chromium.org)，
以及带 `ffprobe` 的 [FFmpeg](https://ffmpeg.org)。另外还需要两类访问权限：

- **模型提供方：用 API key，或者用已经登录的订阅账号都可以。** Claude：设置 `ANTHROPIC_API_KEY` 或
  `CLAUDE_CODE_OAUTH_TOKEN`，或者直接在这台 Mac 上登录 [Claude Code](https://code.claude.com/docs/en/overview)。
  Codex：设置 `CODEX_API_KEY` 或 `OPENAI_API_KEY`，或者登录 [Codex CLI](https://developers.openai.com/codex)（`~/.codex/auth.json`）。
  订阅可以用，但订阅用量和剩余百分比的显示我还没测过。
- **[JEV](https://docs.typesafe.ai/models) 需要单独配置。** 在 `.env.local` 里填 `TYPESAFE_API_KEY`。
  只要由 Kiteva 生成方向就需要它；如果自己手动选 Motion Graphic，则会跳过 JEV。

```sh
git clone https://github.com/delexw/kiteva.git
cd kiteva
npm ci
cp .env.example .env.local      # 填入 TYPESAFE_API_KEY（已登录订阅时，提供方 key 可不填）
npm run build
npm start                       # 打开 http://127.0.0.1:4317
```

可选：`npm run speech:setup`（[Kokoro](https://github.com/thewh1teagle/kokoro-onnx)）或 `npm run speech:setup:pocket`（[Pocket TTS](https://pypi.org/project/pocket-tts/)），
用于本地旁白，需要 [Python](https://www.python.org) 3.10–3.13。做界面开发时，保持后端运行，再用 `npx vite`（[Vite](https://vite.dev)，`http://127.0.0.1:4319`）。

Anatomy 在服务启动时自动安装或更新。首次启动需要网络，通过 HTTPS 下载 ZIP 安装，不需要 Git 或额外 CLI；以后离线启动可使用已校验的本地版本。上游文件保存在 Git 忽略的 `skills/anatomy/`，提供商注册和 Kiteva 指引仍在源码中。

[React Bits](https://github.com/DavidHDev/react-bits) 和 [Animate UI](https://github.com/imskyleen/animate-ui) 支持规划时检索组件、构建时安装源码。JEV 根据每个任务选择适用的能力、内置技能或本地代码。参见[集成与许可说明](src/server/agents/capabilities/README.md)。

目录、审阅过的插画和 139 段预览短片都随仓库提供，浏览不花钱。你的项目、上传文件、房间布局、数据库和凭据
都保存在本机被 Git 忽略的目录里。

## 随仓库提供的，和需要自己安装的

| 组成部分                                                                                                                                                                                                                                                                      | 是什么                                                                                                                               | 状态                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Anatomy](https://github.com/wheresryan22/anatomy)                                                                                                                                                                                                                            | 等轴测技术插画技能和绘图工具包（3D 模式为 beta）                                                                                     | 启动时从上游安装或更新到 Git 忽略的 `skills/anatomy/`；离线时使用已校验的本地版本；MIT 许可 |
| [HyperFrames](https://github.com/heygen-com/hyperframes) 0.8.144                                                                                                                                                                                                              | HTML 视频合成与导出                                                                                                                  | npm 依赖，固定版本，默认渲染器                                                              |
| [Multiplane](https://github.com/LBEILC/Multiplane) 0.3.10                                                                                                                                                                                                                     | 基于 `render(t)` 的镜头渲染器，带运动模糊                                                                                            | npm 依赖，固定版本，试用选项                                                                |
| [Remotion](https://www.remotion.dev) 4.x                                                                                                                                                                                                                                      | React 视频渲染器                                                                                                                     | npm 依赖，仅作后备（有自己的许可条款）                                                      |
| `reference_browser` / `capture_video`                                                                                                                                                                                                                                         | 通过 [Puppeteer](https://pptr.dev) 操作网页，由本机或工作节点上的 [OpenScreen](https://github.com/getopenscreen/openscreen) 节点录制 | Kiteva 内置，两家模型都可用                                                                 |
| [Kokoro](https://github.com/thewh1teagle/kokoro-onnx)、[Pocket TTS](https://pypi.org/project/pocket-tts/)                                                                                                                                                                     | 本地旁白                                                                                                                             | Python 环境由 `npm run speech:setup*` 搭建，模型权重下载到被 Git 忽略的 `models/`           |
| [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)、[Codex SDK](https://github.com/openai/codex/tree/main/sdk/typescript)、[`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript)                                                           | 模型提供方和 JEV                                                                                                                     | npm 依赖                                                                                    |
| [Caveman](https://github.com/JuliusBrussee/caveman)                                                                                                                                                                                                                           | SDK 调用的本地 token 压缩代理                                                                                                        | npm 依赖，默认开启                                                                          |
| [GSAP](https://gsap.com)、[Three.js](https://threejs.org)、[PixiJS](https://pixijs.com)、[Paper.js](http://paperjs.org)、[Rough.js](https://roughjs.com)、[Motion](https://motion.dev)、[chroma.js](https://gka.github.io/chroma.js/)、[Pica](https://github.com/nodeca/pica) | 供生成的影片使用的绘图和动画库                                                                                                       | npm 依赖                                                                                    |
| [React](https://react.dev)、[Ant Design](https://ant.design) + [Ant Design X](https://x.ant.design)、[Radix](https://radix-ui.com)、[Tailwind CSS](https://tailwindcss.com)、[Vite](https://vite.dev)、[Fastify](https://fastify.dev)、[Zod](https://zod.dev)                 | 应用界面、服务器和共享契约                                                                                                           | npm 依赖                                                                                    |
| [FFmpeg](https://ffmpeg.org)、[Chrome](https://www.google.com/chrome/)/[Chromium](https://www.chromium.org)、[Python](https://www.python.org)、[Blender](https://www.blender.org)（可选）                                                                                     | 外部工具                                                                                                                             | 不随仓库提供，需要自己安装                                                                  |

出现在 92 条技术池里并不代表已经安装。其中 12 条只是推荐，而生成过程不能安装软件包，也不能联网。
每一条的状态，以及全部 77 个直接 npm 依赖，见 [docs/technology-pool.md](docs/technology-pool.md)（英文）。

## 花费

根据 Kiteva 自己的治理报告（快照 2026-10-17，应用内定价日期 2026-10-13），我之前的三个开发项目
（都是 Claude，90–120 秒的片子，各 5 个预览方向）按 SDK 估算的 API 等价模型用量分别是
**$16.46、$18.73 和 $37.42**。超过 90% 的输入 token 是缓存读取。几乎所有费用都花在 Opus 写预览和成片上；
Haiku 的准备和审阅只花了几美分，JEV 排序不到一美分。最贵的那个重新生成过一次方向，还用了九次修复调用。

这只是三个项目，不是基准，也不是按分钟的价格。本地算力（渲染时间、电费）没有计价，也还没有 GPT-6.1 Sol 的例子。
这些数字是按 API 价格折算的 token 用量。如果你用订阅账号登录而不是 API key，它们**不是**你的账单，也不能当作套餐额度的计量表；
订阅用量和剩余百分比的显示我还没有测试过。
计算方法和注意事项见 [docs/costs.md](docs/costs.md)（英文）。

原生 Windows 10/11 安装请参阅 [Windows 指南](docs/windows.md)，不需要 WSL。

## 已知限制

- macOS 已经过本地验证；原生 Windows 10/11 支持为实验性实现，使用前请完成 [Windows 安装和检查](docs/windows.md)。单用户，仅本地运行。
- [Multiplane](https://github.com/LBEILC/Multiplane) 是试用：只支持一个音频文件，场景里不能放视频片段，也没有自动的布局和对比度检查（仍会校验帧的一致性）。
- [Remotion](https://www.remotion.dev) 只是后备，不是可选设置，它的渲染同样不做 HyperFrames 的布局/对比度检查。
- 不生成歌声，不生成图片，也没有素材库视频。画面由代码绘制，或来自你上传的文件和网站截图。
- 目录是我个人的收集，有些描述或技术建议可能不对，欢迎提 issue。
- 生成需要时间，每个预览常常要好几分钟，而且会消耗真实的 API 费用或订阅用量。

## 文档

- [架构](docs/architecture.md)：组件、流程、渲染器、录屏、技能、存储（Mermaid 图）
- [技术清单](docs/technology-pool.md)：全部 92 条技术池条目、内置技能、渲染器、TTS 和所有依赖
- [花费](docs/costs.md)：治理数字是怎么算出来的
- [介绍短片的来历](docs/intro-video.md)：上面那段短片是怎样在 Kiteva 里做出来的
- [README 参考](docs/readme-references.md)：我从中学习过 README 写法的开放项目
- [应用指南](docs/application-guide.md) · [语音设置](docs/speech.md) · [Multiplane 试用](docs/multiplane-trial.md)

以上文档目前为英文。

## 参与贡献

欢迎报告 bug、更正目录内容，以及提交聚焦的 PR。环境搭建、需要运行的检查（`npm run lint`、`npm test`、
`npm run build`）、创作质量要求（可任意跳转的合成、真实渲染的画面）和第三方规则，见 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。

## 许可

Kiteva 自己的代码、目录和文档 © 2026 Yang Liu（[@delexw](https://github.com/delexw)），采用
[Kiteva 非商业许可](LICENSE)。简单来说：在保留许可声明的前提下，你可以出于非商业目的使用、复制、修改和分享它，
例如个人项目、学习、研究和评估。组织内部的非生产性评估（比如在内部 Hackathon 里试用）也算非商业用途。
售卖、作为付费服务提供、用于有偿的客户工作，或把用它做出的东西投入商业生产，需要另外获得许可，
可以在 issue 里询问。以上摘要不是法律意见，以 LICENSE 原文为准。

内置和依赖的软件保留各自的许可：[Anatomy](https://github.com/wheresryan22/anatomy)（MIT）、[HyperFrames](https://github.com/heygen-com/hyperframes) 和 [Multiplane](https://github.com/LBEILC/Multiplane)（Apache-2.0）、
[Remotion](https://www.remotion.dev/license)（Remotion License）、[GSAP](https://gsap.com/standard-license)（GSAP Standard License），
其余见 [docs/technology-pool.md](docs/technology-pool.md)。模型提供方、语音模型和其他服务另有各自的条款。

网站录制默认使用当前机器上的 [OpenScreen](docs/openscreen-worker.md)，打开独立可见的浏览器窗口；也可选择配置独立桌面工作节点。
