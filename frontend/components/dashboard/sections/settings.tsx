"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Bell, Check, Globe, Key, Link2, Palette, RefreshCw, Shield, User, Zap } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHydrated } from "@/hooks/use-hydrated";
import { supportedLocales } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

const copy = {
  title: { en: "Settings", zn: "设置", vn: "Cai dat" },
  subtitle: { en: "Manage your account preferences and integrations", zn: "管理账户偏好和集成", vn: "Quan ly tuy chon tai khoan va tich hop" },
  profile: { en: "Profile", zn: "资料", vn: "Ho so" },
  preferences: { en: "Preferences", zn: "偏好", vn: "Tuy chon" },
  integrations: { en: "Integrations", zn: "集成", vn: "Tich hop" },
  security: { en: "Security", zn: "安全", vn: "Bao mat" },
  personal: { en: "Personal Information", zn: "个人信息", vn: "Thong tin ca nhan" },
  personalDesc: { en: "Update your name, role, and timezone", zn: "更新姓名、角色和时区", vn: "Cap nhat ten, vai tro va mui gio" },
  appearance: { en: "Appearance", zn: "外观", vn: "Giao dien" },
  appearanceDesc: { en: "Switch theme and language across the dashboard", zn: "切换整个仪表盘的主题和语言", vn: "Chuyen giao dien va ngon ngu tren toan dashboard" },
  alerts: { en: "Notifications", zn: "通知", vn: "Thong bao" },
  alertsDesc: { en: "Control the alerts you receive", zn: "控制你接收的提醒", vn: "Dieu chinh cac thong bao ban nhan" },
  services: { en: "Connected Services", zn: "已连接服务", vn: "Dich vu da ket noi" },
  servicesDesc: { en: "Review your active integrations", zn: "查看当前启用的集成", vn: "Xem cac tich hop dang hoat dong" },
  password: { en: "Password & Access", zn: "密码与访问", vn: "Mat khau va truy cap" },
  passwordDesc: { en: "Update your password and check active sessions", zn: "更新密码并检查活跃会话", vn: "Cap nhat mat khau va kiem tra phien dang hoat dong" },
  firstName: { en: "First Name", zn: "名字", vn: "Ten" },
  lastName: { en: "Last Name", zn: "姓氏", vn: "Ho" },
  email: { en: "Email", zn: "邮件", vn: "Email" },
  role: { en: "Role", zn: "角色", vn: "Vai tro" },
  timezone: { en: "Timezone", zn: "时区", vn: "Mui gio" },
  darkMode: { en: "Dark Mode", zn: "深色模式", vn: "Che do toi" },
  darkModeDesc: { en: "Use dark theme for the interface", zn: "为界面启用深色主题", vn: "Su dung giao dien toi" },
  language: { en: "Language", zn: "语言", vn: "Ngon ngu" },
  languageDesc: { en: "Choose the language used across the dashboard", zn: "选择整个仪表盘使用的语言", vn: "Chon ngon ngu su dung tren toan bo dashboard" },
  dealUpdates: { en: "Deal Updates", zn: "交易更新", vn: "Cap nhat giao dich" },
  teamActivity: { en: "Team Activity", zn: "团队动态", vn: "Hoat dong doi ngu" },
  forecastUpdates: { en: "Forecast Updates", zn: "预测更新", vn: "Cap nhat du bao" },
  salesforce: { en: "Salesforce", zn: "Salesforce", vn: "Salesforce" },
  hubspot: { en: "HubSpot", zn: "HubSpot", vn: "HubSpot" },
  slack: { en: "Slack", zn: "Slack", vn: "Slack" },
  connected: { en: "Connected", zn: "已连接", vn: "Da ket noi" },
  notConnected: { en: "Not connected", zn: "未连接", vn: "Chua ket noi" },
  currentPassword: { en: "Current Password", zn: "当前密码", vn: "Mat khau hien tai" },
  newPassword: { en: "New Password", zn: "新密码", vn: "Mat khau moi" },
  confirmPassword: { en: "Confirm New Password", zn: "确认新密码", vn: "Xac nhan mat khau moi" },
  updatePassword: { en: "Update Password", zn: "更新密码", vn: "Cap nhat mat khau" },
  activeSessions: { en: "Active Sessions", zn: "活跃会话", vn: "Phien dang hoat dong" },
  current: { en: "Current", zn: "当前", vn: "Hien tai" },
  revoke: { en: "Revoke", zn: "撤销", vn: "Thu hoi" },
  save: { en: "Save Changes", zn: "保存更改", vn: "Luu thay doi" },
  saving: { en: "Saving...", zn: "保存中...", vn: "Dang luu..." },
} as const;

const integrations = [
  { id: "salesforce", status: "connected" },
  { id: "hubspot", status: "connected" },
  { id: "slack", status: "connected" },
  { id: "gmail", status: "notConnected" },
] as const;

const sessions = [
  { device: "MacBook Pro", location: "San Francisco, CA", timeValue: 0, timeUnit: "second" as const, current: true },
  { device: "iPhone 15", location: "San Francisco, CA", timeValue: -2, timeUnit: "hour" as const, current: false },
];

