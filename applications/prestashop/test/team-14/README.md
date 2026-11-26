# PrestaShop Team 14 fault-revealing test

成员为 Jiang Youchen、Li Aolong、Li Rui。本目录为 Team 14 在分配系统 12306 之外追加的测试。

[用例 06 重复加购未累加数量](white-box-06.md) 使用白盒路径选择，针对同款同规格已在购物车中的分支，依据 REQ-3.3 与 REQ-4.2 检查第二次成功加购的数量及金额。运行结果和环境信息见 [results.json](assets/results.json)。预期依据为课程需求，独立参考系统的运行态对照仍待补充，有效性由助教审核。

## 启动

应用需要 Node.js 22.12+ 和 npm。从仓库根目录的 PowerShell 执行。

```powershell
cd applications\prestashop
npm.cmd ci --include=dev --include=optional
.\start.bat --port 4102
```

## 自动化复现

自动化使用 Playwright 1.62.1 和本机 Google Chrome。在另一个 PowerShell 中，从仓库根目录执行。

```powershell
cd applications\prestashop\test\team-14
npm.cmd install --ignore-scripts --package-lock=false
$env:BASE_URL = 'http://127.0.0.1:4102'
npm.cmd test
```

所有购物操作通过界面完成。每轮新建独立浏览器上下文，以匿名身份建立自己的空购物车，然后对同款 M/White 商品执行两次加购。测试也通过购物车 Increase quantity 检查增加数量的正常对照。页面截图和 JSON 默认写入 assets，可通过 EVIDENCE_DIR 改变目录。

脚本按正确行为断言，当前实现产生 FAIL 和退出码 1。环境或前置步骤失败时显示 ERROR。行为满足需求时为 PASS，退出码 0。
