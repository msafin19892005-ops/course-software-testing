# 01 同名但护照不同的乘客被覆盖

## 测试方法与需求依据

采用黑盒等价类划分，按“姓名相同或不同”和“护照相同或不同”划分输入。本例选择姓名相同、两本护照均未使用的合法组合，观察新增后与刷新后的乘客身份。

[REQ-7、REQ-7.2](../../requirements/requirements.yaml) 要求有效输入新增持久化乘客，并以重复护照作为拒绝条件。需求按护照区分乘客身份，列出的限制包含护照重复校验。由此推导，本例两本不同的有效护照应对应两条持久化记录。

## 与现有测试的差异

[REQ-7.2.spec.ts](../baseline/REQ-7.2.spec.ts) 的新增测试只建立一个 Added Passenger，随后检查该护照的单条记录与持久化。其重复护照测试使用不同姓名和已存在护照。本例新增第二个同名、不同护照的合法乘客，并同时核对原身份和新身份。

## 前置条件与复现步骤

1. 按 [团队 README](README.md) 注册并登录新的独立测试账号，例如用户名 `team14_manual01`、账号护照 `P14000011`。示例用户名和护照须未使用。
2. 打开 My 12306 → Information management → My Passengers。
3. 点击 Add new passengers，选择 Nationality China，输入 Name `Team14 Same Name`、Passport number `P14000001`、Passport expiration date `2028-12-31`、Date of birth `1999-02-20`、Gender Male、Email address `team14.passenger@example.com`、Mobile number `13800000043`、Passenger type Adult，点击 Determine。
4. 确认 Passenger added successfully. 出现，并检查 `P14000001` 所在行。
5. 再次打开 Add new passengers，保持步骤 3 的所有字段，仅把 Passport number 改为另一个未使用值 `P14000002`，点击 Determine。
6. 检查列表，刷新页面，再检查两本护照对应的行。

## 预期与实际

预期新增第二条乘客记录后，`Team14 Same Name / P14000001` 和 `Team14 Same Name / P14000002` 同时存在，刷新后两者均保留。

实际两次操作均显示新增成功，但第二次操作覆盖了第一条记录的护照。第一本护照对应的行消失，刷新后仍只保留第二本护照。自动化使用随机护照，具体值及前后行文本见运行生成的 `results.json`。

| 观察点 | 两条不同护照记录的预期数量 | 实际数量 |
| --- | --- | --- |
| 首次添加后 | 1 | 1 |
| 第二次添加并刷新后 | 2 | 1 |

## 证据与复现命令

按团队 README 安装依赖、启动应用并设置 BASE_URL 后执行 `node reproduce.cjs 01`。当前实现的断言在“第一本护照仍存在”处失败。

## 执行后的代码定位

[`backend/app.py`](../../backend/app.py) 的 `_passenger_add` 在 847–850 行按姓名查找已有非账号持有人记录，在 866–874 行命中同名分支后执行 UPDATE，把原记录的 passport 改为新护照。该定位用于解释已观察到的身份丢失。