export function SettingsSection() {
  const [activeTab, setActiveTab] = useState("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [notifyDeals, setNotifyDeals] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [notifyForecasts, setNotifyForecasts] = useState(false);
  const hydrated = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();
  const { locale, setLocale, localeLabels, formatRelativeTime } = useI18n();
  const isDarkMode = !hydrated || resolvedTheme !== "light";

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 1200);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{copy.title[locale]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="border border-border bg-secondary p-1">
          <TabsTrigger value="profile" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
            <User className="mr-2 h-4 w-4" />
            {copy.profile[locale]}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Palette className="mr-2 h-4 w-4" />
            {copy.preferences[locale]}
          </TabsTrigger>
          <TabsTrigger value="integrations" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Link2 className="mr-2 h-4 w-4" />
            {copy.integrations[locale]}
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Shield className="mr-2 h-4 w-4" />
            {copy.security[locale]}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.personal[locale]}</CardTitle>
              <CardDescription>{copy.personalDesc[locale]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 bg-secondary">
                  <AvatarFallback className="bg-accent text-lg font-semibold text-accent-foreground">JD</AvatarFallback>
                </Avatar>
                <div className="text-sm text-muted-foreground">john.doe@company.com</div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{copy.firstName[locale]}</Label>
                  <Input id="firstName" defaultValue="John" className="border-border bg-secondary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{copy.lastName[locale]}</Label>
                  <Input id="lastName" defaultValue="Doe" className="border-border bg-secondary" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{copy.email[locale]}</Label>
                  <Input id="email" defaultValue="john.doe@company.com" className="border-border bg-secondary" />
                </div>
                <div className="space-y-2">
                  <Label>{copy.role[locale]}</Label>
                  <Select defaultValue="manager">
                    <SelectTrigger className="border-border bg-secondary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Sales Manager</SelectItem>
                      <SelectItem value="rep">Sales Representative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{copy.timezone[locale]}</Label>
                <Select defaultValue="utc">
                  <SelectTrigger className="w-full border-border bg-secondary md:w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">EST</SelectItem>
                    <SelectItem value="pst">PST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.appearance[locale]}</CardTitle>
              <CardDescription>{copy.appearanceDesc[locale]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{copy.darkMode[locale]}</p>
                  <p className="text-sm text-muted-foreground">{copy.darkModeDesc[locale]}</p>
                </div>
                <Switch checked={isDarkMode} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{copy.language[locale]}</p>
                    <p className="text-sm text-muted-foreground">{copy.languageDesc[locale]}</p>
                  </div>
                </div>
                <Select value={locale} onValueChange={(value) => setLocale(value as "en" | "zn" | "vn")}>
                  <SelectTrigger className="w-[120px] border-border bg-secondary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLocales.map((item) => (
                      <SelectItem key={item} value={item}>
                        {localeLabels[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.alerts[locale]}</CardTitle>
              <CardDescription>{copy.alertsDesc[locale]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{copy.dealUpdates[locale]}</span>
                </div>
                <Switch checked={notifyDeals} onCheckedChange={setNotifyDeals} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{copy.teamActivity[locale]}</span>
                </div>
                <Switch checked={notifyTeam} onCheckedChange={setNotifyTeam} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{copy.forecastUpdates[locale]}</span>
                </div>
                <Switch checked={notifyForecasts} onCheckedChange={setNotifyForecasts} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSaving}>
              {isSaving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {copy.saving[locale]}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {copy.save[locale]}
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.services[locale]}</CardTitle>
              <CardDescription>{copy.servicesDesc[locale]}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {integrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border border-border bg-secondary/40 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15">
                        <Zap className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {integration.id === "gmail"
                            ? "Gmail"
                            : copy[integration.id as "salesforce" | "hubspot" | "slack"][locale]}
                        </p>
                        <p className="text-sm text-muted-foreground">{integration.id}</p>
                      </div>
                    </div>
                    <Badge className={integration.status === "connected" ? "border-accent/30 bg-accent/20 text-accent" : "border-border bg-muted text-muted-foreground"}>
                      {copy[integration.status][locale]}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.password[locale]}</CardTitle>
              <CardDescription>{copy.passwordDesc[locale]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{copy.currentPassword[locale]}</Label>
                <Input type="password" className="max-w-md border-border bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label>{copy.newPassword[locale]}</Label>
                <Input type="password" className="max-w-md border-border bg-secondary" />
              </div>
              <div className="space-y-2">
                <Label>{copy.confirmPassword[locale]}</Label>
                <Input type="password" className="max-w-md border-border bg-secondary" />
              </div>
              <Button variant="outline">
                <Key className="mr-2 h-4 w-4" />
                {copy.updatePassword[locale]}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base font-medium">{copy.activeSessions[locale]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.map((session) => (
                <div key={session.device} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {session.device}
                      {session.current && (
                        <Badge className="ml-2 border-accent/30 bg-accent/20 text-accent">
                          {copy.current[locale]}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.location} / {formatRelativeTime(session.timeValue, session.timeUnit)}
                    </p>
                  </div>
                  {!session.current && (
                    <Button variant="ghost" size="sm">
                      {copy.revoke[locale]}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
