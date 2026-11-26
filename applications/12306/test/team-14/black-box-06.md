# 06 注册时无法从日期选择器填写两个必填日期

## 需求与设计

[REQ-2.1.1](../../requirements/requirements.yaml) 明确要求注册表单为 Passport expiration date 和 Date of birth 提供日期选择器。[注册页参考图](../../requirements/reference/register.png) 显示两个字段右端的日历入口。将两个字段作为一条用例，检查同一种注册交互。

黑盒场景测试。已有[注册测试](../baseline/REQ-2.1.2.spec.ts)通过[辅助函数](../baseline/helpers.ts)直接填写日期文本。本例使用鼠标从日历选日，检查基线未覆盖的选日操作。

## 复现与判定

1. 在未登录的首页点击 Register。找到 Passport expiration date。
2. 点击该字段或其日历入口，尝试通过日历选择一个未来日期，检查日期回填。
3. 对 Date of birth 重复操作，尝试选择一个过去日期。该测试无需提交注册。

预期两个字段均能通过日期选择器填值。实际点击任一字段只会聚焦普通文本框，页面未出现可选日期，两个字段均无日历入口。截图分别记录点击后的可见状态，日志记录字段类型、字段结构和页面可访问内容的变化。

依照[团队 README](README.md)启动后运行 `node reproduce.cjs 06`。如更换为脚本无法识别的日期控件，按上述步骤手动选日并判定。
