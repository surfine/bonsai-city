# Bonsai City（盆景城市）

三个在浏览器里运行、共用一份城市存档的小游戏。

- **Bonsai City（盆景城市）**：等距视角的城市建设：划区、铺水电、长楼、维持运转。
- **Rootline**：在成长中的城市上画地铁、BRT 和公交线；在车站挤爆之前把人送到目的地。
- **Joyride（兜风）**：开着车穿过自己建的城（车载电台为合成音，无采样库）。

已保存城市以桥接状态存放。没有宿主时，`ais6-bridge.js` 用其独立适配器应答（该文件头说明为本地存储支持的状态）。

## 单独打开页面

```bash
npm start
```

然后打开：

| 游戏 | 地址 |
| --- | --- |
| Bonsai City | `http://localhost:8080/city/` |
| Rootline | `http://localhost:8080/rootline/` |
| Joyride | `http://localhost:8080/joyride/` |

每个页面加载 `ais6-bridge.js`、共用字符串与运行时，以及该游戏自己的模块（见 `city/index.html`、`rootline/index.html`、`joyride/index.html` 的脚本列表）。

## 构建

```bash
npm run build
```

把宿主页面要嵌入的文件复制到 `dist/`。没有包依赖，有 Node 即可。精灵图集、纹理图集、体素模型包，以及 `vendor/bonsai-renderer.js`（打好包的 three.js 子集）由 AI System 6 仓库中的工具生成，这里以构建产物形式附带。本构建不重新生成它们。

## 目录

| 路径 | 内容 |
| --- | --- |
| `city/` | Bonsai City：页面、壳层、Canvas 渲染器、样式表 |
| `rootline/` | Rootline：页面、线网游戏、视图、样式表 |
| `joyride/` | Joyride：页面、驾驶、车流、电台、样式表 |
| `shared/` | 模拟、编解码、OSM 映射、渲染数学、体素渲染器、字符串、基础样式、桥接运行时 |
| `assets/` | 图集、纹理、体素模型、出处记录、素材底板 |
| `vendor/` | 体素渲染器用的 three.js 子集包 |
| `ais6-bridge.js`、`kit.css`、`app.manifest.json` | 让宿主页面把游戏嵌进框架、代管共用城市状态并画出菜单；单独打开时，同样的调用退回桥接的独立适配器 |
| `tools/build.mjs` | 把嵌入树复制到 `dist/` |

## 嵌入

宿主需要同源的嵌入树（`npm run build` 写入 `dist/` 的全部内容），并按各游戏 `index.html` 能加载相对脚本与资源的方式提供。桥接（`ais6-bridge.js`）与 `app.manifest.json` 中的窗口列表负责在框架中打开各游戏、保留进度并画出菜单。套件样式来自 `kit.css`。

## 许可

MIT，见 [LICENSE](LICENSE)；逐个文件的说明见 [LICENSES.md](LICENSES.md)。

材质底图 `assets/source-art/city-materials-v1.png` 是为本项目用 AI 生图工具生成的（未记录所用模型），以同一许可发布。读写经典城市文件的模块只含格式事实；感谢它们所参考的公开格式笔记，其中包括 SC2k-docs（CC BY-SA 4.0）。

English: [README.md](README.md).
