"use client";

import { useState } from "react";
import {
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Filter,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { tierLabels } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

type Tier = keyof typeof tierLabels;
type Industry = "technology" | "manufacturing" | "healthcare" | "dataServices" | "finance" | "cloudServices";

const customers = [
  {
    id: 1,
    name: "Acme Corporation",
    industry: "technology" as Industry,
    tier: "Enterprise" as Tier,
    location: "San Francisco, CA",
    contact: "John Smith",
    email: "john@acme.com",
    phone: "+1 (555) 123-4567",
    totalRevenue: 485000,
    activeDeals: 3,
    healthScore: 92,
    trend: "up",
    lastContactValue: -2,
    lastContactUnit: "day" as const,
  },
  {
    id: 2,
    name: "GlobalTech Industries",
    industry: "manufacturing" as Industry,
    tier: "Enterprise" as Tier,
    location: "New York, NY",
    contact: "Sarah Johnson",
    email: "sarah@globaltech.com",
    phone: "+1 (555) 234-5678",
    totalRevenue: 320000,
    activeDeals: 2,
    healthScore: 85,
    trend: "up",
    lastContactValue: -1,
    lastContactUnit: "week" as const,
  },
  {
    id: 3,
    name: "Innovate Labs",
    industry: "healthcare" as Industry,
    tier: "Growth" as Tier,
    location: "Boston, MA",
    contact: "Michael Chen",
    email: "michael@innovatelabs.com",
    phone: "+1 (555) 345-6789",
    totalRevenue: 156000,
    activeDeals: 1,
    healthScore: 78,
    trend: "stable",
    lastContactValue: -3,
    lastContactUnit: "day" as const,
  },
  {
    id: 4,
    name: "DataStream Analytics",
    industry: "dataServices" as Industry,
    tier: "Growth" as Tier,
    location: "Austin, TX",
    contact: "Emily Rodriguez",
    email: "emily@datastream.com",
    phone: "+1 (555) 456-7890",
    totalRevenue: 98000,
    activeDeals: 2,
    healthScore: 65,
    trend: "down",
    lastContactValue: -2,
    lastContactUnit: "week" as const,
  },
  {
    id: 5,
    name: "NextGen Solutions",
    industry: "finance" as Industry,
    tier: "Starter" as Tier,
    location: "Chicago, IL",
    contact: "David Park",
    email: "david@nextgen.com",
    phone: "+1 (555) 567-8901",
    totalRevenue: 45000,
    activeDeals: 1,
    healthScore: 88,
    trend: "up",
    lastContactValue: -1,
    lastContactUnit: "day" as const,
  },
  {
    id: 6,
    name: "CloudFirst Inc",
    industry: "cloudServices" as Industry,
    tier: "Enterprise" as Tier,
    location: "Seattle, WA",
    contact: "Lisa Wang",
    email: "lisa@cloudfirst.com",
    phone: "+1 (555) 678-9012",
    totalRevenue: 275000,
    activeDeals: 4,
    healthScore: 95,
    trend: "up",
    lastContactValue: 0,
    lastContactUnit: "day" as const,
  },
];

const tierColors: Record<Tier, string> = {
  Enterprise: "border-accent/30 bg-accent/20 text-accent",
  Growth: "border-chart-1/30 bg-chart-1/20 text-chart-1",
  Starter: "border-border bg-muted text-muted-foreground",
};

const copy = {
  totalCustomers: { en: "Total Customers", zn: "客户总数", vn: "Tong khach hang" },
  totalRevenue: { en: "Total Revenue", zn: "总营收", vn: "Tong doanh thu" },
  averageHealthScore: { en: "Avg Health Score", zn: "平均健康分", vn: "Diem suc khoe TB" },
  activeDeals: { en: "Active Deals", zn: "活跃交易", vn: "Giao dich dang mo" },
  searchCustomers: { en: "Search customers...", zn: "搜索客户...", vn: "Tim khach hang..." },
  addCustomer: { en: "Add Customer", zn: "新增客户", vn: "Them khach hang" },
  revenue: { en: "Revenue", zn: "营收", vn: "Doanh thu" },
  lastContact: { en: "Last Contact", zn: "最近联系", vn: "Lien he gan nhat" },
  healthScore: { en: "Health Score", zn: "健康分", vn: "Diem suc khoe" },
  schedule: { en: "Schedule", zn: "安排", vn: "Dat lich" },
  email: { en: "Email", zn: "邮件", vn: "Email" },
  industries: {
    technology: { en: "Technology", zn: "科技", vn: "Cong nghe" },
    manufacturing: { en: "Manufacturing", zn: "制造业", vn: "San xuat" },
    healthcare: { en: "Healthcare", zn: "医疗健康", vn: "Y te" },
    dataServices: { en: "Data Services", zn: "数据服务", vn: "Dich vu du lieu" },
    finance: { en: "Finance", zn: "金融", vn: "Tai chinh" },
    cloudServices: { en: "Cloud Services", zn: "云服务", vn: "Dich vu dam may" },
  },
} as const;

export function CustomersSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const { locale, formatCurrency, formatCompactCurrency, formatRelativeTime } = useI18n();

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.contact.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = !selectedTier || customer.tier === selectedTier;
    return matchesSearch && matchesTier;
  });

  const totalRevenue = customers.reduce((accumulator, customer) => accumulator + customer.totalRevenue, 0);
  const averageHealthScore = Math.round(
    customers.reduce((accumulator, customer) => accumulator + customer.healthScore, 0) / customers.length
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          {
            label: copy.totalCustomers[locale],
            value: customers.length.toString(),
            icon: Building2,
            color: "text-foreground",
          },
          {
            label: copy.totalRevenue[locale],
            value: formatCompactCurrency(totalRevenue),
            icon: DollarSign,
            color: "text-accent",
          },
          {
            label: copy.averageHealthScore[locale],
            value: `${averageHealthScore}%`,
            icon: Star,
            color: "text-chart-3",
          },
          {
            label: copy.activeDeals[locale],
            value: customers.reduce((accumulator, customer) => accumulator + customer.activeDeals, 0).toString(),
            icon: TrendingUp,
            color: "text-chart-1",
          },
        ].map((stat, index) => (
          <Card
            key={stat.label}
            className="border-border bg-card transition-all duration-300 hover:border-muted-foreground/30"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={copy.searchCustomers[locale]}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-[280px] border-border bg-secondary pl-10 focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {(Object.keys(tierLabels) as Tier[]).map((tier) => (
              <Button
                key={tier}
                variant={selectedTier === tier ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTier(selectedTier === tier ? null : tier)}
                className={selectedTier === tier ? "bg-accent text-accent-foreground" : ""}
              >
                {tierLabels[tier][locale]}
              </Button>
            ))}
          </div>
        </div>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-2 h-4 w-4" />
          {copy.addCustomer[locale]}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filteredCustomers.map((customer, index) => (
          <Card
            key={customer.id}
            className="group border-border bg-card transition-all duration-300 hover:border-accent/50 animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${index * 75}ms` }}
          >
            <CardContent className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 bg-secondary">
                    <AvatarFallback className="bg-secondary font-semibold text-foreground">
                      {customer.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-foreground transition-colors group-hover:text-accent">
                      {customer.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {copy.industries[customer.industry][locale]}
                    </p>
                  </div>
                </div>
                <Badge className={`${tierColors[customer.tier]} border`}>
                  {tierLabels[customer.tier][locale]}
                </Badge>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {customer.location}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {customer.email}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{copy.revenue[locale]}</span>
                    <span className="font-medium text-foreground">{formatCurrency(customer.totalRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{copy.activeDeals[locale]}</span>
                    <span className="font-medium text-foreground">{customer.activeDeals}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{copy.lastContact[locale]}</span>
                    <span className="font-medium text-foreground">
                      {formatRelativeTime(customer.lastContactValue, customer.lastContactUnit)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{copy.healthScore[locale]}</span>
                  {customer.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-accent" />}
                  {customer.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${customer.healthScore}%`,
                        backgroundColor:
                          customer.healthScore >= 80
                            ? "oklch(0.7 0.18 145)"
                            : customer.healthScore >= 60
                            ? "oklch(0.75 0.18 55)"
                            : "oklch(0.65 0.2 25)",
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      customer.healthScore >= 80
                        ? "text-accent"
                        : customer.healthScore >= 60
                        ? "text-chart-3"
                        : "text-destructive"
                    )}
                  >
                    {customer.healthScore}%
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                  {copy.schedule[locale]}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {copy.email[locale]}
                </Button>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
