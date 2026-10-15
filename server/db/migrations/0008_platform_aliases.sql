-- 区域别名并到通用平台：红白机 / NES 记作 nes，超任 / SNES 记作 sfc，世嘉五代 /
-- MD / Genesis 记作 megadrive。
--
-- 这三个叫法本来各占一条平台记录（同一台硬件、同一套扩展名与核心），结果是分类
-- 筛选里同一台机器出现两项，其中一项一盘游戏都没有；同一款游戏一半标 nes、一半标
-- famicom 时还不能互为版本。平台表里只留通用名之后，历史数据在这里一起并过去：
-- 上传目录按平台分，但 ROM 记录上存的是完整文件路径（file_path），所以改平台不会
-- 影响已上传文件的读取。
UPDATE `roms` SET `platform` = 'nes' WHERE `platform` = 'famicom';
--> statement-breakpoint
UPDATE `roms` SET `platform` = 'sfc' WHERE `platform` = 'snes';
--> statement-breakpoint
UPDATE `roms` SET `platform` = 'megadrive' WHERE `platform` = 'genesis';
