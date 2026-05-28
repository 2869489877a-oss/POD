export type NavItem = {
  title: string;
  href: string;
  description: string;
};

export const navItems: NavItem[] = [
  {
    title: "仪表盘",
    href: "/dashboard",
    description: "查看批处理流程概览",
  },
  {
    title: "素材库",
    href: "/assets",
    description: "管理已上传素材",
  },
  {
    title: "上传图片",
    href: "/upload",
    description: "上传待处理原图",
  },
  {
    title: "图片采集",
    href: "/image-collector",
    description: "配置网站来源并批量采集图片",
  },
  {
    title: "图片任务",
    href: "/image-jobs",
    description: "批量图片处理任务",
  },
  {
    title: "印花提取",
    href: "/print-extraction",
    description: "提取透明底印花图",
  },
  {
    title: "一键抠图",
    href: "/cutout",
    description: "批量移除图片背景",
  },
  {
    title: "套图模板",
    href: "/mockup-templates",
    description: "固定商品套图模板",
  },
  {
    title: "套图任务",
    href: "/mockup-jobs",
    description: "批量生成商品套图",
  },
  {
    title: "商品草稿",
    href: "/products",
    description: "管理待导出的商品",
  },
  {
    title: "AI 生成",
    href: "/ai-generate",
    description: "生成标题、描述和标签",
  },
  {
    title: "导出",
    href: "/exports",
    description: "导出 Excel 和图片 ZIP",
  },
  {
    title: "设置",
    href: "/settings",
    description: "系统基础设置",
  },
];
