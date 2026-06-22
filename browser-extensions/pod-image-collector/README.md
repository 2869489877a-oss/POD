# POD 图片采集浏览器扩展

适用于 Chrome / Microsoft Edge，用来在浏览器页面内采集商品图片并下载到本地。

## 功能

- 页面内五角星悬浮按钮，可拖动，点击展开/收起采集面板。
- 按钮拖到右侧时，面板自动向左展开，避免被屏幕边缘截断。
- 自动识别网站类型：`temu`、`shein`、`pinterest`、`generic`。
- 通过浏览器下载 API 保存图片，保存到浏览器默认下载目录下的指定子文件夹。
- 已改为传输到 POD 后台图片采集库，文件会写入 `/wmsFile/pod-ai-data/collector-library/`。
- Temu：支持输入目标数量，自动点击“查看更多”，持续加载新商品图，去重后采集到目标数量或页面没有更多图片为止。
- Pinterest：支持输入目标数量，自动向下滚动加载新 Pin 图片，已经采集过的图片不会重复加入。
- SHEIN：按商品卡片提取 URL。每个商品只从上方主图区提取第一张主图，过滤底部促销条、蓝绿广告条、物流/标签/图标。SHEIN 同一原图的不同尺寸或格式会按文件名前缀去重，例如 `thumbnail_600x.webp` 和 `thumbnail_405x552.jpg` 只保留一张。
- 定时采集：支持在 Temu / SHEIN / Pinterest 三个网站中选择一个，填写目标网址、每次数量和间隔天/小时/分钟，浏览器保持打开时会自动采集并传输服务器。
- 图片加载等待：下拉、点击更多或翻页后统一等待 3 秒，再读取图片 URL，减少抓到低清晰度占位图的情况。
- JPG 统一保存：本地下载和服务器传输都会先把图片转换成 JPG；透明图片会使用白色背景。

## 安装

打开浏览器扩展页：

```text
chrome://extensions
edge://extensions
```

开启“开发者模式”，点击“加载已解压的扩展程序”，选择：

```text
C:\Users\bruce\Desktop\pod-image-collector
```

修改文件后，在扩展卡片上点击“重新加载”。

## 使用

1. 打开 Temu / SHEIN / Pinterest 页面。
2. 点击页面上的五角星悬浮按钮，或点击浏览器扩展图标。
3. 填写“保存文件夹”和“目标数量”。
4. 普通页面点击“扫描当前页”。
5. Temu 页面点击“开始 Temu 自动采集”。
6. Pinterest 页面点击“开始 Pinterest 自动采集”。
7. SHEIN 页面点击“开始 SHEIN 自动采集”。
8. 勾选需要保存的图片。
9. 点击“下载选中图片”。
10. 如果要传输服务器，填写“员工姓名”，点击“传输到服务器”。
11. 如果要定时采集，在“定时采集”里选择网站、填写目标网址、每次数量和间隔天/小时/分钟，点击“开始定时”；也可以点“立即执行”测试一次。

保存路径示例：

```text
浏览器默认下载目录/images/temu/001-image.jpg
浏览器默认下载目录/images/shein/001-image.jpg
浏览器默认下载目录/images/pinterest/001-image.jpg
```

注意：本地下载会在你填写的“本地保存文件夹”后自动追加网站目录。浏览器扩展不能直接写入任意磁盘绝对路径，只能通过浏览器下载目录保存。你可以在 Chrome / Edge 的下载设置里修改默认下载位置。

## 传输服务器

插件已经固定上传到：

```text
/wmsFile/pod-ai-data/collector-library/
```

“员工姓名”只填写员工名，例如：

```text
赵凯
张三
李四
```

上传时插件会自动追加北京时间日期目录和网站类型目录，日期格式为 `月-日`，例如 `4-23`。最终保存路径示例：

```text
/wmsFile/pod-ai-data/collector-library/赵凯/4-23/temu/001-xxx.webp
/wmsFile/pod-ai-data/collector-library/赵凯/4-23/shein/001-xxx.webp
```

如果子文件夹或日期文件夹已经存在，OSS 会直接把图片写入该前缀下；不存在时上传对象会自动形成这个目录。

## 定时采集

定时采集使用浏览器扩展后台任务执行，不需要保持采集面板打开，但 Chrome / Edge 需要保持运行。

需要填写：

```text
员工姓名
网站：Temu / SHEIN / Pinterest
目标网址
每次数量
间隔天 / 间隔小时 / 间隔分钟
```

定时任务触发后，插件会自动打开目标网址，在后台标签页采集图片并传输服务器，完成后关闭该标签页。上传路径仍然是：

```text
/wmsFile/pod-ai-data/collector-library/员工姓名/北京时间日期/网站类型/图片文件
```

定时上传会记录已经成功上传过的图片身份；同一员工、同一网站再次遇到相同图片时会跳过，不会重复传入 OSS。

如果上传时报 CORS 或网络拦截，需要在 OSS Bucket 的跨域规则里允许：

```text
AllowedOrigin: chrome-extension://你的扩展ID
AllowedMethod: PUT, OPTIONS
AllowedHeader: authorization, content-type, x-oss-date
ExposeHeader: etag, x-oss-request-id
```

Edge 如果控制台里显示的 Origin 不是 `chrome-extension://...`，就按实际 Origin 追加一条规则。内部临时使用也可以把 AllowedOrigin 设置为 `*`，但更建议限定为当前扩展 ID。
## 通用网站自动采集

当当前页面不属于 Temu / SHEIN / Pinterest 时，面板会显示“通用网站自动采集”按钮。

通用采集会按目标数量逐屏下拉，每次下拉后等待 3 秒再读取页面图片，适合普通网页、素材站或其他商品图片页面。

本地下载仍会自动追加网站目录，通用网站会保存到：

```text
浏览器下载目录/images/generic/001-xxx.jpg
```
