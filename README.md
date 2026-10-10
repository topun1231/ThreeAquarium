# ThreeAquarium

同一工程内的造景与养虾迁移版。功能和实测边界见 [MIGRATION.md](MIGRATION.md)。

## 打开和操作

双击 D:/Fish tank/打开Three.js水草缸.cmd，或访问 http://127.0.0.1:5173 。

- 拖动旋转，滚轮缩放，方向键平移，R/Esc复位、V俯视、H静观。静观时点「结束静观」或再按 H 返回。右侧「收起」可把面板让开，收起后标题下仍显示当前步骤。
- 侧栏顶部显示虾群状态：休息/摄食人数、偏饿只数、正在吃的编号、抱卵进度。点一只虾会多一行它的饥饿、压力和疲劳。
- 投喂和轻敲玻璃先点按钮对准，再点缸内或玻璃上的位置，作用在点击处。饥饿的虾会显示正在吃。
- 虾吃饱且不紧张时会抱卵，大约两分钟照料满一窝并出生一只，上限 50。数字改数量收在「直接调整数量」里，只作备用。
- 水草大约每真实一分钟过一个生态日，高度跟着长；阶段或修剪才整缸重建。整天跳跃收在「快进时间」。
- “鱼缸管理→编辑造景”切换工具。选植物/木石，再点裸露底床移动；按钮控制旋转/倾斜/埋深/移除，编辑冻结虾模拟。底床材料用 0–4 编号；坏掉的土壤类型读档时改回深棕水草土，不再停用自动保存。
- 土壤工具按住底床操作；Esc取消笔划，最近20次本页造景变更可撤销重做。
- 主菜单可新建空缸，依次完成铺土→木石→种植→注水；新建前保存上一缸。支持快进生长和局部修剪。窄屏下面板变成底栏，当前步骤和虾群状态仍显示，按钮至少约 44 像素高。
- 15秒自动保存完整状态；v4 JSON导出导入，原Unity鱼缸和对应虾JSON可同时只读导入，失败不覆盖旧档。

浏览器不写原Unity存档。浏览器存储有清除风险，长期保存请导出JSON。

## 开发

在本目录依次 npm ci、npm test、npm run build、npm start。开发用 npm run dev，先停止5173生产服务。生产读取dist，修改代码后build并刷新。服务仅绑定127.0.0.1，开发/生产共用public/assets。

gameplay/session负责完整流程和事务；tank-runtime/hardscape负责目录和支撑；substrate/soil-view负责底床；ecology/pruning负责成长/剪切；creatures/swimming/habitat负责行为/运动；population/foot-contacts/plant-contacts负责个体和动态接触；assets/crafted/water负责材质/水体；layout/editor保留M2兼容。tools有导出/转换/检查源码，复制源存档不向网页公开。来源和许可见public/assets/ATTRIBUTION.md。

## 验证与限制

Node检查见 npm test。verify-complete、verify-setup、verify-full、verify-capacity使用同一Playwright页并恢复测试前存储，结果在evidence的JSON；旧脚本是阶段历史。投喂和轻敲在检查脚本里改为直接调用落点，数量和快进需先展开对应折叠项。

RX6600/1600×900/50虾/阴影开启约60FPS。微信打包/真机、长时多机型尚未测试；跨引擎灯光和镜头不保证逐帧一致，最终画面待用户实际检查。资源约345.2MiB、dist代码约0.72MiB，不是微信首包体积。旧Unity源和游戏仍保留。
