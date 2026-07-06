+++
title = "GEE初体验：我的第一张NDVI图"
date = 2026-07-06
tags = ["GEE", "NDVI", "Sentinel-2", "遥感入门"]
summary = "在Google Earth Engine上跑通第一段代码，计算并可视化NDVI"
+++

## 背景

NDVI（归一化植被指数）是遥感中最基础也最重要的指标之一，可以衡量地表植被健康程度。公式很简单：

NDVI = (NIR - Red) / (NIR + Red)

Sentinel-2卫星每5天重访一次，分辨率10米，免费开放——是做植被分析的理想数据源。

## 代码

在GEE Code Editor中运行以下JavaScript代码：

```javascript
var image = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterDate("2024-07-01", "2024-07-31")
  .filterBounds(ee.Geometry.Point(120.16, 33.35))
  .median();

var ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI");

Map.centerObject(image, 10);
Map.addLayer(ndvi, {
  min: 0, max: 1,
  palette: ["red", "yellow", "green"]
}, "NDVI");
```

## 结果

运行后可以看到盐城地区的NDVI分布图——绿色区域代表植被茂密（沿海滩涂湿地），红色区域代表裸地或建筑区。

## 下一步

- 计算NDVI时间序列，观察植被季节变化
- 对比不同年份NDVI，分析变化趋势  
- 将NDVI与GPP（总初级生产力）关联
