# 地图 Demo 底图

范围（WGS84）：东经 121.47–121.52，北纬 31.22–31.25（上海外滩 / 陆家嘴一角）。

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `bund.pmtiles` | OSM 矢量 | OpenStreetMap，ODbL，经 [Protomaps](https://protomaps.com) 裁切 |
| `bund-sat.pmtiles` | 卫星栅格 | Sentinel-2（Copernicus 开放许可），或开发期回退到 Esri World Imagery |

仓库不提交大 PMTiles。本地生成：

```bash
npm run maps:fetch
```

没有本地文件时，地图页会回退到 OSM 栅格 + Esri 卫星瓦片，功能仍可演示。
