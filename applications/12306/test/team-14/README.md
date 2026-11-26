# 12306 Team 14 fault-revealing tests

成员为 Jiang Youchen、Li Aolong、Li Rui。分配系统为 12306。

| 用例 | 方法 | 需求 | 观察到的差异 |
| --- | --- | --- | --- |
| [01 同名乘客的不同护照记录被覆盖](black-box-01.md) | 黑盒等价类划分 | REQ-7、REQ-7.2 | 第二次新增成功后，第一本护照对应的记录消失 |
| [02 同名同护照绕过重复校验](white-box-02.md) | 白盒分支测试 | REQ-7.2 | 重复添加成功，并覆盖原乘客手机号 |
| [03 余票耗尽后旧标签页仍打开确认框](white-box-03.md) | 白盒状态变化路径测试 | REQ-8.3.2 | Place order 使用旧余票快照放行，缺票错误延迟到 Confirm |
| [04 车票搜索接受 7 月 32 日](white-box-04.md) | 白盒条件测试 | REQ-3.1.3 | 两侧真实日期均可查询，不存在的日期同样进入结果页 |
| [05 Popular 中无法选择北京](black-box-05.md) | 黑盒等价类划分 | REQ-3.1.2 | ABCDE 可以选择北京，Popular 显示空列表 |
| [06 注册日期选择器缺失](black-box-06.md) | 黑盒场景测试 | REQ-2.1.1 | 护照有效期和出生日期均只能键入 |

预期依据为课程 [requirements.yaml](../../requirements/requirements.yaml)。项目压缩包中 12306 的 YAML 和全部 26 张参考图与本仓库对应文件逐字节相同。01 的预期由新增持久化乘客和护照判重规则推导；04 由售票日历区间推导。05、06 还分别使用[站点分组参考图](../../requirements/reference/location-selector-form.png)和[注册参考图](../../requirements/reference/register.png)。连续两轮本地目标系统运行均有六项预期断言失败、零项执行异常。尚无独立运行的课程参考系统实测结果。

## 环境与数据准备

验证的应用源码版本为 `024c2bcef427351918168a0eb414cf907822b4ac`。应用使用 Python 3.15.1 和 SQLite，浏览器为 Chrome，自动化使用 Playwright 1.62.1。每轮的浏览器版本、时间、账号、护照、前后结果和接口响应保存在 输出目录的 `results.json`。所有账号与身份字段均为本地测试数据。

在仓库根目录的 PowerShell 中启动应用。

```powershell
cd applications\12306
.\start.bat --port auto
```

保留应用终端，根据启动输出设置自动化使用的地址。业务时钟从 `2026-07-21 00:00 Asia/Shanghai` 起随真实时间推进。用例 03 使用 `2026-07-22` 的服务，并要求执行时业务时间仍早于发车时间。

用例 01–03 通过注册界面新建独立账号并登录，再通过乘客界面建立前置数据。自动化每次生成新的用户名和护照号，可在已有数据库中重跑。用例 03 在结束时通过付款页 Cancel 取消建立的锁座订单，取消结果写入运行记录。

手动复现时可使用每篇用例给出的示例数据。先在 Register 中选择 China，填写 Name、未使用的 Passport number、Passport expiration date `2030-12-31`、Date of birth `1995-01-01`、Gender Male、未使用的 Username、Password 和 Confirm Password `Password123!`、Email address `<用户名>@example.com`，勾选协议并提交。看到 Registration successful. 后，使用该用户名和密码登录。

## 自动化复现

需要 Node.js 20+、npm 和本机安装的 Google Chrome。在另一个 PowerShell 中，从仓库根目录执行。

```powershell
cd applications\12306\test\team-14
npm.cmd install --ignore-scripts --package-lock=false
$env:BASE_URL = "http://127.0.0.1:3000"
npm.cmd test
```

将 BASE_URL 中的端口替换为启动输出的实际端口。使用 Microsoft Edge 时，可以设置 `$env:BROWSER_CHANNEL = "msedge"`。

单独复现某个用例可执行 `node reproduce.cjs 01`、`node reproduce.cjs 02` 或其他编号（01–06）。设置 EVIDENCE_DIR 可把新一轮证据写到指定文件夹，例如 `$env:EVIDENCE_DIR = "$PWD\assets\rerun"`。

自动化按需求断言正确行为。当前提供实现会产生六个 `FAIL` 并返回退出码 1，每个 FAIL 对应文档描述的行为差异。准备步骤或浏览器运行异常显示 `ERROR`，应先处理 ERROR 再判断用例结果。全部满足需求时返回退出码 0。

脚本 [reproduce.cjs](reproduce.cjs) 的状态变化均通过页面控件完成，同时观察页面自身发出的 HTTP 请求以记录响应。每个用例会保存关键步骤的完整页面截图，覆盖原路径中的上一轮截图。

## 覆盖差异与提交

用例 01 增加了同名不同护照的输入组合。用例 02 在已有重复护照校验上，补充姓名相同的分支与原记录完整性断言。两者分别覆盖“新增合法身份”和“拒绝已存在身份”，对应 `_passenger_add` 中不同的 UPDATE 分支。

用例 03 增加同一登录会话、两个标签页、两个不同乘客下的余票变化，并检查 Place order 阶段的确认框状态。相关基线测试均在单个页面内准备、选择并提交。

其余三条分别新增不存在的日历日期、Popular 分组中的站点选择和注册表单的日历选日交互。
