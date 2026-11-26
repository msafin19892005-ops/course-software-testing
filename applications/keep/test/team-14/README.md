# Keep Team 14 fault-revealing tests

成员为 Jiang Youchen、Li Aolong、Li Rui。Team 14 已先提交分配系统 12306 的测试，本目录为按课程允许范围追加的 Keep 测试。

| 用例 | 方法 | 需求 | 差异 |
| --- | --- | --- | --- |
| [04 搜索改写显示文本的大小写](white-box-04.md) | 白盒输入选择 | REQ-4.1、REQ-2.2 | 搜索 sql 后原内容 SQL 被显示为 sql |
| [05 旧标签页保存丢失已持久化的其他便签](white-box-05.md) | 白盒状态变化路径 | REQ-2.2、REQ-2.1 | B 保存的便签被 A 的整份旧状态覆盖 |

预期依据为 [课程需求](../../requirements/requirements.yaml)，运行结果、浏览器版本、源码提交和实际测试输入见 [results.json](assets/results.json)。独立参考系统的运行态对照仍待补充，有效性由助教审核。

## 启动与隔离

应用需要 Node.js 18+。在仓库根目录的 PowerShell 中执行以下命令，为本组测试使用独立状态文件。

```powershell
cd applications\keep
$env:LINGCORE_STATE_FILE = Join-Path $PWD '.local-runtime/team14-state.json'
.\start.bat --port 4101
```

用例 05 会复现整份旧状态覆盖，使用上述测试专用实例可以把影响限制在本地合成测试数据中。每轮用例名称包含运行后缀，可以重跑。持久化文件和依赖目录由仓库忽略规则排除。

## 自动化

自动化需要 Node.js 20+、npm、本机 Google Chrome。保持应用终端运行，在另一个 PowerShell 中从仓库根目录执行。

```powershell
cd applications\keep\test\team-14
npm.cmd install --ignore-scripts --package-lock=false
$env:BASE_URL = 'http://127.0.0.1:4101'
npm.cmd test
```

单个用例使用 `node reproduce.cjs 04` 或 `node reproduce.cjs 05`。EVIDENCE_DIR 可指定其他证据目录。所有业务操作通过界面完成。

脚本断言需求规定的行为，当前实现的两个断言均显示 FAIL，退出码为 1。准备步骤和运行环境异常显示 ERROR。用例通过则为 PASS。截图和结果 JSON 保存到 assets，重跑会更新这些证据。
