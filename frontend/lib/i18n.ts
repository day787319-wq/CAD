export type SupportedLocale = "en" | "zn" | "vn";

export const defaultLocale: SupportedLocale = "en";

export const supportedLocales: SupportedLocale[] = ["en", "zn", "vn"];

export const localeLabels: Record<SupportedLocale, string> = {
  en: "EN",
  zn: "ZN",
  vn: "VN",
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

export const sectionLabels = {
  overview: { en: "Overview", zn: "概览", vn: "Tong quan" },
  pipeline: { en: "RPC Node Monitoring", zn: "RPC节点监控", vn: "Giam sat RPC Node" },
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
    zn: "快速查看营收、管道和团队表现。",
    vn: "Theo doi doanh thu, pipeline va hieu suat doi ngu trong mot man hinh.",
  },
  pipeline: {
    en: "Manage deal flow across every stage.",
    zn: "管理每个阶段的交易流转。",
    vn: "Quan ly luong giao dich o tung giai doan.",
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
