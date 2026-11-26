# 05 Popular 站点列表中无法选择北京

## 需求与设计

黑盒等价类划分。在相同空查询下，用同一站点比较两种分组入口。[REQ-3.1.2](../../requirements/requirements.yaml) 指定 Popular 和字母分组，并要求选择车站后回填规范英文名。项目提供的[分组选择器参考图](../../requirements/reference/location-selector-form.png) 显示选中的 Popular 列表含 Beijing（北京）。北京属于需求明确列出的站点。

[基线](../baseline/REQ-3.1.2.spec.ts) 检查 Popular 标签存在，然后从 ABCDE 选北京。这里增加从 Popular 选择同一站点的行为断言。

## 复现与判定

1. 未登录时打开首页，清空 From，点击 ABCDE，从列表选择 Beijing（北京）。确认 From 变为 `Beijing`，证明站点存在且可以回填。
2. 清空 From，点击 Popular，确认该标签处于选中状态。
3. 在此分组查找北京并尝试选择。预期出现一个可选的北京站点，点击后 From 回填 `Beijing`。

实际 Popular 显示 “No stations in this group.”，可选北京数量为 0。

依照[团队 README](README.md)启动后运行 `node reproduce.cjs 05`。
