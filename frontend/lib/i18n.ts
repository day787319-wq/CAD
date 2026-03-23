export type SupportedLocale = "en" | "zn" | "vn";
export type LocaleText = Record<SupportedLocale, string>;

export const defaultLocale: SupportedLocale = "en";
export const localeStorageKey = "treasury-locale";

export const supportedLocales: SupportedLocale[] = ["en", "zn", "vn"];

export const localeLabels: Record<SupportedLocale, string> = {
  en: "EN",
  zn: "中文",
  vn: "VI",
};

export const localeTagByLocale: Record<SupportedLocale, string> = {
  en: "en-US",
  zn: "zh-CN",
  vn: "vi-VN",
};

export const htmlLangByLocale: Record<SupportedLocale, string> = {
  en: "en",
  zn: "zh-CN",
  vn: "vi",
};

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  switch ((value ?? "").toLowerCase()) {
    case "en":
    case "en-us":
      return "en";
    case "zn":
    case "zh":
    case "zh-cn":
      return "zn";
    case "vn":
    case "vi":
    case "vi-vn":
      return "vn";
    default:
      return defaultLocale;
  }
}

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "en" || value === "zn" || value === "vn";
}

export function interpolateTemplate(
  template: string,
  values: Record<string, string | number> = {},
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

const uiText: Record<string, LocaleText> = {
  "Language": { en: "Language", zn: "语言", vn: "Ngôn ngữ" },
  "Search workspace": { en: "Search workspace", zn: "搜索工作区", vn: "Tìm kiếm không gian làm việc" },
  "Treasury Console": { en: "Contract Management System", zn: "智能合约管理系统", vn: "Hệ thống quản lý hợp đồng thông minh" },
  "Automation Workspace": { en: "Contract Management System", zn: "智能合约管理系统", vn: "Hệ thống quản lý hợp đồng thông minh" },
  "Contract Management System": { en: "Contract Management System", zn: "智能合约管理系统", vn: "Hệ thống quản lý hợp đồng thông minh" },
  "Wallet Vault": { en: "Wallet Vault", zn: "钱包库", vn: "Kho ví" },
  "Template Library": { en: "Template Library", zn: "模板库", vn: "Thư viện mẫu" },
  "Run history": { en: "Run history", zn: "运行记录", vn: "Lịch sử chạy" },
  "Monitoring": { en: "Monitoring", zn: "监控", vn: "Giám sát" },
  "Plan run": { en: "Plan run", zn: "运行规划", vn: "Lập kế hoạch chạy" },
  "Create": { en: "Create", zn: "创建", vn: "Tạo mới" },
  "Delete": { en: "Delete", zn: "删除", vn: "Xóa" },
  "Delete wallet": { en: "Delete wallet", zn: "删除钱包", vn: "Xóa ví" },
  "Copy address": { en: "Copy address", zn: "复制地址", vn: "Sao chép địa chỉ" },
  "Refresh": { en: "Refresh", zn: "刷新", vn: "Làm mới" },
  "Refresh balances": { en: "Refresh balances", zn: "刷新余额", vn: "Làm mới số dư" },
  "Open wallet": { en: "Open wallet", zn: "打开钱包", vn: "Mở ví" },
  "Open wallet page": { en: "Open wallet page", zn: "打开钱包页面", vn: "Mở trang ví" },
  "Open parent wallet": { en: "Open parent wallet", zn: "打开上级钱包", vn: "Mở ví cha" },
  "Back": { en: "Back", zn: "返回", vn: "Quay lại" },
  "Cancel": { en: "Cancel", zn: "取消", vn: "Hủy" },
  "Run Automation": { en: "Run Automation", zn: "运行自动化", vn: "Chạy tự động hóa" },
  "Running...": { en: "Running...", zn: "运行中...", vn: "Đang chạy..." },
  "Checking...": { en: "Checking...", zn: "检查中...", vn: "Đang kiểm tra..." },
  "Loading...": { en: "Loading...", zn: "加载中...", vn: "Đang tải..." },
  "Loading templates...": { en: "Loading templates...", zn: "正在加载模板...", vn: "Đang tải mẫu..." },
  "Loading wallet details...": { en: "Loading wallet details...", zn: "正在加载钱包详情...", vn: "Đang tải chi tiết ví..." },
  "Wallet not found.": { en: "Wallet not found.", zn: "未找到钱包。", vn: "Không tìm thấy ví." },
  "Create template": { en: "Create template", zn: "创建模板", vn: "Tạo mẫu" },
  "Edit template": { en: "Edit template", zn: "编辑模板", vn: "Chỉnh sửa mẫu" },
  "Save template": { en: "Save template", zn: "保存模板", vn: "Lưu mẫu" },
  "Save changes": { en: "Save changes", zn: "保存更改", vn: "Lưu thay đổi" },
  "Saving...": { en: "Saving...", zn: "保存中...", vn: "Đang lưu..." },
  "Template deleted": { en: "Template deleted", zn: "模板已删除", vn: "Đã xóa mẫu" },
  "Delete failed": { en: "Delete failed", zn: "删除失败", vn: "Xóa thất bại" },
  "Template updated": { en: "Template updated", zn: "模板已更新", vn: "Đã cập nhật mẫu" },
  "Template saved": { en: "Template saved", zn: "模板已保存", vn: "Đã lưu mẫu" },
  "Wallet deleted": { en: "Wallet deleted", zn: "钱包已删除", vn: "Đã xóa ví" },
  "Wallet imported": { en: "Wallet imported", zn: "钱包已导入", vn: "Đã nhập ví" },
  "Import wallet": { en: "Import wallet", zn: "导入钱包", vn: "Nhập ví" },
  "Main wallet": { en: "Main wallet", zn: "主钱包", vn: "Ví chính" },
  "Private key": { en: "Private key", zn: "私钥", vn: "Khóa riêng" },
  "Saved wallets": { en: "Saved wallets", zn: "已保存的钱包", vn: "Ví đã lưu" },
  "Latest import": { en: "Latest import", zn: "最近导入", vn: "Lần nhập gần nhất" },
  "Importing...": { en: "Importing...", zn: "导入中...", vn: "Đang nhập..." },
  "Seed phrase": { en: "Seed phrase", zn: "助记词", vn: "Cụm từ khôi phục" },
  "Today": { en: "Today", zn: "今天", vn: "Hôm nay" },
  "Light": { en: "Light", zn: "浅色", vn: "Sáng" },
  "Dark": { en: "Dark", zn: "深色", vn: "Tối" },
  "Notifications": { en: "Notifications", zn: "通知", vn: "Thông báo" },
  "Collapse": { en: "Collapse", zn: "收起", vn: "Thu gọn" },
  "Yes": { en: "Yes", zn: "是", vn: "Có" },
  "No": { en: "No", zn: "否", vn: "Không" },
  "Unavailable": { en: "Unavailable", zn: "不可用", vn: "Không khả dụng" },
  "Off": { en: "Off", zn: "关闭", vn: "Tắt" },
  "Not set": { en: "Not set", zn: "未设置", vn: "Chưa thiết lập" },
  "Auto best route": { en: "Auto best route", zn: "自动最优路由", vn: "Tuyến tối ưu tự động" },
  "Close": { en: "Close", zn: "关闭", vn: "Đóng" },
  "Switch to light mode": { en: "Switch to light mode", zn: "切换到浅色模式", vn: "Chuyển sang chế độ sáng" },
  "Switch to dark mode": { en: "Switch to dark mode", zn: "切换到深色模式", vn: "Chuyển sang chế độ tối" },
};

export function translateText(
  locale: SupportedLocale,
  key: string,
  values?: Record<string, string | number>,
) {
  return interpolateTemplate(uiText[key]?.[locale] ?? key, values);
}

export const sectionLabels = {
  overview: { en: "Overview", zn: "总览", vn: "Tổng quan" },
  templates: { en: "Template Library", zn: "模板库", vn: "Thư viện mẫu" },
  pipeline: { en: "RPC Node Monitoring", zn: "RPC 节点监控", vn: "Giám sát nút RPC" },
  deals: { en: "Deals", zn: "交易", vn: "Giao dich" },
  customers: { en: "Customers", zn: "客户", vn: "Khach hang" },
  team: { en: "Team", zn: "团队", vn: "Doi ngu" },
  forecasting: { en: "Forecasting", zn: "预测", vn: "Du bao" },
  reports: { en: "Reports", zn: "报表", vn: "Bao cao" },
  settings: { en: "Settings", zn: "设置", vn: "Cai dat" },
} as const;

export const sectionDescriptions = {
  overview: {
    en: "Track revenue, pipeline, and team performance at a glance.",
    zn: "快速查看关键指标和自动化状态。",
    vn: "Theo dõi nhanh các chỉ số chính và trạng thái tự động hóa.",
  },
  templates: {
    en: "Create, review, and manage reusable funding templates.",
    zn: "创建、查看并管理可复用的资金模板。",
    vn: "Tạo, xem và quản lý các mẫu cấp vốn có thể tái sử dụng.",
  },
  pipeline: {
    en: "Watch live chain node status and RPC health.",
    zn: "查看链节点状态和 RPC 健康度。",
    vn: "Theo dõi trạng thái nút và sức khỏe RPC theo thời gian thực.",
  },
  deals: {
    en: "View and manage all your deals in one place.",
    zn: "在一个地方查看并管理所有交易。",
    vn: "Xem va quan ly toan bo giao dich tai mot noi.",
  },
  customers: {
    en: "Monitor customer health, revenue, and engagement.",
    zn: "跟踪客户健康度、营收和互动情况。",
    vn: "Theo doi suc khoe khach hang, doanh thu va muc do tuong tac.",
  },
  team: {
    en: "Review quota attainment and rep performance.",
    zn: "查看配额达成率和销售表现。",
    vn: "Xem ti le dat quota va hieu suat tung thanh vien.",
  },
  forecasting: {
    en: "Model revenue scenarios and forecast risk.",
    zn: "构建营收情景并评估预测风险。",
    vn: "Lap kich ban doanh thu va nhan dien rui ro du bao.",
  },
  reports: {
    en: "Explore performance trends and export reports.",
    zn: "查看趋势并导出业务报表。",
    vn: "Xem xu huong va xuat bao cao.",
  },
  settings: {
    en: "Manage preferences, alerts, and integrations.",
    zn: "管理偏好、提醒和集成。",
    vn: "Quan ly tuy chon, thong bao va tich hop.",
  },
} as const;

export const statusLabels = {
  all: { en: "All", zn: "全部", vn: "Tat ca" },
  won: { en: "Won", zn: "赢单", vn: "Thang" },
  pending: { en: "Pending", zn: "待处理", vn: "Dang cho" },
  lost: { en: "Lost", zn: "失单", vn: "Thua" },
} as const;

export const stageLabels = {
  lead: { en: "Lead", zn: "线索", vn: "Lead" },
  qualified: { en: "Qualified", zn: "已确认", vn: "Da xac nhan" },
  proposal: { en: "Proposal", zn: "方案", vn: "De xuat" },
  negotiation: { en: "Negotiation", zn: "谈判", vn: "Dam phan" },
} as const;

export const tierLabels = {
  Enterprise: { en: "Enterprise", zn: "企业级", vn: "Doanh nghiep" },
  Growth: { en: "Growth", zn: "成长型", vn: "Tang truong" },
  Starter: { en: "Starter", zn: "入门型", vn: "Khoi dau" },
} as const;

export const teamRoleLabels = {
  seniorAe: { en: "Senior AE", zn: "高级客户经理", vn: "AE cao cap" },
  accountExecutive: { en: "Account Executive", zn: "客户经理", vn: "Chuyen vien kinh doanh" },
} as const;
