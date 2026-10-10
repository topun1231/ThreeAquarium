# Three.js migration asset credits

## Authored Anubias integrated 2026-10-10

- **Plants Anubias — Pala**: [original model](https://sketchfab.com/3d-models/plants-anubias-2ba1d06a191b437e848b81b2981a9e02), author **Pala**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Retained three original plant shapes and photographic color/alpha textures. Modifications: FBX mesh-space orientation, uniform tank-size normalization, attachment origin, lossless WebP texture conversion, shared instanced meshes, nonmetallic wet-leaf material and subtle water motion. No fabricated normal map. Source BLEND/ZIP and FBX remain retained outside the web runtime package.
- **Aquariumplants like Anubia Barteri — Nullified**: [original model](https://sketchfab.com/3d-models/aquariumplants-like-anubia-barteri-4dbbcb2abf864ee2af70ea7f2b2c691e), author **Nullified**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modifications: attached stone and scan debris removed, petioles/rhizome/fine roots locally rebuilt, border-preserving leaf decimation (198,426 original including stone → 36,205 plant triangles), uniform size and attachment origin, shared instanced meshes, original photographic color converted to lossless WebP. Leaf metalness is set to zero and roughness to 0.55 for living foliage; constant source normal image and original metallic map are not shipped. These are adapted models, not the authors' unmodified originals.

Runtime derivatives: `anubias/models.json`, `anubias/geometry.bin`, four shared `anubias/*.webp` textures. Both authors' credits and this modification record must remain with distributions.

2026-10-10 HIGH-quality package pass: albedo maps capped at 2048 (8K wood/stone → 2048) and re-encoded as method-6 WebP q=86; normals capped at 2048 and stored as lossless WebP; packed metal/roughness/AO capped at 1024, q=82. Pala leaf cards resized to 1536×2048. These are further modifications of already adapted runtime copies, not the authors' originals.

Existing approved source meshes and UVs were exported from the formal AQ_REAL002 scene. PNGs were converted to lossless WebP without changing dimensions or RGBA pixels. Unity smoothness/metallic channels are interpreted in the renderer.


---

# CP2F-A 扫描资产来源与修改说明

原资产永久保留于 AQ-ASSET001 / AQ-ASSET002；接入副本在本阶段 Imported。旧原件、旧实验场景与源文件导入设置不覆盖。

| 资产 | 作者 / 来源 | 许可 |
|---|---|---|
| Branch of Driftwood | [Arkify 3D](https://sketchfab.com/3d-models/branch-of-driftwood-5a82d7c30a5e4562ad583abff8f2e701) | CC BY 4.0 |
| Driftwood Scan | [HeartOfLines](https://sketchfab.com/3d-models/driftwood-scan-07422ed79cdd46c88aa5999486403804) | CC BY 4.0 |
| Boulder 01 | [Rico Cilliers / Poly Haven](https://polyhaven.com/a/boulder_01) | CC0 1.0 |
| Rock 07 | [Jenelle van Heerden / Poly Haven](https://polyhaven.com/a/rock_07) | CC0 1.0 |
| Rock 09 | [Jenelle van Heerden / Poly Haven](https://polyhaven.com/a/rock_09) | CC0 1.0 |
| Ground Rock 01（仅准备副本，本图未使用） | [thethieme](https://sketchfab.com/3d-models/ground-rock-01-85ff98ee7974480abdd107c17b46a645) | CC BY 4.0 |

许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。承接已核验的原件授权；本轮仅补下载同一 Poly Haven 模型的官方 4K 贴图，没有新购买。

修改：仅副本导入配置、刚体旋转、等比缩放、位置、埋入及遮挡、材质参数。网格不雕刻、不变形、不重拓扑、不删面、不生成新木石、不新增 LOD；使用作者原最高层级。原 Base Color 乘材质色以协调干湿观感，原 Normal、AO、Roughness 按实际通道接入。Roughness 数学打包为 Metallic=0、Alpha=1−Roughness，不重绘贴图。

**Arkify 原包只提供颜色图**：本轮没有伪造原始 Normal / AO / Roughness。表面沟槽由原 750,000 三角扫描几何和导入法线提供；粗糙度是明确登记的均匀参数。这项仍有完整贴图通道缺口，不能标成全套扫描 PBR 已齐。

基础底床为自制连续高度面与既有底床测试材质，只作允许范围内的承托结构；不是外部扫描自然物件。没有利用 Primitive 生成或冒充木、石、植物。

源副本散列见 SOURCE_COPIES.json；官方贴图链接、大小与 SHA-256 见 PBR_DOWNLOADS.json。所有下载先校验供应方 MD5，再写入不可覆盖的 SourceTextures；旧原件保持不变。

---

# PlantPipe001R1 来源与修改记录

R1 为用户明确授权的单株自然化迭代。旧 PlantPipe001 作为 Before 保留。

- 低模茎、独立叶卡与 2×2 叶片 Atlas：在 PlantPipe001 自制原型上修改种子参数、尺寸分布、叶缘、主脉与轻微健康叶色差；仍是自制程序资产，不冒充扫描叶片或经确认的物种。
- Planter：Thomas van den Berg / noio，MIT。直接复用 `Assets/_Aquarium/MVP001A/PlanterAuthoring/` 已安装代码，无核心修改。作者许可原件随构建保留。
- Shader 和运行时水流组件：直接引用旧 `Assets/_Aquarium/PlantPipe001/Materials/AquariumPlant.shader` 与 `Runtime/PipeMotion.cs`，没有复制改写 Shader 或新增材质体系。
- 场景、木石、灯光、水体：复制旧场景，保留引用和原署名。原始扫描资产未修改。

固定 Seed 为 200103。叶片 Young / Mature / LargeOld 为制作尺寸分类，不是新增游戏数据、物种或生长阶段。视觉是否通过须由用户判断。
